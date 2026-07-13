import { z } from 'zod';
import type { Hono } from 'hono';
import type { AppEnv } from '../app-context';
import { jsonBody, parse, requireRestaurantRole, requireReviewRole } from '../app-context';
import type { Approval, ReviewState, RiskLevel } from '../domain/types';
import { AppError } from '../lib/errors';
import { ProductionWorkflowService, decodeInboxCursor, normalizeRisk } from '../workflow/service';
import type { WorkPriority } from '../workflow/types';

const workPriorities = ['low', 'normal', 'high', 'urgent'] as const;
const reviewStates = ['received','needs_verification','verified','classifying','classified','needs_context','drafting','draft_ready','qa_required','awaiting_approval','approved','edited','rejected','skipped','publishing_manually','published','publication_unconfirmed','escalated','closed'] as const;
const risks = ['green', 'amber', 'red', 'unknown'] as const;
const decisions = ['approved_unchanged','approved_minor_edit','approved_major_edit','rejected','skipped','escalated'] as const;
const allRoles = ['buyer', 'approver', 'operator', 'action_owner', 'viewer'] as const;
const managerRoles = ['buyer', 'approver', 'operator'] as const;

const workItemPatchSchema = z.object({
  expectedVersion: z.number().int().positive(),
  assigneeId: z.uuid().nullable().optional(),
  priority: z.enum(workPriorities).optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  contextSummary: z.string().trim().max(4000).nullable().optional(),
});
const claimSchema = z.object({ expectedVersion: z.number().int().positive() });
const approvalActionCreateSchema = z.object({
  intendedActorId: z.uuid().optional(),
  allowedDecisions: z.array(z.enum(decisions)).min(1).max(decisions.length).default(['approved_unchanged','approved_minor_edit','approved_major_edit','rejected','escalated']),
  ttlMinutes: z.number().int().min(5).max(1440).default(60),
});
const approvalActionDecisionSchema = z.object({
  decision: z.enum(decisions),
  finalText: z.string().trim().max(12000).optional(),
  editReason: z.string().trim().max(500).optional(),
  channel: z.enum(['web', 'whatsapp_link', 'email_link', 'operator']).default('web'),
  expectedReviewUpdatedAt: z.iso.datetime().optional(),
}).superRefine((value, ctx) => {
  if (value.decision.startsWith('approved') && !value.finalText) {
    ctx.addIssue({ code: 'custom', path: ['finalText'], message: 'Approved decisions require finalText.' });
  }
});

function csv<T extends string>(value: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!value) return undefined;
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (items.some((item) => !allowed.includes(item as T))) throw new AppError('Inbox filter contains an unsupported value.', 422, 'invalid_filter');
  return items as T[];
}

export function registerWorkflowRoutes(app: Hono<AppEnv>) {
  app.get('/v1/restaurants/:restaurantId/inbox', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...allRoles]);
    const limitValue = Number(c.req.query('limit') ?? 50);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.trunc(limitValue), 1), 100) : 50;
    const riskFilter = csv(c.req.query('risk'), risks)?.map((risk) => normalizeRisk(risk)).filter((risk): risk is RiskLevel => Boolean(risk));
    const page = await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).listInbox(restaurantId, {
      ...(csv(c.req.query('state'), reviewStates) ? { states: csv(c.req.query('state'), reviewStates) as ReviewState[] } : {}),
      ...(riskFilter?.length ? { risks: riskFilter } : {}),
      ...(csv(c.req.query('priority'), workPriorities) ? { priorities: csv(c.req.query('priority'), workPriorities) as WorkPriority[] } : {}),
      ...(c.req.query('assignee') ? { assigneeId: c.req.query('assignee') as string } : {}),
      overdue: c.req.query('overdue') === 'true',
      limit,
      ...(c.req.query('cursor') ? { cursor: decodeInboxCursor(c.req.query('cursor')) } : {}),
    });
    return c.json(page);
  });

  app.get('/v1/restaurants/:restaurantId/inbox/summary', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...allRoles]);
    return c.json({ summary: await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).summary(restaurantId) });
  });

  app.get('/v1/reviews/:reviewId/work-item', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), [...allRoles]);
    return c.json({ workItem: await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).getWorkItem(c.req.param('reviewId')) });
  });

  app.patch('/v1/reviews/:reviewId/work-item', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), [...managerRoles, 'action_owner']);
    const input = parse(workItemPatchSchema, await jsonBody(c));
    const { expectedVersion, ...patch } = input;
    return c.json({ workItem: await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).updateWorkItem(c.req.param('reviewId'), expectedVersion, patch) });
  });

  app.post('/v1/reviews/:reviewId/claim', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), [...managerRoles, 'action_owner']);
    const input = parse(claimSchema, await jsonBody(c));
    return c.json({ workItem: await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).claim(c.req.param('reviewId'), input.expectedVersion) });
  });

  app.post('/v1/reviews/:reviewId/approval-actions', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), [...managerRoles]);
    const input = parse(approvalActionCreateSchema, await jsonBody(c));
    const service = new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor'));
    const action = await service.createApprovalAction(c.req.param('reviewId'), input.intendedActorId ?? c.get('actor').id, input.allowedDecisions as Approval['decision'][], input.ttlMinutes);
    return c.json({ action }, 201);
  });

  app.get('/v1/approval-actions/:token', async (c) => {
    const result = await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).previewApprovalAction(c.req.param('token'));
    return c.json(result);
  });

  app.post('/v1/approval-actions/:token', async (c) => {
    const input = parse(approvalActionDecisionSchema, await jsonBody(c));
    const result = await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).decideApprovalAction(c.req.param('token'), input, c.get('intelligence'));
    return c.json(result);
  });

  app.get('/v1/reviews/:reviewId/publication-attempts', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), [...allRoles]);
    return c.json({ attempts: await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).listPublicationAttempts(c.req.param('reviewId')) });
  });

  app.get('/v1/reviews/:reviewId/timeline', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), [...allRoles]);
    return c.json({ events: await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).timeline(c.req.param('reviewId')) });
  });
}
