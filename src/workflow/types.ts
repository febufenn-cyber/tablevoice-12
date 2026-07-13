import type { Approval, ReviewSource, ReviewState, RiskLevel } from '../domain/types';

export type WorkPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SlaStatus = 'on_track' | 'due_soon' | 'overdue' | 'paused' | 'completed';

export interface ReviewWorkItem {
  reviewId: string;
  restaurantId: string;
  state: ReviewState;
  risk: RiskLevel;
  priority: WorkPriority;
  assigneeId?: string;
  dueAt?: string;
  preview: string;
  rating: number;
  source: ReviewSource;
  reviewDate: string;
  reviewerDisplayName?: string;
  nextAction: string;
  contextSummary?: string;
  workflowVersion: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxCursor {
  updatedAt: string;
}

export interface InboxFilters {
  states?: ReviewState[];
  risks?: RiskLevel[];
  priorities?: WorkPriority[];
  assigneeId?: string | 'unassigned';
  overdue?: boolean;
  limit: number;
  cursor?: InboxCursor;
}

export interface InboxPage {
  items: Array<ReviewWorkItem & { slaStatus: SlaStatus }>;
  nextCursor?: string;
}

export interface InboxSummary {
  total: number;
  overdue: number;
  dueSoon: number;
  unassigned: number;
  byState: Partial<Record<ReviewState, number>>;
  byRisk: Partial<Record<RiskLevel, number>>;
  byPriority: Partial<Record<WorkPriority, number>>;
}

export interface ApprovalActionToken {
  id: string;
  restaurantId: string;
  reviewId: string;
  intendedActorId: string;
  tokenHash: string;
  allowedDecisions: Approval['decision'][];
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  usedAt?: string;
}

export type PublicationChannel = 'manual' | 'google';
export type PublicationAttemptStatus = 'in_progress' | 'succeeded' | 'unconfirmed' | 'failed';

export interface PublicationAttempt {
  id: string;
  restaurantId: string;
  reviewId: string;
  channel: PublicationChannel;
  status: PublicationAttemptStatus;
  attemptNumber: number;
  idempotencyKey: string;
  requestedBy: string;
  externalReference?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

export interface WorkItemPatch {
  assigneeId?: string | null;
  priority?: WorkPriority;
  dueAt?: string | null;
  contextSummary?: string | null;
}
