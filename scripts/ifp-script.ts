import axios, { AxiosRequestConfig } from 'axios';
import * as Crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import { PrismaClient, DisbursementStatus } from '@prisma/client';
import { sendTelegramMessage } from '../src/core/telegram.axios';
import disbursementService from "../src/service/disbursement";

dotenv.config();
const prisma = new PrismaClient();

// Define constants
const CLIENT_ID = 'MCPD2410140068';
const SIGNATURE = 'zzv9iaMh5oUIeNGTqxhWdT0PAZ50OFfOhKRvLWgaCvk2rTBNIo2NSBsi/O5cNbEdWMUtH0JbeKWpJ/QtIrOJJLFgSVjYlC0GxxecLCCFJ2wInWB4FSfC16IoZov9wEM1AM49pI/uQa4Ej++8WDv3atQP0YgRij+Ymk6D1lLnaCtucFxTjUJvKzVtVdDSTygiv+RWPlO/JFN7q7v54cpJs2HRWaUwY4fwuxSbuTojtCSxGCyONVw2xhZrrtMgf62acC/SVwffLdVV0WqaB5Tp6KapX4ig0UJsRCee19cYROt1y4MW0oNbkJgDuVaEAQzNVg5r48VHM0hEqsitxgU+6g==';
const clientSecret = '3f2e29b6e4624e07';
const SENMO_DNS = 'https://api.senmo.id';
const ALLOWED_ACTION = ['balance', 'account', 'transfer', 'history', 'detail'] as const;

interface FinanceData {
  IFP_ACCOUNT_NO: string;
  WITHDRAWAL_FEE: number;
}

const FINANCE_DATA: FinanceData = {
  IFP_ACCOUNT_NO: '10530030916',
  WITHDRAWAL_FEE: 5000,
};

// Function to generate current date with the format "YYYY-MM-DDTHH:mm:ss+07:00"
function generateCurrentTimestamp(): string {
  const date = new Date();
  const offset = 7 * 60 * 60 * 1000;
  const localTime = new Date(date.getTime() + offset);
  const dateString = localTime.toISOString().split('.')[0];
  return `${dateString}+07:00`;
}

// Function to generate a numeric timestamp (Unix time in milliseconds)
function generateNumericTimestamp(): string {
  return Date.now().toString();
}

// Function to generate X-SIGNATURE
function generateSignature(
    httpMethod: string,
    endPointUrl: string,
    accessToken: string,
    payload: object | null,
    timeStamp: string,
    clientSecret: string
): string {
  const payloadMinify = payload ? JSON.stringify(payload) : '';
  const payloadHex = Crypto.createHash('sha256').update(payloadMinify).digest('hex').toLowerCase();
  const stringToSign = `${httpMethod.toUpperCase()}:${endPointUrl}:${accessToken}:${payloadHex}:${timeStamp}`;
  return Crypto.createHmac('sha512', clientSecret).update(stringToSign).digest('base64');
}

// First request to get the access token
async function getAccessToken(currentTimestamp: string): Promise<string> {
  try {
    const options: AxiosRequestConfig = {
      method: 'POST',
      url: `${SENMO_DNS}/api/v1.0/access-token/b2b`,
      headers: {
        'Content-Type': 'application/json',
        'X-TIMESTAMP': currentTimestamp,
        'X-CLIENT-KEY': CLIENT_ID,
        'X-SIGNATURE': SIGNATURE,
      },
      data: {
        grantType: 'client_credentials',
      },
    };

    const response = await axios(options);
    const accessToken: string = response.data.accessToken;
    console.log('Access Token Signature:', accessToken);

    return accessToken;
  } catch (error) {
    console.error('Error fetching access token:', error);
    throw error;
  }
}

