import type { Actor, Approval, AuditEvent, Review, ReviewState, RiskLevel } from '../domain/types';
import { AppError } from '../lib/errors';
import { sha256 } from '../lib/hash';
import { newId } from '../lib/id';
import type { Repository } from '../repositories/repository';
import type { ReviewIntelligence } from '../services/intelligence';
import { ReviewService } from '../services/review-service';
import { requireWorkflow, type WorkflowRuntime } from './runtime';
import type {
  ApprovalActionToken,
  InboxCursor,
  InboxFilters,
  InboxPage,
  InboxSummary,
  PublicationAttempt,
  PublicationChannel,
  ReviewWorkItem,
  SlaStatus,
  WorkItemPatch,
  WorkPriority,
} from './types';

const completedStates = new Set<ReviewState>(['published', 'closed', 'skipped', 'rejected']);
const priorityRank: Record<WorkPriority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };

function randomToken(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeCursor(cursor: InboxCursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeInboxCursor(value?: string): InboxCursor | undefined {
  if (!value) return undefined;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as Partial<InboxCursor>;
    if (!decoded.updatedAt || Number.isNaN(Date.parse(decoded.updatedAt))) throw new Error('Invalid cursor');
    return { updatedAt: decoded.updatedAt };
  } catch {
    throw new AppError('Inbox cursor is invalid.', 422, 'invalid_cursor');
  }
}

function derivedPriority(review: Review): WorkPriority {
  if (review.classification?.risk === 'red' || review.classification?.urgency === 'immediate') return 'urgent';
  if (review.classification?.risk === 'amber' || review.classification?.urgency === 'same_business_day' || review.rating <= 2) return 'high';
  if (review.classification?.risk === 'green' || review.rating >= 4) return 'normal';
  return 'normal';
}

function dueWindowMs(review: Review): number {
  const priority = derivedPriority(review);
  if (priority === 'urgent') return 60 * 60 * 1000;
  if (priority === 'high') return 4 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function nextAction(review: Review): string {
  const actions: Partial<Record<ReviewState, string>> = {
    received: 'Verify source data',
    needs_verification: 'Verify source data',
    verified: 'Classify and draft',
    classifying: 'Wait for classification',
    classified: 'Review classification',
    needs_context: 'Provide missing context',
    drafting: 'Wait for draft',
    draft_ready: 'Run quality assurance',
    qa_required: 'Resolve QA defects',
    awaiting_approval: 'Approve, edit, reject, or escalate',
    approved: 'Publish approved reply',
    edited: 'Publish edited reply',
    rejected: 'Regenerate or close',
    skipped: 'Close without reply',
    publishing_manually: 'Confirm publication',
    publication_unconfirmed: 'Verify publication',
    escalated: 'Owner review required',
    published: 'No action required',
    closed: 'No action required',
  };
  return actions[review.state] ?? 'Review required';
}

function slaStatus(item: ReviewWorkItem, now = Date.now()): SlaStatus {
  if (completedStates.has(item.state)) return 'completed';
  if (item.state === 'escalated' && !item.dueAt) return 'paused';
  if (!item.dueAt) return 'on_track';
  const due = new Date(item.dueAt).getTime();
  if (due < now) return 'overdue';
  if (due - now <= 60 * 60 * 1000) return 'due_soon';
  return 'on_track';
}

export class ProductionWorkflowService {
  constructor(
    private readonly runtime: WorkflowRuntime,
    private readonly repository: Repository,
    private readonly actor: Actor,
  ) {}

  async syncReview(review: Review): Promise<ReviewWorkItem | null> {
    if (!this.runtime.enabled) return null;
    const store = requireWorkflow(this.runtime);
    const created = new Date(review.createdAt).getTime();
    const baseTime = Number.isFinite(created) ? created : Date.now();
    const now = new Date().toISOString();
    return store.syncWorkItem({
      reviewId: review.id,
      restaurantId: review.restaurantId,
      state: review.state,
      risk: review.classification?.risk ?? 'unknown',
      priority: derivedPriority(review),
      dueAt: new Date(baseTime + dueWindowMs(review)).toISOString(),
      preview: review.originalText.slice(0, 320),
      rating: review.rating,
      source: review.source,
      reviewDate: review.reviewDate,
      ...(review.reviewerDisplayName ? { reviewerDisplayName: review.reviewerDisplayName } : {}),
      nextAction: nextAction(review),
      workflowVersion: 1,
      lastActivityAt: review.updatedAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  async getWorkItem(reviewId: string) {
    return requireWorkflow(this.runtime).getWorkItem(reviewId);
  }

  async listInbox(restaurantId: string, filters: InboxFilters): Promise<InboxPage> {
    const store = requireWorkflow(this.runtime);
    const rows = await store.listWorkItems(restaurantId, filters);
    const hasMore = rows.length > filters.limit;
    const page = rows.slice(0, filters.limit);
    const items = page.map((item) => ({ ...item, slaStatus: slaStatus(item) }));
    const last = page.at(-1);
    return {
      items,
      ...(hasMore && last ? { nextCursor: encodeCursor({ updatedAt: last.updatedAt }) } : {}),
    };
  }

  async summary(restaurantId: string): Promise<InboxSummary> {
    const rows = await requireWorkflow(this.runtime).listWorkItemsForSummary(restaurantId);
    const result: InboxSummary = { total: rows.length, overdue: 0, dueSoon: 0, unassigned: 0, byState: {}, byRisk: {}, byPriority: {} };
    for (const item of rows) {
      const status = slaStatus(item);
      if (status === 'overdue') result.overdue += 1;
      if (status === 'due_soon') result.dueSoon += 1;
      if (!item.assigneeId && !completedStates.has(item.state)) result.unassigned += 1;
      result.byState[item.state] = (result.byState[item.state] ?? 0) + 1;
      result.byRisk[item.risk] = (result.byRisk[item.risk] ?? 0) + 1;
      result.byPriority[item.priority] = (result.byPriority[item.priority] ?? 0) + 1;
    }
    return result;
  }

  async updateWorkItem(reviewId: string, expectedVersion: number, patch: WorkItemPatch) {
    const store = requireWorkflow(this.runtime);
    const review = await this.requireReview(reviewId);
    const item = await store.updateWorkItem(reviewId, expectedVersion, patch);
    await this.audit('review_work_item.updated', 'review', review.id, review.restaurantId, {
      expectedVersion,
      newVersion: item.workflowVersion,
      changedFields: Object.keys(patch),
    });
    return item;
  }

  async claim(reviewId: string, expectedVersion: number) {
    return this.updateWorkItem(reviewId, expectedVersion, { assigneeId: this.actor.id });
  }

  async createApprovalAction(
    reviewId: string,
    intendedActorId: string,
    allowedDecisions: Approval['decision'][],
    ttlMinutes: number,
  ) {
    const store = requireWorkflow(this.runtime);
    const review = await this.requireReview(reviewId);
    if (!['awaiting_approval', 'escalated'].includes(review.state)) {
      throw new AppError('Approval actions are available only for reviews awaiting a decision.', 409, 'invalid_state');
    }
    const rawToken = randomToken();
    const now = new Date();
    const token: ApprovalActionToken = {
      id: newId(), restaurantId: review.restaurantId, reviewId: review.id, intendedActorId,
      tokenHash: await sha256(rawToken), allowedDecisions,
      expiresAt: new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString(),
      createdBy: this.actor.id, createdAt: now.toISOString(),
    };
    await store.createApprovalToken(token);
    await this.audit('approval_action.created', 'review', review.id, review.restaurantId, {
      intendedActorId, allowedDecisions, expiresAt: token.expiresAt,
    });
    return { token: rawToken, expiresAt: token.expiresAt, actionPath: `/v1/approval-actions/${rawToken}` };
  }

  async previewApprovalAction(rawToken: string) {
    const store = requireWorkflow(this.runtime);
    const token = await store.peekApprovalToken(await sha256(rawToken), new Date().toISOString());
    if (!token) throw new AppError('Approval action is invalid, expired, or already used.', 404, 'approval_action_invalid');
    if (token.intendedActorId !== this.actor.id && this.actor.platformRole === 'user') throw new AppError('Approval action is not assigned to this user.', 403, 'forbidden');
    const review = await this.requireReview(token.reviewId);
    const draft = await this.repository.getLatestDraft(review.id, this.actor);
    const workItem = await store.getWorkItem(review.id);
    return { review, draft, workItem, allowedDecisions: token.allowedDecisions, expiresAt: token.expiresAt };
  }

  async decideApprovalAction(rawToken: string, input: {
    decision: Approval['decision'];
    finalText?: string;
    editReason?: string;
    channel: Approval['channel'];
    expectedReviewUpdatedAt?: string;
  }, intelligence: ReviewIntelligence) {
    const store = requireWorkflow(this.runtime);
    const tokenHash = await sha256(rawToken);
    const preview = await store.peekApprovalToken(tokenHash, new Date().toISOString());
    if (!preview) throw new AppError('Approval action is invalid, expired, or already used.', 404, 'approval_action_invalid');
    if (preview.intendedActorId !== this.actor.id && this.actor.platformRole === 'user') throw new AppError('Approval action is not assigned to this user.', 403, 'forbidden');
    if (!preview.allowedDecisions.includes(input.decision)) throw new AppError('This approval action does not allow the selected decision.', 422, 'approval_action_not_allowed');
    const consumed = await store.consumeApprovalToken(tokenHash, preview.intendedActorId, new Date().toISOString());
    if (!consumed) throw new AppError('Approval action was already used.', 409, 'approval_action_used');
    const result = await new ReviewService(this.repository, intelligence, this.actor).decide(preview.reviewId, input);
    await this.syncReview(result.review);
    await this.audit('approval_action.used', 'review', result.review.id, result.review.restaurantId, { decision: input.decision, tokenId: consumed.id });
    return result;
  }

  async startPublicationAttempt(review: Review, channel: PublicationChannel, idempotencyKey?: string) {
    const store = requireWorkflow(this.runtime);
    const attempts = await store.listPublicationAttempts(review.id);
    const key = idempotencyKey?.trim() || `${channel}:${review.id}:${review.updatedAt}`;
    const input: PublicationAttempt = {
      id: newId(), restaurantId: review.restaurantId, reviewId: review.id, channel,
      status: 'in_progress', attemptNumber: attempts.length + 1, idempotencyKey: key,
      requestedBy: this.actor.id, metadata: {}, createdAt: new Date().toISOString(),
    };
    return store.createPublicationAttempt(input);
  }

  async completePublicationAttempt(id: string, status: PublicationAttempt['status'], patch: {
    externalReference?: string;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  } = {}) {
    return requireWorkflow(this.runtime).updatePublicationAttempt(id, {
      status,
      ...(patch.externalReference ? { externalReference: patch.externalReference } : {}),
      ...(patch.errorCode ? { errorCode: patch.errorCode } : {}),
      ...(patch.errorMessage ? { errorMessage: patch.errorMessage } : {}),
      metadata: patch.metadata ?? {},
      completedAt: new Date().toISOString(),
    });
  }

  async listPublicationAttempts(reviewId: string) {
    return requireWorkflow(this.runtime).listPublicationAttempts(reviewId);
  }

  async timeline(reviewId: string): Promise<AuditEvent[]> {
    const review = await this.requireReview(reviewId);
    const events = await this.repository.listAuditEvents(review.restaurantId, this.actor);
    return events.filter((event) => event.resourceId === reviewId || event.metadata.reviewId === reviewId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async requireReview(id: string): Promise<Review> {
    const review = await this.repository.getReview(id, this.actor);
    if (!review) throw new AppError('Review not found.', 404, 'not_found');
    return review;
  }

  private async audit(action: string, resourceType: string, resourceId: string, restaurantId: string, metadata: Record<string, unknown>) {
    return this.repository.createAuditEvent({ id: newId(), actorId: this.actor.id, action, resourceType, resourceId, restaurantId, metadata, createdAt: new Date().toISOString() }, this.actor);
  }
}

export function higherWorkPriority(left: WorkPriority, right: WorkPriority): WorkPriority {
  return priorityRank[left] >= priorityRank[right] ? left : right;
}

export function normalizeRisk(value?: string): RiskLevel | undefined {
  return value && ['green', 'amber', 'red', 'unknown'].includes(value) ? value as RiskLevel : undefined;
}
