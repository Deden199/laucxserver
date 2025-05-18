import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';

const BASE = config.api.hilogate.baseUrl;  // e.g. https://app.hilogate.com

class HilogateClient {
  private axiosInst = axios.create({
    baseURL: BASE,
    headers: {
      'Content-Type':  'application/json',
      'X-Merchant-ID': config.api.hilogate.merchantId,
      'X-Environment': config.api.hilogate.env,
    },
  });
  private secretKey = config.api.hilogate.secretKey;

  /** Hitung MD5 signature sesuai docs v1.4 */
  private sign(path: string, body: any = null): string {
    const payload = body
      ? `${path}${JSON.stringify(body)}${this.secretKey}`
      : `${path}${this.secretKey}`;
    return crypto.createHash('md5').update(payload).digest('hex');
  }

  /** Internal request helper */
  private async request(
    method: 'get' | 'post' | 'patch',
    path: string,
    body: any = null
  ): Promise<any> {
    const signature = this.sign(path, body);
    const headers = { 'X-Signature': signature };
    const res = await this.axiosInst.request({ method, url: path, headers, data: body });
    return res.data;
  }

  /** Buat transaksi QRIS */
  public async createTransaction(opts: { ref_id: string; amount: number; method?: string }): Promise<any> {
    return this.request(
      'post',
      '/api/v1/transactions',
      { ref_id: opts.ref_id, amount: opts.amount, method: opts.method || 'qris' }
    );
  }

  /** Ambil status transaksi dari Hilogate */
  public async getTransaction(ref_id: string): Promise<any> {
    return this.request('get', `/api/v1/transactions/${ref_id}`);
  }

  /** Inisiasi atau retry payout/disbursement */
  public async initiateDisbursement(payload: {
    ref_id: string;
    amount: number;
    beneficiary: {
      account_number: string;
      account_name: string;
      bank_code: string;
    };
  }): Promise<any> {
    return this.request('post', '/api/v1/disbursements', payload);
  }
}

export default new HilogateClient();