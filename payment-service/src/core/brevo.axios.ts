import axios from 'axios';
import { config } from '../config';

const brevoCfg = (config.api && (config.api as any).brevo) || { url: '', apiKey: '' };

const createBrevoHeaders = () => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'api-key': brevoCfg.apiKey,
});

const brevoAxiosInstance = axios.create({
  baseURL: brevoCfg.url,
  headers: createBrevoHeaders(),
});

export { brevoAxiosInstance };