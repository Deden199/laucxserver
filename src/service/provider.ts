/* ───────────────────────── src/service/provider.ts ───────────────────────── */
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../core/prisma';  // tambahkan ini
import { HilogateClient, HilogateConfig } from '../service/hilogateClient';
import { OyClient, OyConfig } from '../service/oyClient';
import { sub_merchant as SubMerchant } from '@prisma/client';
import { isJakartaWeekend } from '../util/time'

/* ═════════════════════════ Helpers ═════════════════════════ */
interface RawSub {
  id: string
  provider: 'hilogate' | 'oy'
  fee: number
  credentials: unknown    // nanti kita cast
  schedule: unknown       // nanti kita cast
}

export interface ResultSub<C> {
  id:       string        // ← ID sub_merchant
  provider: string
  fee: number
  config: C
}

const decode2c2p = (raw: any, secret: string): any =>
  raw?.payload ? jwt.verify(raw.payload, secret) : raw;

const firstQRGroup = (opt: any) => {
  for (const cat of opt.channelCategories ?? [])
    for (const grp of cat.groups ?? [])
      if (
        typeof grp.code === 'string' &&
        grp.code.toUpperCase().includes('QR')
      )
        return { category: cat, group: grp };
  return null;
};

const extractQR = (p: any): string | null =>
  typeof p.data === 'string'
    ? p.data
    : typeof p.qrString === 'string'
    ? p.qrString
    : typeof p.qrImageUrl === 'string'
    ? p.qrImageUrl
    : typeof p.data?.qrString === 'string'
    ? p.data.qrString
    : typeof p.data?.qrImageUrl === 'string'
    ? p.data.qrImageUrl
    : null;

// overload untuk Hilogate
export async function getActiveProviders(
  merchantId: string,
  provider: 'hilogate'
): Promise<ResultSub<HilogateConfig>[]>

// overload untuk OY
export async function getActiveProviders(
  merchantId: string,
  provider: 'oy'
): Promise<ResultSub<OyConfig>[]>

// implementasi
export async function getActiveProviders(
  merchantId: string,
  provider: 'hilogate' | 'oy'
): Promise<Array<ResultSub<HilogateConfig> | ResultSub<OyConfig>>> {
  const isWeekend = isJakartaWeekend(new Date())

  // full match kedua flag
  const scheduleFilter = isWeekend
    ? { weekday: false, weekend: true }
    : { weekday: true,  weekend: false }

  // 1) ambil dari DB
  const subs = await prisma.sub_merchant.findMany({
    where: {
      merchantId,
      provider,
      schedule: { equals: scheduleFilter }
    },
    select: {
      id:          true,
      provider:    true,
      fee:         true,
      credentials: true,
      schedule:    true
    }
  })

 // 2) map & cast
return subs.map(s => {
  // common fields untuk kedua provider
  const common = {
    id:       s.id,
    provider: s.provider,
    fee:      s.fee,
  }

  const raw = s.credentials as unknown as {
    merchantId: string
    env?:       'sandbox' | 'live' | 'production'
    secretKey:  string
  }

  if (provider === 'hilogate') {
    const cfg: HilogateConfig = {
      merchantId: raw.merchantId,
      env:        raw.env ?? 'sandbox',
      secretKey:  raw.secretKey,
    }
    return {
      ...common,
      config: cfg
    } as ResultSub<HilogateConfig>
  } else {
    const cfg: OyConfig = {
      baseUrl:  process.env.OY_BASE_URL!,
      username: raw.merchantId,
      apiKey:   raw.secretKey,
    }
    return {
      ...common,
      config: cfg
    } as ResultSub<OyConfig>
  }
})
}


/* ═════════════ Interface Provider ═════════════ */

export interface Provider {
  name: string;
  supportsQR: boolean;
  generateQR?: (p: { amount: number; orderId: string }) => Promise<string>;
  generateCheckoutUrl: (p: { amount: number; orderId: string }) => Promise<string>;
}

/* ═══════════ List provider aktif ═══════════ */