// Function to send a POST request with dynamic X-SIGNATURE
async function sendPostRequest(
    timestamp: string,
    accessToken: string,
    url: string,
    body: object
): Promise<void> {
  try {
    const numericTimestamp = generateNumericTimestamp();

    const options: AxiosRequestConfig = {
      method: 'POST',
      url: url,
      headers: {
        'Content-Type': 'application/json',
        'X-TIMESTAMP': timestamp,
        'X-SIGNATURE': '',
        'X-PARTNER-ID': CLIENT_ID,
        'X-EXTERNAL-ID': numericTimestamp,
        'CHANNEL-ID': 'api',
        Authorization: `Bearer ${accessToken}`,
      },
      data: body,
    };

    const httpMethod = options.method!;
    const endPointUrl = new URL(options.url!).pathname;

    const xSignature = generateSignature(httpMethod, endPointUrl, accessToken, body, timestamp, clientSecret);

    if (options.headers) {
      options.headers['X-SIGNATURE'] = xSignature;
    }

    const response = await axios(options);
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error in sending POST request:', error);
  }
}

// Function for balance inquiry
async function balanceInquiry(timestamp: string, accessToken: string): Promise<void> {
  try {
    const partnerReferenceNo = uuidv4();
    const url = `${SENMO_DNS}/api/v1.0/balance-inquiry`;
    const body = {
      partnerReferenceNo: partnerReferenceNo,
      accountNo: FINANCE_DATA.IFP_ACCOUNT_NO,
      balanceType: 'cash',
    };
    await sendPostRequest(timestamp, accessToken, url, body);
  } catch (error) {
    console.error('Error processing balanceInquiry:', error);
  }
}

// Function for account inquiry
async function accountInquiry(timestamp: string, accessToken: string, merchantId: string): Promise<void> {
  try {

    const merchant = await prisma.merchant.findFirst({
      where: {
        id: merchantId
      },
      include: {
        disbursement_accounts: true
      }
    });
    if (merchant) {
      const disbursementAccount = merchant.disbursement_accounts[0]
      const partnerReferenceNo = uuidv4();
      const url = `${SENMO_DNS}/api/v1.0/account-inquiry-external`;
      const body = {
        partnerReferenceNo: partnerReferenceNo,
        beneficiaryBankCode: disbursementAccount.bankCode,
        beneficiaryAccountNo: disbursementAccount.accountNo,
      };
      await sendPostRequest(timestamp, accessToken, url, body);
    }
  } catch (error) {
    console.error('Error processing accountInquiry:', error);
  }
}

