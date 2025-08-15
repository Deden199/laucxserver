import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';

const router = Router();

interface ProxyOptions {
  stripPrefix?: boolean;
}

function createProxy(target: string, options: ProxyOptions = {}) {
  const { stripPrefix = false } = options;

  return async (req: Request, res: Response) => {
    try {
      const path = stripPrefix ? req.url : req.originalUrl;
      const url = `${target}${path}`;

      const response: AxiosResponse = await axios({
        url,
        method: req.method as any,
        data: req.body,
        params: req.query,
        headers: { ...req.headers, host: undefined },
        validateStatus: () => true,
      });

      res.status(response.status).set(response.headers).send(response.data);
    } catch (err: any) {
      const status = err?.response?.status || 500;
      const data = err?.response?.data || { error: 'Gateway error' };
      res.status(status).send(data);
    }
  };
}

const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:5001',
  admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:5002',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:5003',
  withdrawal: process.env.WITHDRAWAL_SERVICE_URL || 'http://localhost:5200',
};

// Auth related services
router.use('/auth', createProxy(services.auth));
router.use('/client', createProxy(services.auth));

// Payment service
router.use('/payment', createProxy(services.payment));
router.use('/transactions', createProxy(services.payment));

// Withdrawal service
router.use('/withdrawals', createProxy(services.withdrawal));

// Admin service (strip /admin prefix before forwarding)
router.use('/admin', createProxy(services.admin, { stripPrefix: true }));

export default router;

