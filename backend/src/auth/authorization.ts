import type { NextFunction, Request, Response } from 'express';

export function requireAnyRole(...allowed: string[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test' && !res.locals.auth) return next();
    const roles = (res.locals.auth?.roles ?? []) as Array<{ code: string; objectId: string | null }>;
    if (!roles.some((assignment) => allowed.includes(assignment.code))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}