export async function getActiveProvidersForClient(
  merchantId: string
): Promise<Provider[]> {
  const hilogateSubs = await getActiveProviders(merchantId, 'hilogate');
  const oySubs = await getActiveProviders(merchantId, 'oy');

  return [
    /* ──── Hilogate ──── */
    {
      name: 'hilogate',
      supportsQR: true,
      async generateQR({ orderId, amount }) {
        if (!hilogateSubs.length) throw new Error('No active Hilogate credentials');
const raw = hilogateSubs[0].config as {
  merchantId: string;
  env:        'sandbox' | 'live';
  secretKey:  string;
};

const cfg: HilogateConfig = {
  merchantId: raw.merchantId,
  secretKey:  raw.secretKey,
  env:        raw.env,
};
const client = new HilogateClient(cfg);
        const res = await client.createTransaction({ ref_id: orderId, amount });
        return res.qr_code;
      },
      async generateCheckoutUrl({ orderId, amount }) {
        if (!hilogateSubs.length) throw new Error('No active Hilogate credentials');
        const cfg = hilogateSubs[0].config as unknown as HilogateConfig;
        const client = new HilogateClient(cfg);
        const res = await client.createTransaction({ ref_id: orderId, amount });
        return res.checkout_url;
      },
    },

    /* ──── OY E-Wallet ──── */
    {
      name: 'oy',
      supportsQR: false,
      async generateCheckoutUrl({ orderId, amount }) {
        if (!oySubs.length) throw new Error('No active OY credentials');
        const cfg = oySubs[0].config as unknown as OyConfig;
        const client = new OyClient(cfg);
        const resp = await client.createEwallet({
          customer_id: orderId,
          partner_trx_id: orderId,
          amount,
          ewallet_code: 'DANA',
        });
        return resp.checkout_url;
      },
    },

    /* ──── Netzme (stub) ──── */
    {
      name: 'netzme',
      supportsQR: true,
      generateQR: async ({ orderId }) => `NETZME_QR_${orderId}`,
      generateCheckoutUrl: async () => {
        throw new Error('generateCheckoutUrl tidak didukung untuk Netzme');
      },
    },

    /* ──── 2C2P Direct-QR ──── */
    ((): Provider => {
      const envVar = (k: string) => {
        const v = process.env[k];
        if (!v) throw new Error(`${k} not set in .env`);
        return v;
      };
      const mID = envVar('TCPP_MERCHANT_ID');
      const sk = envVar('TCPP_SECRET_KEY');
      const cID = envVar('TCPP_CLIENT_ID');
      const curr = envVar('TCPP_CURRENCY');
      const URLs = {
        token: envVar('TCPP_PAYMENT_TOKEN_URL'),
        option: envVar('TCPP_PAYMENT_OPTION_URL'),
        detail: envVar('TCPP_PAYMENT_OPTION_DETAILS_URL'),
        dopay: envVar('TCPP_DO_PAYMENT_URL'),
      };
      const returnUrl = `${config.api.baseUrl}:${config.api.port}/api/v1/transaction/callback`;

      return {
        name: '2c2p',
        supportsQR: true,
        async generateQR({ amount, orderId }) {
          const invoiceNo = orderId.replace(/\D/g, '').slice(0, 20) || `${Date.now()}`;
          const token = jwt.sign(
            {
              merchantID: mID,
              invoiceNo,
              description: `Pembayaran ${orderId}`,
              amount,
              currencyCode: curr,
              paymentChannel: ['QR'],
              backendReturnUrl: returnUrl,
            },
            sk,
            { algorithm: 'HS256' }
          );

          const tokenData = decode2c2p((await axios.post(URLs.token, { payload: token })).data, sk);
          if (tokenData.respCode !== '0000') throw new Error(tokenData.respDesc);

          const optData = decode2c2p(
            (
              await axios.post(URLs.option, {
                paymentToken: tokenData.paymentToken,
                clientID: cID,
                locale: 'en',
              })
            ).data,
            sk
          );
          const sel = firstQRGroup(optData);
          if (!sel) throw new Error('QR channel tidak tersedia');

          const det = decode2c2p(
            (
              await axios.post(URLs.detail, {
                paymentToken: tokenData.paymentToken,
                clientID: cID,
                locale: 'en',
                categoryCode: sel.category.code,
                groupCode: sel.group.code,
              })
            ).data,
            sk
          );

          const code = det.channels?.[0]?.payment?.code?.channelCode || sel.group.code;
          const doResp = decode2c2p(
            (
              await axios.post(URLs.dopay, {
                paymentToken: tokenData.paymentToken,
                clientID: cID,
                locale: 'en',
                responseReturnUrl: returnUrl,
                clientIP: '127.0.0.1',
                payment: { code: { channelCode: code }, data: {} },
              })
            ).data,
            sk
          );

          if (!['0000', '1005'].includes(doResp.respCode)) throw new Error(doResp.respDesc);
          const qr = extractQR(doResp);
          if (!qr) throw new Error('QR tidak ditemukan');
          return qr;
        },
        async generateCheckoutUrl() {
          throw new Error('Not implemented');
        },
      };
    })(),
  ];
}
