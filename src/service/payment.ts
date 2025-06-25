import { Request } from 'express';
import {
  netzGetTransactionSignAxiosInstance,
  netzGetQRAxiosInstance,
} from '../core/netz.axios';
import { brevoAxiosInstance } from '../core/brevo.axios';
import { prisma } from '../core/prisma';
import logger from '../logger';
import TokenService from './token';
import { generateRandomId, getRandomNumber } from '../util/random';
import { getCurrentDate } from '../util/util';
import { sendTelegramMessage } from '../core/telegram.axios';
import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';
import { getActiveProvidersForClient, Provider } from './provider';
import HilogateClient from './hilogateClient';

export interface Transaction {
  merchantName: string; // “gv” / “gudangvoucher” / “netzme” / “hilogate”
  price: number;
  buyer: string;
}
export interface OrderRequest {
  amount: number;
  userId: string;
}
export interface OrderResponse {
  orderId: string;
  checkoutUrl: string;
  qrPayload?: string;
}

/* ═════════════ 1. Direct Transaction (GV / Netz / Hilogate) ═════════════ */
export const createTransaction = async (request: Transaction) => {
  const mName = request.merchantName.toLowerCase();
  const amount = Number(request.price);

  // —— Hilogate branch —— 
  if (mName === 'hilogate') {
    // 1) Cari merchant internal
    const merchantRec = await prisma.merchant.findFirst({
      where: { name: 'hilogate' },
    });
    if (!merchantRec) {
      throw new Error('Internal Hilogate merchant not found');
    }

    // 2) Simpan transaction_request (ID otomatis valid ObjectID)
    const trx = await prisma.transaction_request.create({
      data: {
        merchantId: merchantRec.id,
        subMerchantId: '',
        buyerId: request.buyer || '',
        amount,
        status: 'PENDING',
        settlementAmount: amount,
      },
    });
    const refId = trx.id;

    // 3) Panggil API Hilogate
    //    HilogateClient.createTransaction() meng-`return res.data`
    const apiResp = await HilogateClient.createTransaction({
      ref_id: refId,
      method: 'qris',
      amount,
    });

    // 4) Extrak payload sesuai spec v1.4:
    //    - apiResp.data → outer “data” object
    //    - apiResp.data.data → nested object dengan qr_string :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}
    const outer = apiResp.data;
    const nested = outer.data;
    const qrString = nested.qr_string;

    // 5) Simpan audit log
    await prisma.transaction_response.create({
      data: {
        referenceId: refId,
        responseBody: apiResp,
      },
    });

    // 6) Kembalikan properti yang sudah benar
    return {
      qrImage:     qrString,
      totalAmount: outer.amount,
      expiredTs:   outer.expires_at,
      referenceNo: outer.ref_id,
    };
  }
  // —— GV branch —— 
  if (mName === 'gv' || mName === 'gudangvoucher') {
    let transactionObj;
    try {
      transactionObj = await prisma.transaction_request.create({
        data: {
          merchantId: '0',
          subMerchantId: '',
          buyerId: request.buyer || '',
          amount,
          status: 'PENDING',
          settlementAmount: amount,
        },
      });
    } catch (error) {
      logger.error('Failed to store GV Transaction Request', error);
      throw new Error('Failed to store Transaction Request for GV');
    }

    const { merchantId, merchantKey, qrisUrl } = config.api.gudangvoucher as any;
    const custom = `GVQ${Date.now()}`;
    const custom_redirect = Buffer.from(config.api.callbackUrl).toString('hex');
    const sig = crypto
      .createHash('md5')
      .update(`${merchantId}${amount}${merchantKey}${custom}`)
      .digest('hex');

    const formData = new URLSearchParams({
      merchantid: merchantId,
      custom,
      amount: amount.toString(),
      product: 'transaksi-produk',
      email: request.buyer,
      custom_redirect,
      page: 'JSON',
      signature: sig,
    });

    try {
      const { data } = await axios.post(qrisUrl, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (data.status_code === '00') return data;
      throw new Error(data.status_desc || 'GudangVoucher payment failed');
    } catch (err: any) {
      throw new Error(err.message || 'Error processing GudangVoucher payment');
    }
  }

  // —— Netz branch —— 
  const merchantPhoneNo = request.merchantName;
  let subMerchantId: string;
  let merchant: any;
  try {
    merchant = await prisma.merchant.findFirst({
      where: { phoneNumber: merchantPhoneNo },
      include: { subMerchants: true },
    });
    if (!merchant) throw new Error(`Merchant ${merchantPhoneNo} not found`);
    const sub = merchant.subMerchants[getRandomNumber(merchant.subMerchants.length - 1)];
    if (!sub) throw new Error(`Submerchant ${merchantPhoneNo} not found`);
    subMerchantId = sub.netzMerchantId;
  } catch (error) {
    logger.error(error);
    throw new Error('Merchant not found');
  }

  let transactionObjNetz;
  try {
    transactionObjNetz = await prisma.transaction_request.create({
      data: {
        merchantId: merchant.id,
        subMerchantId,
        buyerId: request.buyer || '',
        amount,
        status: 'PENDING',
        settlementAmount: Math.floor(amount * (1 - merchant.mdr)),
      },
    });
  } catch (error) {
    logger.error('create Transaction to db error', error);
    throw new Error('Failed to store Transaction Request');
  }

  const partnerReferenceNo = transactionObjNetz.id;
  try {
    const token = await TokenService.getInstance().getToken();
    const amountObj = { value: request.price, currency: 'IDR' };
    const netzRequest = {
      custIdMerchant: subMerchantId,
      partnerReferenceNo,
      amount: amountObj,
      amountDetail: { basicAmount: amountObj, shippingAmount: { value: '0', currency: 'IDR' } },
      payMethod: 'QRIS',
      commissionPercentage: '0',
      expireInSecond: '3600',
      feeType: 'on_seller',
      apiSource: 'topup_deposit',
      additionalInfo: {
        email: 'testabc@gmail.com',
        notes: 'desc',
        description: 'description',
        phoneNumber: '+6281765558018',
        fullname: 'Tester',
      },
    };
    const ts = getCurrentDate();
    const { data: signRes } = await netzGetTransactionSignAxiosInstance.post(
      '', netzRequest,
      { headers: { 'X-TIMESTAMP': ts, AccessToken: `Bearer ${token}` } }
    );
    const { signature } = signRes;
    const { data: qrRes } = await netzGetQRAxiosInstance.post(
      '', netzRequest,
      {
        headers: {
          'X-SIGNATURE': signature,
          'X-EXTERNAL-ID': generateRandomId(32),
          'X-TIMESTAMP': ts,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    await prisma.transaction_response.create({
      data: { referenceId: partnerReferenceNo, responseBody: qrRes },
    });
    const info = qrRes.additionalInfo;
    return {
      qrImage: info.qrImage,
      totalAmount: info.totalAmount,
      expiredTs: info.expiredTs,
      referenceNo: partnerReferenceNo,
    };
  } catch (error) {
    logger.error(error);
    throw new Error(`Failed to create netz transaction signature for referenceId ${partnerReferenceNo}`);
  }
};

/* ═════════════ 2. Callback handler (signature + idempotensi) ═════════════ */
export const transactionCallback = async (request: Request) => {
  // langsung baca payload yang sudah ter-parse di controller
  const body = request.body;

  // Hilogate callback
  if (body.data?.ref_id) {
    const refId = body.data.ref_id;

    // simpan callback sekali saja
    const exists = await prisma.transaction_callback.findFirst({
      where: { referenceId: refId },
    });
    if (!exists) {
      await prisma.transaction_callback.create({
        data: { referenceId: refId, requestBody: body },
      });
      // update transaksi
      const status = body.data.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
      await prisma.transaction_request.update({
        where: { id: refId },
        data: { status },
      });
    }

    // notifikasi (telegram / email) tetap di sini
    try {
      const tx = await prisma.transaction_request.findUnique({
        where: { id: refId },
      });
      const merch = tx
        ? await prisma.merchant.findUnique({ where: { id: tx.merchantId } })
        : null;
      if (merch?.telegram) {
        const msg = [
          `Reference ID : ${refId}`,
          `Amount       : ${body.data.amount}`,
          `Status       : ${body.data.status}`,
        ].join('\n');
        await sendTelegramMessage(merch.telegram, msg);
      }
      if (merch?.email) {
        await brevoAxiosInstance.post('', {
          to: [{ email: merch.email }],
          templateId: 1,
          params: { amount: body.data.amount, status: body.data.status },
        });
      }
    } catch (err) {
      logger.error('Notification error', err);
    }

    return;
  }
  /* ─── 2C2P callback ─── */
  const sigHeader = request.headers['x-2c2p-signature'] as string | undefined;
  if (sigHeader) {
    const raw = JSON.stringify(body);
    const exp = crypto.createHmac('sha256', config.api.tcpp.secretKey).update(raw).digest('hex');
    if (sigHeader !== exp) throw new Error('Invalid 2C2P signature');
    const refId2 = body.originalPartnerReferenceNo || body.invoiceNo || body.referenceNo;
    if (!refId2) throw new Error('Missing 2C2P referenceId');
    const exists2 = await prisma.transaction_callback.findFirst({ where: { referenceId: refId2 } });
    if (!exists2) {
      await prisma.transaction_callback.create({ data: { referenceId: refId2, requestBody: body } });
      const status = body.respCode === '0000' ? 'SUCCESS' : 'FAILED';
      await prisma.transaction_request.update({ where: { id: refId2 }, data: { status } });
    }
    return;
  }
};

/* ═════════════ 3. Check Payment Status (with inquiry) ═════════════ */
export const checkPaymentStatus = async (req: Request) => {
  const refId = req.params.id || req.params.referenceId;
  const order = await prisma.order.findUnique({ where: { id: refId } });
  if (order) {
    if (order.status === 'PENDING') {
      const providers = await getActiveProvidersForClient(order.userId);
      const prov = providers.find(p => p.name === order.channel) as any;
      if (prov?.checkStatus) {
        const newStat = await prov.checkStatus({ providerInvoice: order.id });
        if (newStat !== order.status) {
          await prisma.order.update({ where: { id: refId }, data: { status: newStat } });
          order.status = newStat;
        }
      }
    }
    return { status: order.status };
  }
  const cb = await prisma.transaction_callback.findFirst({ where: { referenceId: refId } });
  return { status: cb ? 'DONE' : 'IN_PROGRESS' };
};

/* ═════════════ 4. Create Aggregated Order ═════════════ */
export const createOrder = async (payload: OrderRequest): Promise<OrderResponse> => {
  const forced = config.api.forceProvider?.toLowerCase() || null;

  // ─── Forced = Hilogate ───
  if (forced === 'hilogate') {
    const direct = await createTransaction({
      merchantName: 'hilogate',
      price:        payload.amount,
      buyer:        payload.userId,
    });
    const { qrImage, totalAmount, referenceNo } = direct;
    const checkoutUrl = `${config.api.baseUrl}/api/v1/checkout/${referenceNo}`;

    // Platform fee only
    const pc = await prisma.partnerClient.findUnique({ where: { id: payload.userId } });
    if (!pc) throw new Error('PartnerClient tidak ditemukan');
    const feePlatform = Math.round(totalAmount * (pc.feePercent / 100) + pc.feeFlat);
    const settlementAmount = totalAmount - feePlatform;

    await prisma.order.create({
      data: {
        id:               referenceNo,
        userId:           payload.userId,
        merchantId:       payload.userId,
        amount:           totalAmount,
        channel:          'hilogate',
        status:           'PENDING',
        qrPayload:        qrImage,
        checkoutUrl,
        feeLauncx:        feePlatform,
        fee3rdParty:      0,
        settlementAmount,
      }
    });

    return { orderId: referenceNo, qrPayload: qrImage, checkoutUrl };
  }

  // ─── Aggregated flow ───
  const providers = await getActiveProvidersForClient(payload.userId);
  if (!providers.length) throw new Error(`No active payment channels for user ${payload.userId}`);

  // Choose provider by override or randomly
  let channel = forced
    ? providers.find(p => p.name.toLowerCase() === forced)
    : providers[Math.floor(Math.random() * providers.length)];
  if (!channel) throw new Error(`Provider override "${forced}" tidak tersedia`);

  // Generate QR or checkout URL
  const orderId = generateRandomId();
  let qrPayload: string | undefined;
  let checkoutUrl: string;
  if (channel.supportsQR && channel.generateQR) {
    qrPayload = await channel.generateQR({ orderId, amount: payload.amount });
    checkoutUrl = `${config.api.baseUrl}/api/v1/checkout/${orderId}`;
  } else {
    checkoutUrl = await channel.generateCheckoutUrl({ orderId, amount: payload.amount });
  }

  // Platform fee
  const pc = await prisma.partnerClient.findUnique({ where: { id: payload.userId } });
  if (!pc) throw new Error('PartnerClient tidak ditemukan');
  const feePlatform = Math.round(payload.amount * (pc.feePercent / 100) + pc.feeFlat);

  // Gateway fee from ClientPG junction
  // 1) lookup PGProvider by name
  const pg = await prisma.pGProvider.findUnique({ where: { name: channel.name } });
  if (!pg) throw new Error(`PGProvider ${channel.name} tidak ditemukan`);
  // 2) lookup clientPG
  const cp = await prisma.clientPG.findUnique({
    where: { clientId_pgProviderId: { clientId: pc.id, pgProviderId: pg.id } }
  });
  const feeGateway = cp ? Math.round(payload.amount * (cp.clientFee / 100)) : 0;

  // Total fee & settlement
  const totalFee = feePlatform + feeGateway;
  const settlementAmount = payload.amount - totalFee;

  await prisma.order.create({
    data: {
      id:               orderId,
      userId:           payload.userId,
      merchantId:       payload.userId,
      amount:           payload.amount,
      channel:          channel.name,
      status:           'PENDING',
      qrPayload,
      checkoutUrl,
      feeLauncx:        feePlatform,
      fee3rdParty:      feeGateway,
      settlementAmount,
    }
  });

  return { orderId, checkoutUrl, qrPayload };
};



/* ═════════════ 5. Get Order ═════════════ */
export const getOrder = async (id: string) => prisma.order.findUnique({ where: { id } });

const paymentService = {
  createTransaction,
  transactionCallback,
  checkPaymentStatus,
  createOrder,
  getOrder,
};
export default paymentService;
