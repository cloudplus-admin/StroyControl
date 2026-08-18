import type { Request, Response } from 'express';

export type AuthContext = {
  userId: string;
  companyId: string;
  roles: { code: string; objectId: string | null }[];
};

export function getAuth(res: Response): AuthContext | undefined {
  return res.locals.auth as AuthContext | undefined;
}

export function requireCompanyId(req: Request, res: Response): string | null {
  const authenticatedCompanyId = getAuth(res)?.companyId;
  if (authenticatedCompanyId) return authenticatedCompanyId;

  // Legacy header-based setup is deliberately limited to integration tests.
  if (process.env.NODE_ENV === 'test') {
    const testCompanyId = req.header('x-company-id');
    if (testCompanyId) return testCompanyId;
  }

  res.status(401).json({ error: 'Authentication is required' });
  return null;
}
