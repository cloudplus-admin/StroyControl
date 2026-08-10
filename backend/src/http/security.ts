import type { NextFunction, Request, Response } from 'express';

type Attempt = { count: number; resetAt: number };
const loginAttempts = new Map<string, Attempt>();

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('cross-origin-resource-policy', 'same-origin');
  res.removeHeader('x-powered-by');
  next();
}

function loginKey(req: Request): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return `${req.ip || req.socket.remoteAddress || 'unknown'}:${email}`;
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const windowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
  const maximum = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10);
  const key = loginKey(req);
  const current = loginAttempts.get(key);
  const attempt = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  res.setHeader('ratelimit-limit', String(maximum));
  res.setHeader('ratelimit-remaining', String(Math.max(0, maximum - attempt.count)));
  res.setHeader('ratelimit-reset', String(Math.ceil(attempt.resetAt / 1000)));
  if (attempt.count >= maximum) {
    res.setHeader('retry-after', String(Math.max(1, Math.ceil((attempt.resetAt - now) / 1000))));
    return res.status(429).json({ error: 'Too many login attempts' });
  }
  return next();
}

export function recordFailedLogin(req: Request) {
  const now = Date.now();
  const windowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
  const key = loginKey(req);
  const current = loginAttempts.get(key);
  loginAttempts.set(key, !current || current.resetAt <= now
    ? { count: 1, resetAt: now + windowMs }
    : { ...current, count: current.count + 1 });
}

export function clearLoginFailures(req: Request) {
  loginAttempts.delete(loginKey(req));
}

export function configuredOrigins(): string[] {
  return (process.env.WEB_ORIGINS ?? process.env.WEB_ORIGIN ?? 'http://127.0.0.1:48031')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
}
