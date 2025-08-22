import express from 'express';
import dashboardRoutes from './route/dashboard.routes';
import merchantRoutes from './route/merchant.routes';
import pgProviderRoutes from './route/pgProvider.routes';
import ipWhitelistRoutes from './route/ipWhitelist.routes';
import totpRoutes from './route/totp.routes';

const app = express();
app.use(express.json());

app.use('/dashboard', dashboardRoutes);
app.use('/merchants', merchantRoutes);
app.use('/pg-providers', pgProviderRoutes);
app.use('/ip-whitelist', ipWhitelistRoutes);
app.use('/2fa', totpRoutes);

export default app;
