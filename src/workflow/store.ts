import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../lib/errors';
import type {
  ApprovalActionToken,
  InboxFilters,
  PublicationAttempt,
  ReviewWorkItem,
  WorkItemPatch,
  WorkPriority,
} from './types';

export interface WorkflowStore {
  syncWorkItem(input: ReviewWorkItem): Promise<ReviewWorkItem>;
  getWorkItem(reviewId: string): Promise<ReviewWorkItem | null>;
  updateWorkItem(reviewId: string, expectedVersion: number, patch: WorkItemPatch): Promise<ReviewWorkItem>;
  listWorkItems(restaurantId: string, filters: InboxFilters): Promise<ReviewWorkItem[]>;
  listWorkItemsForSummary(restaurantId: string): Promise<ReviewWorkItem[]>;

  createApprovalToken(input: ApprovalActionToken): Promise<ApprovalActionToken>;
  peekApprovalToken(tokenHash: string, now: string): Promise<ApprovalActionToken | null>;
  consumeApprovalToken(tokenHash: string, actorId: string, now: string): Promise<ApprovalActionToken | null>;

  createPublicationAttempt(input: PublicationAttempt): Promise<PublicationAttempt>;
  updatePublicationAttempt(id: string, patch: Partial<PublicationAttempt>): Promise<PublicationAttempt>;
  listPublicationAttempts(reviewId: string): Promise<PublicationAttempt[]>;
}

const completedStates = new Set(['published', 'closed', 'skipped', 'rejected']);
const priorityRank: Record<WorkPriority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };

function clone<T>(value: T): T { return structuredClone(value); }
function higherPriority(left: WorkPriority, right: WorkPriority): WorkPriority {
  return priorityRank[left] >= priorityRank[right] ? left : right;
}

