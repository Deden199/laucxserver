import express from 'express';
import dashboardRoutes from './route/dashboard.routes';
import merchantRoutes from './route/merchant.routes';
import pgProviderRoutes from './route/pgProvider.routes';
import ipWhitelistRoutes from './route/ipWhitelist.routes';

const app = express();
app.use(express.json());

app.use('/dashboard', dashboardRoutes);
app.use('/merchants', merchantRoutes);
app.use('/pg-providers', pgProviderRoutes);
app.use('/ip-whitelist', ipWhitelistRoutes);

export default app;
