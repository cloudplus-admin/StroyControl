import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  createPaymentScheduleSchema,
  markPaymentPaidSchema,
  createCustomerApprovalSchema,
  respondToApprovalSchema,
} from './schemas';
import * as customerPortalService from './service';

export const customerPortalRouter = Router();

function requireCompanyId(req: Request, res: Response): string | null {
  const companyId = req.header('x-company-id');
  if (!companyId) {
    res.status(401).json({ error: 'x-company-id header is required (temporary stand-in until auth is implemented)' });
    return null;
  }
  return companyId;
}

function handleZodError(err: unknown, res: Response, next: NextFunction): boolean {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', details: err.issues });
    return true;
  }
  next(err);
  return false;
}

customerPortalRouter.get('/objects/:objectId/customer-portal', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const overview = await customerPortalService.getPortalOverview(companyId, req.params.objectId);
    if (!overview) return res.status(404).json({ error: 'not_found' });
    res.json(overview);
  } catch (err) {
    next(err);
  }
});

customerPortalRouter.get('/objects/:objectId/payment-schedule', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const payments = await customerPortalService.listPaymentSchedule(companyId, req.params.objectId);
    if (payments === null) return res.status(404).json({ error: 'not_found' });
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

customerPortalRouter.post('/objects/:objectId/payment-schedule', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = createPaymentScheduleSchema.parse(req.body);
    const payment = await customerPortalService.createPaymentScheduleEntry(companyId, req.params.objectId, input);
    if (!payment) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(payment);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

customerPortalRouter.patch('/payment-schedule/:id/pay', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = markPaymentPaidSchema.parse(req.body);
    const payment = await customerPortalService.markPaymentAsPaid(companyId, req.params.id, input.paidAt);
    if (!payment) return res.status(404).json({ error: 'not_found' });
    res.json(payment);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

customerPortalRouter.get('/objects/:objectId/customer-approvals', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const approvals = await customerPortalService.listCustomerApprovals(companyId, req.params.objectId);
    if (approvals === null) return res.status(404).json({ error: 'not_found' });
    res.json(approvals);
  } catch (err) {
    next(err);
  }
});

customerPortalRouter.post('/objects/:objectId/customer-approvals', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = createCustomerApprovalSchema.parse(req.body);
    const approval = await customerPortalService.createCustomerApproval(companyId, req.params.objectId, input);
    if (!approval) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(approval);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

customerPortalRouter.patch('/customer-approvals/:id/respond', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = respondToApprovalSchema.parse(req.body);
    const approval = await customerPortalService.respondToCustomerApproval(companyId, req.params.id, input);
    if (!approval) return res.status(404).json({ error: 'not_found' });
    res.json(approval);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});
