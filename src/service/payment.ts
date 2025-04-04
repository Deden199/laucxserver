import { Request } from 'express';
import { netzGetTransactionSignAxiosInstance, netzGetQRAxiosInstance } from '../core/netz.axios';
import { brevoAxiosInstance } from '../core/brevo.axios';
import { prisma } from '../core/prisma';
import logger from '../logger';
import TokenService from './token';
import { generateRandomId, getRandomNumber } from '../util/random';
import { getCurrentDate, getNestedValue } from '../util/util';
import { sendTelegramMessage } from '../core/telegram.axios';
import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';

export interface Transaction {
  merchantName: string; // Untuk GV, gunakan "gv" atau "gudangvoucher"
  price: number;
  buyer: string;
}

const createTransaction = async (request: Transaction) => {
  // Jika transaksi untuk GudangVoucher (GV)
  if (
    request.merchantName.toLowerCase() === 'gv' ||
    request.merchantName.toLowerCase() === 'gudangvoucher'
  ) {
    // --- BAGIAN INTEGRASI GUDANGVOUCHER (GV) ---
    // Simpan transaksi ke DB untuk auditing (opsional, karena struktur GV bisa berbeda)
    let transactionObj;
    try {
      const amount: number = Number(request.price);
      transactionObj = await prisma.transaction_request.create({
        data: {
          // Karena GV tidak terkait langsung dengan merchant lokal, set nilainya sesuai kebutuhan
          merchantId: 0,
          subMerchantId: '',
          buyerId: request.buyer || "",
          amount: amount,
          status: "CREATED",
          settlementAmount: amount, // Bisa disesuaikan per perhitungan GV
        },
      });
    } catch (error) {
      logger.error("Failed to store GV Transaction Request");
      logger.error(error);
      throw new Error('Failed to store Transaction Request for GV');
    }

    // Siapkan parameter untuk GV
    const merchantId = config.api.gudangvoucher.merchantId;
    const merchantKey = config.api.gudangvoucher.merchantKey;
    const qrisUrl = config.api.gudangvoucher.qrisUrl;

    const custom = `GVQ${Date.now()}`; // Reference unik
    // Gunakan callbackUrl dari config dan convert ke hex sesuai dokumentasi GV
    const custom_redirect = Buffer.from(config.api.callbackUrl).toString('hex');
    const amount = request.price;
    const product = 'transaksi-produk'; // Ubah sesuai kebutuhan
    const email = request.buyer;

    // Signature: md5(merchantId + amount + merchantKey + custom)
    const signatureString = `${merchantId}${amount}${merchantKey}${custom}`;
    const signature = crypto.createHash('md5').update(signatureString).digest('hex');

    // Siapkan data form dengan format x-www-form-urlencoded
    const formData = new URLSearchParams();
    formData.append('merchantid', merchantId);
    formData.append('custom', custom);
    formData.append('amount', amount.toString());
    formData.append('product', product);
    formData.append('email', email);
    formData.append('custom_redirect', custom_redirect);
    formData.append('page', 'JSON');
    formData.append('signature', signature);

    try {
      const response = await axios.post(qrisUrl, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const data = response.data;
      if (data.status_code === '00') {
        return data;
      } else {
        throw new Error(data.status_desc || 'GudangVoucher payment failed');
      }
    } catch (error: any) {
      throw new Error(error.message || 'Error processing GudangVoucher payment');
    }
  }

  // --- BAGIAN INTEGRASI PROVIDER LAIN (misal: Netz) ---
  const merchantPhoneNo = request.merchantName;
  let subMerchantId;
  let merchant;
  try {
    merchant = await prisma.merchant.findFirst({
      where: {
        phoneNumber: merchantPhoneNo,
      },
      include: {
        subMerchants: true,
      },
    });
    if (!merchant) {
      logger.error(`Merchant ${merchantPhoneNo} not found`);
      throw new Error(`Merchant ${merchantPhoneNo} not found`);
    }
    const totalSubMerchant = merchant.subMerchants.length;
    let subMerchant = merchant.subMerchants[getRandomNumber(totalSubMerchant - 1)];
    if (!subMerchant) {
      logger.error(`Submerchant ${merchantPhoneNo} not found`);
      throw new Error(`Submerchant ${merchantPhoneNo} not found`);
    }
    subMerchantId = subMerchant.netzMerchantId;
  } catch (error) {
    logger.error(error);
    throw new Error('Merchant not found');
  }

  let transactionObjNetz;
  try {
    const amount: number = Number(request.price);
    transactionObjNetz = await prisma.transaction_request.create({
      data: {
        merchantId: merchant.id,
        subMerchantId: subMerchantId,
        buyerId: request.buyer || "",
        amount: amount,
        status: "CREATED",
        settlementAmount: Math.floor(amount * (1 - merchant.mdr))
      },
    });
  } catch (error) {
    logger.error("create Transaction to db error");
    logger.error(error);
    throw new Error('Failed to store Transaction Request');
  }

  logger.info('Transaction object: ' + JSON.stringify(transactionObjNetz));
  logger.info('transactionObjNetz.id: ' + transactionObjNetz.id);

  // Panggil API Netz untuk QRIS
  const partnerReferenceNo = transactionObjNetz.id;
  let netzSignResponse;
  let netzSignResponse2;
  try {
    const tokenService = TokenService.getInstance();
    const token = await tokenService.getToken();

    const amountObj = {
      value: request.price,
      currency: "IDR"
    };

    const netzRequest = {
      custIdMerchant: subMerchantId,
      partnerReferenceNo: partnerReferenceNo,
      amount: amountObj,
      amountDetail: {
        basicAmount: amountObj,
        shippingAmount: {
          value: "0",
          currency: "IDR"
        }
      },
      payMethod: "QRIS",
      commissionPercentage: "0",
      expireInSecond: "3600",
      feeType: "on_seller",
      apiSource: "topup_deposit",
      additionalInfo: {
        email: "testabc@gmail.com",
        notes: "desc",
        description: "description",
        phoneNumber: "+6281765558018",
        fullname: "Tester"
      }
    };

    const currentDate = getCurrentDate();
    netzSignResponse = await netzGetTransactionSignAxiosInstance.post('', netzRequest, {
      headers: {
        'X-TIMESTAMP': currentDate,
        'AccessToken': `Bearer ${token}`,
      }
    });
    const transactionSign = netzSignResponse.data.signature;

    netzSignResponse2 = await netzGetQRAxiosInstance.post('', netzRequest, {
      headers: {
        'X-SIGNATURE': transactionSign,
        'X-EXTERNAL-ID': `${generateRandomId(32)}`,
        'X-TIMESTAMP': currentDate,
        'Authorization': `Bearer ${token}`
      },
    });

    // Simpan response ke database
    await prisma.transaction_response.create({
      data: {
        referenceId: partnerReferenceNo || "",
        responseBody: netzSignResponse2.data,
      },
    });

    const data = netzSignResponse2.data.additionalInfo;
    const result = {
      qrImage: data.qrImage,
      totalAmount: data.totalAmount,
      expiredTs: data.expiredTs,
      referenceNo: partnerReferenceNo,
    };
    return result;
  } catch (error) {
    logger.error(error);
    logger.error('Failed to create netz transaction signature for referenceId ' + transactionObjNetz.id);
    throw new Error('Failed to create netz transaction signature for referenceId ' + transactionObjNetz.id);
  }
};

const transactionCallback = async (request: Request) => {
  try {
    const requestBody = request.body || {};

    const newTransaction = await prisma.transaction_callback.create({
      data: {
        referenceId: requestBody.originalPartnerReferenceNo || null,
        requestBody: requestBody,
      },
    });

    const transaction = await prisma.transaction_request.findFirst({
      where: {
        id: requestBody.originalPartnerReferenceNo
      },
      include: {
        merchant: true,
      },
    });

    if (!transaction) {
      throw new Error('Error transaction not found:' + requestBody.originalPartnerReferenceNo);
    }

    await prisma.transaction_request.update({
      where: {
        id: requestBody.originalPartnerReferenceNo
      },
      data: {
        status: 'SUCCESS'
      }
    });

    try {
      if (getNestedValue(transaction, 'merchant.telegram')) {
        const amount = transaction.amount;
        const userId = transaction.buyerId;
        const settlementAmount = transaction.settlementAmount;
        const buyerName = getNestedValue(requestBody, 'additionalInfo.qrDetail.buyerFullname');
        const paymentTime = getNestedValue(requestBody, 'additionalInfo.paymentTime');
        const message = `User Id : ${userId}\nAmount : ${amount}\nSettlement Amount : ${settlementAmount}\nBuyer Name : ${buyerName}\nPayment Time : ${paymentTime}`;
        await sendTelegramMessage(getNestedValue(transaction, 'merchant.telegram'), message);
      }
    } catch (error) {
      logger.error('Error sending telegram:', error);
    }

    const email = transaction.merchant.email;
    const recipient = [{ email }];
    const body = {
      to: recipient,
      templateId: 1,
      params: {
        amount: requestBody.amount.value,
        name: "TBD"
      }
    };

    const brevoResponse = await brevoAxiosInstance.post('', body);
    logger.info(brevoResponse.data);
    return;
  } catch (error) {
    logger.error('Error storing transaction:', error);
    throw new Error('Error storing transaction:' + error);
  }
};

const checkPaymentStatus = async (request: Request) => {
  try {
    const requestBody = request.body || {};
    const callback = await prisma.transaction_callback.findFirst({
      where: {
        referenceId: request.params.referenceId
      }
    });

    const response = {
      status: 'IN_PROGRESS'
    };

    if (callback && callback.referenceId) {
      response.status = 'DONE';
      return response;
    }
    return response;
  } catch (error) {
    logger.error('Error storing transaction:', error);
    throw new Error('Error storing transaction:' + error);
  }
};

const paymentService = {
  createTransaction,
  transactionCallback,
  checkPaymentStatus
};

export default paymentService;
