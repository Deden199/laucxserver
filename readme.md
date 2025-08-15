# laucxserver

Backend for the Launcx payment aggregator.

See [docs/services](docs/services) for service-specific endpoints, dependencies, and environment variables.

## Reconcile Partner Balances

Run `npm run reconcile-balances` after setting database environment variables to recompute client balances.

## API Documentation

Generate and serve Swagger docs for payment and withdrawal routes:

```bash
npm run docs
```

This command writes `docs/api/payment.yaml` and `docs/api/withdrawal.yaml` and hosts them at `http://localhost:3001/docs/payment` and `/docs/withdrawal`.

## Running with Docker

Build all images:

```bash
docker-compose build
```

Start all services:

```bash
docker-compose up
```

### Environment variables

Each service reads configuration from a `.env` file in its directory. Copy the corresponding `.env.example` to `.env` and supply the required values. At minimum, set the shared variables:

```
DATABASE_URL=postgresql://launcx:secret@db:5432/launcx
KAFKA_BROKER=kafka:9092
```

Service-specific examples are provided in:

- `admin-service/.env.example`
- `auth-service/.env.example`
- `payment-service/.env.example`
- `withdrawal-service/.env.example`
- `frontend/.env.example`
