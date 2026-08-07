import { Router } from 'express';
import { z } from 'zod';
import { authenticateAccessToken, login, refresh, revokeAccessToken } from './service';
import { asyncRoute } from '../http/async-route';

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(3).max(200) });
const refreshSchema = z.object({ refreshToken: z.string().min(20) });

authRouter.post('/login', asyncRoute(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await login(input.email, input.password);
  if (!result) return res.status(401).json({ error: 'Invalid email or password' });
  return res.json(result);
}));

authRouter.post('/refresh', asyncRoute(async (req, res) => {
  const input = refreshSchema.parse(req.body);
  const result = await refresh(input.refreshToken);
  if (!result) return res.status(401).json({ error: 'Refresh token is invalid or expired' });
  return res.json(result);
}));

authRouter.post('/logout', asyncRoute(async (req, res) => {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (token) await revokeAccessToken(token);
  return res.status(204).send();
}));

authRouter.get('/me', asyncRoute(async (req, res) => {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const auth = token ? await authenticateAccessToken(token) : null;
  if (!auth) return res.status(401).json({ error: 'Access token is invalid or expired' });
  return res.json(auth);
}));
