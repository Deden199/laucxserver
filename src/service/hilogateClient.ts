// File: src/core/hilogateClient.ts
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

  /** Validasi signature callback Hilogate: MD5(request_body + secretKey) */
  public verifyCallback(rawBody: string, signature: string): boolean {
    const expected = crypto
      .createHash('md5')
      .update(rawBody + this.secretKey)
      .digest('hex');
    return expected === signature;
  }

  /** Validasi rekening bank */
  public async validateAccount(account_number: string, bank_code: string): Promise<any> {
    return this.request('post', '/api/v1/bank-accounts/validate', { account_number, bank_code });
  }

  /** Internal request helper */
  private async request(
    method: 'get' | 'post' | 'patch',
    path: string,
    body: any = null
  ): Promise<any> {
    const signature = this.sign(path, body);
    const res = await this.axiosInst.request({ 
      method, 
      url: path, 
      headers: { 'X-Signature': signature }, 
      data: body 
    });
    return res.data;
  }

  /** Buat transaksi QRIS */
  public async createTransaction(opts: {
    ref_id: string;
    amount: number;
    method?: string;
  }): Promise<any> {
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

public async createWithdrawal(payload: {
  ref_id:             string;
  amount:             number;
  currency:           string;
  account_number:     string;
  account_name:       string;
  account_name_alias: string;
  bank_code:          string;
  bank_name:          string;
  branch_name:        string;
  description:        string;
}): Promise<any> {
  return this.request('post', '/api/v1/withdrawals', payload);
}
}

export default new HilogateClient();