import jwt from 'express-jwt';
import { expressjwt } from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export const authMiddleware = expressjwt({
  secret: expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${config.api.auth0.domain}/.well-known/jwks.json`,
  }) as jwt.GetVerificationKey,
  audience: config.api.auth0.audience,
  issuer: `https://${config.api.auth0.domain}/`,
  algorithms: ['RS256'],
});

export const authErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({ message: 'Invalid token' });
  } else {
    next(err);
  }
};
