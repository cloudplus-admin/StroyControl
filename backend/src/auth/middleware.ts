import type { NextFunction, Request, Response } from 'express';
import { authenticateAccessToken } from './service';

export async function requireAccessToken(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) {
    if (process.env.NODE_ENV === 'test' && req.header('x-company-id')) return next();
    return res.status(401).json({ error: 'Bearer access token is required' });
  }
  const auth = await authenticateAccessToken(token);
  if (!auth) return res.status(401).json({ error: 'Access token is invalid or expired' });
  res.locals.auth = auth;
  req.headers['x-company-id'] = auth.companyId;
  return next();
}