function applyPatch(item: ReviewWorkItem, patch: WorkItemPatch): ReviewWorkItem {
  const updated: ReviewWorkItem = {
    ...item,
    ...(patch.priority ? { priority: patch.priority } : {}),
    workflowVersion: item.workflowVersion + 1,
    lastActivityAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (patch.assigneeId === null) delete updated.assigneeId;
  else if (patch.assigneeId !== undefined) updated.assigneeId = patch.assigneeId;
  if (patch.dueAt === null) delete updated.dueAt;
  else if (patch.dueAt !== undefined) updated.dueAt = patch.dueAt;
  if (patch.contextSummary === null) delete updated.contextSummary;
  else if (patch.contextSummary !== undefined) updated.contextSummary = patch.contextSummary;
  return updated;
}

export class MemoryWorkflowStore implements WorkflowStore {
  private readonly workItems = new Map<string, ReviewWorkItem>();
  private readonly tokens = new Map<string, ApprovalActionToken>();
  private readonly attempts = new Map<string, PublicationAttempt>();

  async syncWorkItem(input: ReviewWorkItem): Promise<ReviewWorkItem> {
    const existing = this.workItems.get(input.reviewId);
    const value: ReviewWorkItem = existing ? {
      ...input,
      ...(existing.assigneeId ? { assigneeId: existing.assigneeId } : {}),
      ...(existing.contextSummary ? { contextSummary: existing.contextSummary } : {}),
      priority: higherPriority(existing.priority, input.priority),
      dueAt: existing.dueAt ?? input.dueAt,
      workflowVersion: existing.workflowVersion + 1,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    } : input;
    this.workItems.set(value.reviewId, clone(value));
    return clone(value);
  }

  async getWorkItem(reviewId: string) { return clone(this.workItems.get(reviewId) ?? null); }

  async updateWorkItem(reviewId: string, expectedVersion: number, patch: WorkItemPatch) {
    const existing = this.workItems.get(reviewId);
    if (!existing) throw new AppError('Review work item not found.', 404, 'not_found');
    if (existing.workflowVersion !== expectedVersion) {
      throw new AppError('The review work item changed. Refresh and try again.', 409, 'stale_work_item', { currentVersion: existing.workflowVersion });
    }
    const updated = applyPatch(existing, patch);
    this.workItems.set(reviewId, clone(updated));
    return clone(updated);
  }

  async listWorkItems(restaurantId: string, filters: InboxFilters) {
    const now = Date.now();
    return clone([...this.workItems.values()]
      .filter((item) => item.restaurantId === restaurantId)
      .filter((item) => !filters.states?.length || filters.states.includes(item.state))
      .filter((item) => !filters.risks?.length || filters.risks.includes(item.risk))
      .filter((item) => !filters.priorities?.length || filters.priorities.includes(item.priority))
      .filter((item) => filters.assigneeId === undefined || (filters.assigneeId === 'unassigned' ? !item.assigneeId : item.assigneeId === filters.assigneeId))
      .filter((item) => !filters.overdue || Boolean(item.dueAt && new Date(item.dueAt).getTime() < now && !completedStates.has(item.state)))
      .filter((item) => !filters.cursor || item.updatedAt < filters.cursor.updatedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.reviewId.localeCompare(a.reviewId))
      .slice(0, filters.limit + 1));
  }

  async listWorkItemsForSummary(restaurantId: string) {
    return clone([...this.workItems.values()].filter((item) => item.restaurantId === restaurantId));
  }

  async createApprovalToken(input: ApprovalActionToken) {
    this.tokens.set(input.tokenHash, clone(input));
    return clone(input);
  }

  async peekApprovalToken(tokenHash: string, now: string) {
    const token = this.tokens.get(tokenHash);
    if (!token || token.usedAt || token.expiresAt <= now) return null;
    return clone(token);
  }

  async consumeApprovalToken(tokenHash: string, actorId: string, now: string) {
    const token = this.tokens.get(tokenHash);
    if (!token || token.usedAt || token.expiresAt <= now || token.intendedActorId !== actorId) return null;
    const updated = { ...token, usedAt: now };
    this.tokens.set(tokenHash, updated);
    return clone(updated);
  }

  async createPublicationAttempt(input: PublicationAttempt) {
    const existing = [...this.attempts.values()].find((item) => item.reviewId === input.reviewId && item.channel === input.channel && item.idempotencyKey === input.idempotencyKey);
    if (existing) return clone(existing);
    this.attempts.set(input.id, clone(input));
    return clone(input);
  }

  async updatePublicationAttempt(id: string, patch: Partial<PublicationAttempt>) {
    const existing = this.attempts.get(id);
    if (!existing) throw new AppError('Publication attempt not found.', 404, 'not_found');
    const updated = { ...existing, ...patch, id: existing.id };
    this.attempts.set(id, clone(updated));
    return clone(updated);
  }

  async listPublicationAttempts(reviewId: string) {
    return clone([...this.attempts.values()].filter((item) => item.reviewId === reviewId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
}

type JsonRow = Record<string, unknown>;
function toSnake(value: object): JsonRow {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]));
}
function toCamel(row: JsonRow): JsonRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
}
function required<T>(data: T | null, error: { message: string } | null, label: string): T {
  if (error) throw new AppError(`${label}: ${error.message}`, 500, 'workflow_store_error');
  if (!data) throw new AppError(`${label} returned no data.`, 500, 'workflow_store_error');
  return data;
}

