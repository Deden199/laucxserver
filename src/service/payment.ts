import { Request } from 'express';
import { netzGetTransactionSignAxiosInstance, netzGetQRAxiosInstance } from '../core/netz.axios';
import { brevoAxiosInstance } from '../core/brevo.axios';
import { prisma } from '../core/prisma';
import logger from '../logger';
import TokenService from './token';
import { generateRandomId, getRandomNumber } from '../util/random';
import { getCurrentDate, getNestedValue } from '../util/util';
import { sendTelegramMessage } from '../core/telegram.axios';



const createTransaction = async (request: Transaction) => {

    //TODO: Make subMerchantId dynamic
    const merchantPhoneNo = request.merchantName;
    let subMerchantId;
    let merchant;
    try {
      merchant = await prisma.merchant.findFirst({
        where: {
          phoneNumber: merchantPhoneNo,
        },
        include: {
          subMerchants: true,  // Include all related sub_merchants
        },
      });
      if (!merchant) {
        logger.error(`Merchant ${merchantPhoneNo} not found`)
        throw new Error(`Merchant ${merchantPhoneNo} not found`)
      }
      const totalSubMerchant = merchant.subMerchants.length
      let subMerchant = merchant.subMerchants[getRandomNumber(totalSubMerchant - 1)]
      if (!subMerchant) {
        logger.error(`Submerchant ${merchantPhoneNo} not found`)
        throw new Error(`Submerchant ${merchantPhoneNo} not found`)
      }

      subMerchantId = subMerchant.netzMerchantId;

    } catch (error) {
        logger.error(error);
        throw new Error('Merchant not found')
    }

    let transactionObj;
    try {
        const amount : number  = Number(request.price);
        transactionObj = await prisma.transaction_request.create({
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
        logger.error("create Transaction to db error")
        logger.error(error);
        throw new Error('Failed to store Transaction Request');
      }

    logger.info('JSON.stringify(transactionObj) ' + JSON.stringify(transactionObj));
    logger.info('transactionObj.id ' + transactionObj.id);

    // call midtrans
    const partnerReferenceNo = transactionObj.id
    let netzSignResponse;
    let netzSignResponse2;

    try {
        const tokenService = TokenService.getInstance();
        const token = await tokenService.getToken();

        const amount = {
            value: request.price,
            currency: "IDR"
        }

        const netzRequest = {
            custIdMerchant: subMerchantId,
            partnerReferenceNo: partnerReferenceNo,
            amount: amount,
            amountDetail: {
                basicAmount: amount,
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
    


        netzSignResponse2 = await netzGetQRAxiosInstance.post('', netzRequest,{
            headers: {
              'X-SIGNATURE': transactionSign, // Adding the variable to the headers
              'X-EXTERNAL-ID': `${generateRandomId(32)}`,
              'X-TIMESTAMP': currentDate,
              'Authorization': `Bearer ${token}`
            },
          }
        );

        // Store the entire body in the database using Prisma
        await prisma.transaction_response.create({
            data: {
                referenceId: partnerReferenceNo || "",
                responseBody: netzSignResponse2.data, // Store the entire request body as JSON
            },
        });


        const data = netzSignResponse2.data.additionalInfo;
        const result = {
            qrImage : data.qrImage,
            totalAmount: data.totalAmount,
            expiredTs: data.expiredTs,
            referenceNo : partnerReferenceNo,
        };
        return result;
    
    } catch(error) {
        logger.error(error)
        logger.error('Failed to create netz transaction signature for referenceId ' + transactionObj.id);
        throw new Error('Failed to create netz transaction signature for referenceId ' + transactionObj.id);
    }
}

const transactionCallback = async (request: Request) => {
  try {
    // Extract the entire request body
    const requestBody = request.body || {};

    // Store the entire body in the database using Prisma
    const newTransaction = await prisma.transaction_callback.create({
      data: {
        referenceId: requestBody.originalPartnerReferenceNo || null,
        requestBody: requestBody, // Store the entire request body as JSON
      },
    });

    const transaction = await prisma.transaction_request.findFirst({
        where : {
            id: requestBody.originalPartnerReferenceNo
        },
        include: {
          merchant: true,  // Include all related sub_merchants
        },
    })

    if (!transaction) {
      throw new Error('Error transaction not found:' + requestBody.originalPartnerReferenceNo)
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
    const recipient = [{email}]
    const body = {
      to: recipient,
      templateId: 1,
      params: {
          amount: requestBody.amount.value,
          name: "TBD"
      }
    }
    
    const brevoResponse = await brevoAxiosInstance.post('', body);
    logger.info(brevoResponse.data)


    return;
  } catch (error) {
    // Handle errors and send an error response
    logger.error('Error storing transaction:', error);
    throw new Error('Error storing transaction:' + error);
  }
};

const checkPaymentStatus = async (request: Request) => {
  try {
    // Extract the entire request body
    const requestBody = request.body || {};

    // Store the entire body in the database using Prisma
    const callback = await prisma.transaction_callback.findFirst({
      where: {
        referenceId: request.params.referenceId
      }
    });

    const response = {
      status : 'IN_PROGRESS'
    }

    if (callback && callback.referenceId) {
      response.status = 'DONE'
      return response
    }
    return response
  } catch (error) {
    // Handle errors and send an error response
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
