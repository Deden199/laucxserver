import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth';
import { listLogs } from '../controller/log.controller';

const r = Router();

r.use(requireAdminAuth);

r.get('/', listLogs);

export default r;