export class SupabaseWorkflowStore implements WorkflowStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    if (!url || !serviceRoleKey) throw new AppError('Phase 3 workflow storage is not configured.', 503, 'workflow_not_configured');
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async syncWorkItem(input: ReviewWorkItem) {
    const existing = await this.getWorkItem(input.reviewId);
    if (!existing) {
      const { data, error } = await this.client.from('review_work_items').insert(toSnake(input)).select().single();
      return toCamel(required(data, error, 'Create review work item')) as unknown as ReviewWorkItem;
    }
    const merged: ReviewWorkItem = {
      ...input,
      ...(existing.assigneeId ? { assigneeId: existing.assigneeId } : {}),
      ...(existing.contextSummary ? { contextSummary: existing.contextSummary } : {}),
      priority: higherPriority(existing.priority, input.priority),
      dueAt: existing.dueAt ?? input.dueAt,
      workflowVersion: existing.workflowVersion + 1,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await this.client.from('review_work_items').update(toSnake(merged)).eq('review_id', input.reviewId).select().single();
    return toCamel(required(data, error, 'Sync review work item')) as unknown as ReviewWorkItem;
  }

  async getWorkItem(reviewId: string) {
    const { data, error } = await this.client.from('review_work_items').select('*').eq('review_id', reviewId).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'workflow_store_error');
    return data ? (toCamel(data) as unknown as ReviewWorkItem) : null;
  }

  async updateWorkItem(reviewId: string, expectedVersion: number, patch: WorkItemPatch) {
    const existing = await this.getWorkItem(reviewId);
    if (!existing) throw new AppError('Review work item not found.', 404, 'not_found');
    if (existing.workflowVersion !== expectedVersion) {
      throw new AppError('The review work item changed. Refresh and try again.', 409, 'stale_work_item', { currentVersion: existing.workflowVersion });
    }
    const updated = applyPatch(existing, patch);
    const row = toSnake(updated);
    if (patch.assigneeId === null) row.assignee_id = null;
    if (patch.dueAt === null) row.due_at = null;
    if (patch.contextSummary === null) row.context_summary = null;
    const { data, error } = await this.client.from('review_work_items')
      .update(row)
      .eq('review_id', reviewId)
      .eq('workflow_version', expectedVersion)
      .select()
      .maybeSingle();
    if (error) throw new AppError(error.message, 500, 'workflow_store_error');
    if (!data) throw new AppError('The review work item changed. Refresh and try again.', 409, 'stale_work_item');
    return toCamel(data) as unknown as ReviewWorkItem;
  }

  async listWorkItems(restaurantId: string, filters: InboxFilters) {
    let query = this.client.from('review_work_items').select('*').eq('restaurant_id', restaurantId)
      .order('updated_at', { ascending: false }).order('review_id', { ascending: false });
    if (filters.states?.length) query = query.in('state', filters.states);
    if (filters.risks?.length) query = query.in('risk', filters.risks);
    if (filters.priorities?.length) query = query.in('priority', filters.priorities);
    if (filters.assigneeId === 'unassigned') query = query.is('assignee_id', null);
    else if (filters.assigneeId) query = query.eq('assignee_id', filters.assigneeId);
    if (filters.overdue) query = query.lt('due_at', new Date().toISOString()).not('state', 'in', '(published,closed,skipped,rejected)');
    if (filters.cursor) query = query.lt('updated_at', filters.cursor.updatedAt);
    const { data, error } = await query.limit(filters.limit + 1);
    if (error) throw new AppError(error.message, 500, 'workflow_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as ReviewWorkItem);
  }

  async listWorkItemsForSummary(restaurantId: string) {
    const { data, error } = await this.client.from('review_work_items').select('*').eq('restaurant_id', restaurantId).limit(5000);
    if (error) throw new AppError(error.message, 500, 'workflow_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as ReviewWorkItem);
  }

  async createApprovalToken(input: ApprovalActionToken) {
    const { data, error } = await this.client.from('approval_action_tokens').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create approval action')) as unknown as ApprovalActionToken;
  }

  async peekApprovalToken(tokenHash: string, now: string) {
    const { data, error } = await this.client.from('approval_action_tokens').select('*').eq('token_hash', tokenHash).is('used_at', null).gt('expires_at', now).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'workflow_store_error');
    return data ? (toCamel(data) as unknown as ApprovalActionToken) : null;
  }

  async consumeApprovalToken(tokenHash: string, actorId: string, now: string) {
    const { data, error } = await this.client.from('approval_action_tokens').update({ used_at: now })
      .eq('token_hash', tokenHash).eq('intended_actor_id', actorId).is('used_at', null).gt('expires_at', now).select().maybeSingle();
    if (error) throw new AppError(error.message, 500, 'workflow_store_error');
    return data ? (toCamel(data) as unknown as ApprovalActionToken) : null;
  }

  async createPublicationAttempt(input: PublicationAttempt) {
    const { data: existing, error: selectError } = await this.client.from('publication_attempts').select('*')
      .eq('review_id', input.reviewId).eq('channel', input.channel).eq('idempotency_key', input.idempotencyKey).maybeSingle();
    if (selectError) throw new AppError(selectError.message, 500, 'workflow_store_error');
    if (existing) return toCamel(existing) as unknown as PublicationAttempt;
    const { data, error } = await this.client.from('publication_attempts').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create publication attempt')) as unknown as PublicationAttempt;
  }

  async updatePublicationAttempt(id: string, patch: Partial<PublicationAttempt>) {
    const mutable = { ...patch } as Record<string, unknown>; delete mutable.id;
    const { data, error } = await this.client.from('publication_attempts').update(toSnake(mutable)).eq('id', id).select().single();
    return toCamel(required(data, error, 'Update publication attempt')) as unknown as PublicationAttempt;
  }

  async listPublicationAttempts(reviewId: string) {
    const { data, error } = await this.client.from('publication_attempts').select('*').eq('review_id', reviewId).order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'workflow_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as PublicationAttempt);
  }
}
