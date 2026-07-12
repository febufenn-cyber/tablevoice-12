import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app-context';
import { audit, jsonBody, parse, requireRestaurantRole } from '../app-context';
import { actionUpdateSchema, listingConfirmSchema, listingFindingSchema } from '../domain/schemas';
import { AppError } from '../lib/errors';
import { newId } from '../lib/id';
import { ReportService } from '../services/report-service';

export function registerOperationsRoutes(app: Hono<AppEnv>) {
  app.get('/v1/restaurants/:restaurantId/actions', async (c) => c.json({ actions: await c.get('repository').listInternalActions(c.req.param('restaurantId'), c.get('actor')) }));
  app.patch('/v1/actions/:actionId', async (c) => {
    const actor = c.get('actor'); const repository = c.get('repository'); const input = parse(actionUpdateSchema, await jsonBody(c));
    const current = await repository.getInternalAction(c.req.param('actionId'), actor); if (!current) throw new AppError('Internal action not found.', 404, 'not_found');
    await requireRestaurantRole(repository, current.restaurantId, actor, ['buyer', 'approver', 'operator', 'action_owner']);
    const action = await repository.updateInternalAction(current.id, { ...input, ...(input.status === 'completed' ? { completedAt: new Date().toISOString() } : {}) }, actor);
    await audit(repository, actor, { action: 'internal_action.updated', resourceType: 'internal_action', resourceId: action.id, restaurantId: action.restaurantId, metadata: { status: action.status } });
    return c.json({ action });
  });

  app.post('/v1/restaurants/:restaurantId/listing-findings', async (c) => {
    const actor = c.get('actor'); const repository = c.get('repository'); const restaurantId = c.req.param('restaurantId');
    if (!(await repository.getRestaurant(restaurantId, actor))) throw new AppError('Restaurant not found.', 404, 'not_found');
    await requireRestaurantRole(repository, restaurantId, actor, ['buyer', 'approver', 'operator']);
    const input = parse(listingFindingSchema, await jsonBody(c));
    const finding = await repository.createListingFinding({
      id: newId(), restaurantId, field: input.field, sourceA: input.sourceA, sourceAValue: input.sourceAValue,
      sourceB: input.sourceB, sourceBValue: input.sourceBValue, severity: input.severity, confidence: input.confidence,
      status: 'needs_confirmation', recommendedAction: input.recommendedAction,
      ...(input.assignedTo ? { assignedTo: input.assignedTo } : {}), ...(input.dueAt ? { dueAt: input.dueAt } : {}), createdAt: new Date().toISOString(),
    }, actor);
    await audit(repository, actor, { action: 'listing_finding.created', resourceType: 'listing_finding', resourceId: finding.id, restaurantId, metadata: { field: finding.field, confidence: finding.confidence } });
    return c.json({ finding }, 201);
  });
  app.get('/v1/restaurants/:restaurantId/listing-findings', async (c) => c.json({ findings: await c.get('repository').listListingFindings(c.req.param('restaurantId'), c.get('actor')) }));
  app.post('/v1/listing-findings/:findingId/confirm', async (c) => {
    const actor = c.get('actor'); const repository = c.get('repository'); const input = parse(listingConfirmSchema, await jsonBody(c));
    const current = await repository.getListingFinding(c.req.param('findingId'), actor); if (!current) throw new AppError('Listing finding not found.', 404, 'not_found');
    await requireRestaurantRole(repository, current.restaurantId, actor, ['buyer', 'approver', 'operator']);
    const finding = await repository.updateListingFinding(current.id, {
      status: input.result, ownerConfirmation: input.ownerConfirmation, ...(input.evidence ? { evidence: input.evidence } : {}),
      ...(['corrected', 'closed'].includes(input.result) ? { resolvedAt: new Date().toISOString() } : {}),
    }, actor);
    await audit(repository, actor, { action: 'listing_finding.confirmed', resourceType: 'listing_finding', resourceId: finding.id, restaurantId: finding.restaurantId, metadata: { result: input.result } });
    return c.json({ finding });
  });

  app.post('/v1/restaurants/:restaurantId/reports/weekly', async (c) => {
    await requireRestaurantRole(c.get('repository'), c.req.param('restaurantId'), c.get('actor'), ['buyer', 'approver', 'operator']);
    const input = parse(z.object({ periodStart: z.iso.date(), periodEnd: z.iso.date() }), await jsonBody(c));
    const report = await new ReportService(c.get('repository'), c.get('actor')).generate(c.req.param('restaurantId'), input.periodStart, input.periodEnd);
    return c.json({ report }, 201);
  });
  app.get('/v1/restaurants/:restaurantId/reports/weekly', async (c) => c.json({ reports: await c.get('repository').listWeeklyReports(c.req.param('restaurantId'), c.get('actor')) }));
  app.get('/v1/restaurants/:restaurantId/audit-events', async (c) => c.json({ events: await c.get('repository').listAuditEvents(c.req.param('restaurantId'), c.get('actor')) }));
}