// Function for interbank transfer
async function transferInterbank(timestamp: string, accessToken: string, merchantId: string, amount: string): Promise<void> {
  let referenceNo;
  let disbursementAccount;

  try {
    const merchant = await prisma.merchant.findFirst({
      where: {
        id: merchantId
      },
      include: {
        disbursement_accounts: true
      }
    });

    if (!merchant || !merchant.disbursement_accounts[0]) {
      console.log("merchant or disbursement account not found:", merchantId);
      return;
    }
    disbursementAccount = merchant.disbursement_accounts[0]

    if (!disbursementAccount) {
      console.log("disbursement account not found:", merchantId);
      return;
    } else {
      const disbursementDoc = await prisma.disbursement.create({
        data: {
          merchantId: merchantId, // Replace with actual merchant ID
          amount: BigInt(amount), // The amount for the transaction
          createdAt: new Date(),
          beneficiary: {
            accountName: disbursementAccount.accountName,
            accountNumber: disbursementAccount.accountNo,
            bankCode: disbursementAccount.bankCode,
          },
          totalAmount: BigInt(amount) + BigInt(FINANCE_DATA.WITHDRAWAL_FEE),
          transferFee: BigInt(FINANCE_DATA.WITHDRAWAL_FEE),
          status: DisbursementStatus.CREATED, // Set the status, e.g., PENDING, COMPLETED, or FAILED
        },
      });

      if (disbursementDoc) {
        referenceNo = disbursementDoc.id;
      } else {
        throw Error("Unable to fetch disbursementDoc.id");
      }
      console.log("Withdrawal Created:", disbursementDoc);
    }
  } catch (error) {
    console.error("Error creating withdrawal:", error);
  }


  try {
    if (disbursementAccount) {
      const partnerReferenceNo = referenceNo;
      const url = `${SENMO_DNS}/api/v1.1/transfer-interbank`;
      const body = {
        partnerReferenceNo: partnerReferenceNo,
        amount: {
          value: parseFloat(amount).toFixed(2),
          currency: 'IDR',
        },
        beneficiaryAccountName: disbursementAccount.accountName,
        beneficiaryAccountNo: disbursementAccount.accountNo,
        beneficiaryBankCode: disbursementAccount.bankCode,
        beneficiaryEmail: 'c@launcx.com',
        currency: 'IDR',
        sourceAccountNo: FINANCE_DATA.IFP_ACCOUNT_NO,
        transactionDate: generateCurrentTimestamp(),
        feeType: 'OUR',
        customerReference: 'Settlement',
        additionalInfo: {
          remark: 'Settlement',
          senderPlaceOfBirth: '3402',
          senderDateOfBirth: '1999-04-16',
          senderIdentityType: 'bank account',
          senderName: 'Settlement',
          senderAddress: 'Settlement',
          senderIdentityNo: 'Settlement',
          senderJob: 'employee',
          direction: 'DOMESTIC',
          transactionPurpose: '3',
          beneficiaryCountry: 'ID',
          beneficiaryCity: '3173',
          senderCountry: 'ID',
          senderCity: '3171',
        },
      };
      await sendPostRequest(timestamp, accessToken, url, body);
    }
  } catch (error) {
    console.error('Error processing transferInterbank:', error);
  }

  try {
    if (disbursementAccount) {
      const withdrawal = await prisma.disbursement.update({
        where: {id: referenceNo},
        data: {status: DisbursementStatus.PENDING}
      });
      await sendTelegramMessage("-4531864100", `Disbursement to ${disbursementAccount.accountName} Rp${amount}`)
      console.log("Withdrawal updated to PENDING:", withdrawal);
    }
  } catch (error) {
    console.error("Error creating withdrawal:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Function for account history
async function accountHistory(timestamp: string, accessToken: string, startDate: string, endDate: string): Promise<void> {
  try {
    const partnerReferenceNo = uuidv4();
    const url = `${SENMO_DNS}/api/v1.0/transaction-history-list`;
    const body = {
      fromDateTime: `${startDate}T00:00:00+07:00`,
      toDateTime: `${endDate}T23:59:00+07:00`,
    };
    await sendPostRequest(timestamp, accessToken, url, body);
  } catch (error) {
    console.error('Error processing accountHistory:', error);
  }
}

// Function for transaction history detail
async function historyDetail(timestamp: string, accessToken: string, referenceNo: string): Promise<void> {
  try {
    const partnerReferenceNo = uuidv4();
    const url = `${SENMO_DNS}/api/v1.0/transaction-history-detail`;
    const body = {
      originalPartnerReferenceNo: referenceNo,
    };
    await sendPostRequest(timestamp, accessToken, url, body);
  } catch (error) {
    console.error('Error processing historyDetail:', error);
  }
}

// Main function to generate timestamp and call the requested action
(async () => {
  try {
    const param = process.argv[2];
    if (!ALLOWED_ACTION.includes(param as typeof ALLOWED_ACTION[number])) {
      console.log(`${param} not allowed`);
      return;
    }

    const currentTimestamp =  "2024-10-08T00:52:34+07:00"
    const accessToken = await getAccessToken(currentTimestamp);

    if (param === 'balance') {
      await balanceInquiry(currentTimestamp, accessToken);
    } else if (param === 'account') {
      const merchantId = process.argv[3]
      if (!merchantId) {
        console.log('merchantId required');
        return;
      }
      await accountInquiry(currentTimestamp, accessToken, merchantId);
    } else if (param === 'transfer') {
      const merchantId = process.argv[3]
      const amount = process.argv[4]
      if (!merchantId || !amount) {
        console.log('merchantId and amount required');
        return;
      }
      await transferInterbank(currentTimestamp, accessToken, merchantId, amount);
    } else if (param === 'history') {
      const startDate = process.argv[3];
      const endDate = process.argv[4];
      await accountHistory(currentTimestamp, accessToken, startDate, endDate);
    } else if (param === 'detail') {
      const referenceNo = process.argv[3];
      await historyDetail(currentTimestamp, accessToken, referenceNo);
    }
  } catch (error) {
    console.error('Error executing the requests:', error);
  }
})();
