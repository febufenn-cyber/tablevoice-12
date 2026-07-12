import type { ReviewState } from './types';

const transitions: Record<ReviewState, readonly ReviewState[]> = {
  received: ['needs_verification', 'verified', 'closed'],
  needs_verification: ['verified', 'closed'],
  verified: ['classifying', 'closed'],
  classifying: ['classified', 'qa_required', 'escalated'],
  classified: ['needs_context', 'drafting', 'escalated'],
  needs_context: ['classified', 'drafting', 'escalated', 'closed'],
  drafting: ['draft_ready', 'qa_required', 'escalated'],
  draft_ready: ['qa_required', 'escalated'],
  qa_required: ['awaiting_approval', 'drafting', 'escalated', 'closed'],
  awaiting_approval: ['approved', 'edited', 'rejected', 'skipped', 'escalated'],
  approved: ['publishing_manually', 'published', 'publication_unconfirmed', 'closed'],
  edited: ['publishing_manually', 'published', 'publication_unconfirmed', 'closed'],
  rejected: ['drafting', 'closed'],
  skipped: ['closed'],
  publishing_manually: ['published', 'publication_unconfirmed', 'closed'],
  publication_unconfirmed: ['published', 'closed'],
  published: ['closed'],
  escalated: ['qa_required', 'awaiting_approval', 'skipped', 'closed'],
  closed: [],
};

export function canTransition(from: ReviewState, to: ReviewState): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: ReviewState, to: ReviewState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid review transition: ${from} -> ${to}`);
  }
}

export function allowedTransitions(from: ReviewState): readonly ReviewState[] {
  return transitions[from];
}
