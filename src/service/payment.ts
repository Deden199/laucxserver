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

// ─── Internal checkout page hosts ──────────────────────────────────
const checkoutHosts = [
  'https://checkout1.launcx.com',
  'https://altcheckout.launcx.com',
  'https://payment.launcx.com',
  'https://c1.launcx.com',
];
const pickRandomHost = () =>
  checkoutHosts[Math.floor(Math.random() * checkoutHosts.length)];


export interface Transaction {
  merchantName: string;       // “gv” / “hilogate” / …
  price: number;
  buyer: string;
  flow?: 'embed' | 'redirect';
  playerId?: string;
}
export interface OrderRequest {
  amount: number;
  userId: string;
  playerId?: string;    // Optional: username/ID pemain di platform mereka
}
export interface OrderResponse {
  orderId: string;
  checkoutUrl: string;
  qrPayload?: string;
  playerId?: string;
  totalAmount: number;
  expiredTs?: string;         // optional, jika ingin masa kedaluwarsa
}
/* ═════════════ 1. Direct Transaction (GV / Netz / Hilogate) ═════════════ */
export const createTransaction = async (
  request: Transaction
): Promise<OrderResponse> => {
  const mName = request.merchantName.toLowerCase();
  // gunakan price sebagai jumlah input asli
  const amount = Number(request.price);
  // gunakan playerId jika ada, jika tidak fallback ke buyer
  const pid = request.playerId ?? request.buyer;

  // ─── Hilogate branch ───────────────────────────────────
  if (mName === 'hilogate') {
    // 1) Cari internal merchant Hilogate
    const merchantRec = await prisma.merchant.findFirst({
      where: { name: 'hilogate' }
    });
    if (!merchantRec) {
      throw new Error('Internal Hilogate merchant not found');
    }

    // 2) Simpan transaction_request
    const trx = await prisma.transaction_request.create({
      data: {
        merchantId:    merchantRec.id,
        subMerchantId: '',
    buyerId:       request.buyer, // partner-client
    playerId:      pid,           // username gamer        
    amount,                   // original amount
    status:        'PENDING',
        settlementAmount: amount, // sementara sama dengan amount
      },
    });
    const refId = trx.id;

    // 3) Panggil API Hilogate
    const apiResp = await HilogateClient.createTransaction({
      ref_id: refId,
      method: 'qris',
      amount,                   // tetap kirim jumlah original
    });
    const outer = apiResp.data;
    const qrString = outer.data.qr_string;

    // 4) Simpan audit log
    await prisma.transaction_response.create({
      data: {
        referenceId:  refId,
        responseBody: apiResp,
        playerId:     pid,
      },
    });

    // 5) Build internal checkout URL
    const host = pickRandomHost();
    const checkoutUrl = `${host}/order/${refId}`;

    // 6) Hitung fee Launcx & settlementAmount
    //    pakai request.buyer sebagai partnerClient.id
    const pc = await prisma.partnerClient.findUnique({
      where: { id: request.buyer }
    });
    if (!pc) {
      console.warn(
        `PartnerClient ${request.buyer} not found, fee set to 0`
      );
    }
    const feeLauncx = pc
      ? Math.round(amount * (pc.feePercent / 100) + pc.feeFlat)
      : 0;
    // settlementAmt = amount original – feeLauncx
    const settlementAmt = amount - feeLauncx;

    // 7) Simpan ke tabel order untuk dashboard client
    await prisma.order.create({
      data: {
        id:               refId,
        userId:           request.buyer,
        merchantId:       request.buyer,
        playerId:         pid,
        amount,                    // original input amount
        channel:          'hilogate',
        status:           'PENDING',
        qrPayload:        qrString,
        checkoutUrl,
        feeLauncx,                 // Launcx fee
        fee3rdParty:      0,
        settlementAmount: settlementAmt, // setelah dipotong Launcx fee
      },
    });

    // 8) Return response ke client
    return {
      orderId:     refId,
      checkoutUrl,
      qrPayload:   qrString,
      playerId:    pid,
      totalAmount: amount,      // original input
      // expiredTs: outer.expires_at, // tambahkan jika perlu
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
// export const createOrder = async (
//   payload: OrderRequest
// ): Promise<OrderResponse> => {
//   // 0) Tentukan pid: fallback ke userId jika playerId tidak dikirim
//   const pid         = payload.playerId ?? payload.userId;
//   const totalAmount = payload.amount;
//   const forced      = config.api.forceProvider?.toLowerCase() || null;

//   // List of internal checkout hosts
//   const checkoutHosts = [
//     'https://checkout1.launcx.com',
//     'https://altcheckout.launcx.com',
//     'https://payment.launcx.com',
//     'https://c1.launcx.com',
//   ];
//   const pickRandomHost = () =>
//     checkoutHosts[Math.floor(Math.random() * checkoutHosts.length)];

//   // ─── Forced = Hilogate ───────────────────────────────
//   if (forced === 'hilogate') {
//     // 1) Direct Transaction via Hilogate
//     const direct = await createTransaction({
//       merchantName: 'hilogate',
//       price:        totalAmount,
//       buyer:        payload.userId,
//       playerId:     pid,
//       flow:         'embed',  // kita embed, build URL manual
//     });

//     const { orderId, qrPayload } = direct;
//     const host        = pickRandomHost();
//     const checkoutUrl = `${host}/order/${orderId}`;

//     // 2) Hitung fee & settlement
//     const pc = await prisma.partnerClient.findUnique({ where: { id: payload.userId } });
//     if (!pc) throw new Error('PartnerClient tidak ditemukan');
//     const feeLauncx        = Math.round(totalAmount * (pc.feePercent / 100) + pc.feeFlat);
//     const settlementAmount = totalAmount - feeLauncx;

//     // 3) Simpan ke tabel order (termasuk playerId)
//     await prisma.order.create({
//       data: {
//         id:               orderId,
//         userId:           payload.userId,
//         merchantId:       payload.userId,
//         playerId:         pid,
//         amount:           totalAmount,
//         channel:          'hilogate',
//         status:           'PENDING',
//         qrPayload,
//         checkoutUrl,
//         feeLauncx,
//         fee3rdParty:      0,
//         settlementAmount,
//       },
//     });

//     // 4) Kembalikan response
//     return { orderId, checkoutUrl, qrPayload, playerId: pid, totalAmount };
//   }

//   // ─── Aggregated flow ─────────────────────────────────
//   // 1) Ambil provider aktif
//   const providers = await getActiveProvidersForClient(payload.userId);
//   if (!providers.length)
//     throw new Error(`No active payment channels for user ${payload.userId}`);

//   // 2) Pilih provider (override / random)
//   const channel = forced
//     ? providers.find(p => p.name.toLowerCase() === forced)
//     : providers[Math.floor(Math.random() * providers.length)]!;
//   if (!channel)
//     throw new Error(`Provider override "${forced}" tidak tersedia`);

//   // 3) Generate orderId & QR/URL
//   const orderId = generateRandomId();
//   let qrPayload: string | undefined;
//   let checkoutUrl: string;
//   if (channel.supportsQR && channel.generateQR) {
//     qrPayload   = await channel.generateQR({ orderId, amount: totalAmount });
//     checkoutUrl = `${pickRandomHost()}/order/${orderId}`;
//   } else {
//     checkoutUrl = await channel.generateCheckoutUrl({ orderId, amount: totalAmount });
//   }

//   // 4) Hitung fee & settlement
//   const pc2 = await prisma.partnerClient.findUnique({ where: { id: payload.userId } });
//   if (!pc2) throw new Error('PartnerClient tidak ditemukan');
//   const feeLauncx2        = Math.round(totalAmount * (pc2.feePercent / 100) + pc2.feeFlat);
//   const settlementAmount2 = totalAmount - feeLauncx2;

//   // 5) Simpan ke tabel order
//   await prisma.order.create({
//     data: {
//       id:               orderId,
//       userId:           payload.userId,
//       merchantId:       payload.userId,
//       playerId:         pid,
//       amount:           totalAmount,
//       channel:          channel.name,
//       status:           'PENDING',
//       qrPayload,
//       checkoutUrl,
//       feeLauncx:        feeLauncx2,
//       fee3rdParty:      0,
//       settlementAmount: settlementAmount2,
//     },
//   });

//   // 6) Kembalikan response
//   return { orderId, checkoutUrl, qrPayload, playerId: pid, totalAmount };
// };

/* ═════════════ 5. Get Order ═════════════ */
export const getOrder = async (id: string) => prisma.order.findUnique({ where: { id } });

const paymentService = {
  createTransaction,
  transactionCallback,
  checkPaymentStatus,
  // createOrder,
  getOrder,
};
export default paymentService;
