import type {
  Actor,
  Approval,
  AuditEvent,
  Draft,
  InternalAction,
  ModelRun,
  Review,
  VoiceProfile,
} from '../domain/types';
import { assertTransition } from '../domain/state-machine';
import { hasBlockingDefect, validateDraft } from '../domain/policies';
import { AppError } from '../lib/errors';
import { sha256 } from '../lib/hash';
import { newId } from '../lib/id';
import type { Repository } from '../repositories/repository';
import type { ReviewIntelligence } from './intelligence';

export class ReviewService {
  constructor(
    private readonly repository: Repository,
    private readonly intelligence: ReviewIntelligence,
    private readonly actor: Actor,
  ) {}

  async process(reviewId: string): Promise<{ review: Review; draft?: Draft; action?: InternalAction }> {
    const review = await this.requireReview(reviewId);
    if (!['verified', 'rejected', 'qa_required', 'needs_context'].includes(review.state)) {
      throw new AppError(`Review cannot be processed from state ${review.state}.`, 409, 'invalid_state');
    }

    if (review.state !== 'qa_required' && review.state !== 'rejected') {
      assertTransition(review.state, 'classifying');
      await this.repository.updateReview(review.id, { state: 'classifying', updatedAt: new Date().toISOString() }, this.actor);
    } else {
      assertTransition(review.state, 'drafting');
      await this.repository.updateReview(review.id, { state: 'drafting', updatedAt: new Date().toISOString() }, this.actor);
    }

    const voice = await this.getVoice(review.restaurantId);
    const inputHash = await sha256(JSON.stringify({ review: review.originalText, rating: review.rating, voice }));
    let result;
    try {
      result = await this.intelligence.classifyAndDraft(review, voice);
    } catch (error) {
      await this.repository.updateReview(review.id, { state: 'qa_required', updatedAt: new Date().toISOString() }, this.actor);
      await this.audit('model.failed', 'review', review.id, review.restaurantId, {
        message: error instanceof Error ? error.message : 'Unknown model failure',
      });
      throw error;
    }

    const modelRun: ModelRun = {
      id: newId(),
      restaurantId: review.restaurantId,
      reviewId: review.id,
      taskType: 'classify_and_draft',
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      inputHash,
      output: result.rawOutput,
      schemaValid: true,
      latencyMs: result.latencyMs,
      status: 'succeeded',
      createdAt: new Date().toISOString(),
    };
    await this.repository.createModelRun(modelRun, this.actor);

    const classified = await this.repository.updateReview(review.id, {
      classification: result.classification,
      state: result.classification.risk === 'red' ? 'escalated' : 'drafting',
      updatedAt: new Date().toISOString(),
    }, this.actor);

    let action: InternalAction | undefined;
    if (result.internalAction) {
      action = await this.repository.createInternalAction({
        id: newId(),
        restaurantId: review.restaurantId,
        reviewId: review.id,
        actionType: result.internalAction.actionType,
        description: result.internalAction.description,
        suggestedOwnerRole: result.internalAction.suggestedOwnerRole,
        ...(result.internalAction.assignedTo ? { assignedTo: result.internalAction.assignedTo } : {}),
        priority: result.internalAction.priority,
        ...(result.internalAction.dueAt ? { dueAt: result.internalAction.dueAt } : {}),
        status: 'open',
        ...(result.internalAction.completionEvidence ? { completionEvidence: result.internalAction.completionEvidence } : {}),
        createdAt: new Date().toISOString(),
      }, this.actor);
    }

    if (result.classification.risk === 'red') {
      await this.audit('review.escalated', 'review', review.id, review.restaurantId, {
        riskReason: result.classification.riskReason,
        policyFlags: result.classification.policyFlags,
      });
      return { review: classified, ...(action ? { action } : {}) };
    }

    const latest = await this.repository.getLatestDraft(review.id, this.actor);
    const now = new Date().toISOString();
    const draft = await this.repository.createDraft({
      id: newId(),
      reviewId: review.id,
      version: (latest?.version ?? 0) + 1,
      strategy: result.strategy,
      text: result.draft,
      status: 'generated',
      defects: [],
      modelRunId: modelRun.id,
      createdAt: now,
      updatedAt: now,
    }, this.actor);
    assertTransition('drafting', 'draft_ready');
    const updatedReview = await this.repository.updateReview(review.id, { state: 'draft_ready', updatedAt: now }, this.actor);
    await this.audit('draft.created', 'draft', draft.id, review.restaurantId, { reviewId: review.id, version: draft.version });
    return { review: updatedReview, draft, ...(action ? { action } : {}) };
  }

  async qa(reviewId: string, confirmedActions: string[]): Promise<{ review: Review; draft: Draft }> {
    const review = await this.requireReview(reviewId);
    if (!['draft_ready', 'qa_required'].includes(review.state)) {
      throw new AppError(`Review cannot enter QA from state ${review.state}.`, 409, 'invalid_state');
    }
    const draft = await this.repository.getLatestDraft(review.id, this.actor);
    if (!draft) throw new AppError('No draft exists for review.', 404, 'not_found');
    const voice = await this.getVoice(review.restaurantId);
    const defects = validateDraft(draft.text, voice, confirmedActions);
    const blocking = hasBlockingDefect(defects);
    const updatedDraft = await this.repository.updateDraft(draft.id, {
      defects,
      status: blocking ? 'qa_failed' : 'qa_passed',
      updatedAt: new Date().toISOString(),
    }, this.actor);

    const target = blocking ? 'qa_required' : 'awaiting_approval';
    if (review.state === 'draft_ready') assertTransition('draft_ready', 'qa_required');
    if (!blocking) assertTransition('qa_required', 'awaiting_approval');
    const updatedReview = await this.repository.updateReview(review.id, { state: target, updatedAt: new Date().toISOString() }, this.actor);
    await this.audit('draft.qa_completed', 'draft', draft.id, review.restaurantId, {
      blocking,
      defects: defects.map((defect) => ({ code: defect.code, severity: defect.severity })),
    });
    return { review: updatedReview, draft: updatedDraft };
  }

  async decide(
    reviewId: string,
    input: {
      decision: Approval['decision'];
      finalText?: string;
      editReason?: string;
      channel: Approval['channel'];
    },
  ): Promise<{ review: Review; approval: Approval; draft?: Draft }> {
    const review = await this.requireReview(reviewId);
    if (!['awaiting_approval', 'escalated'].includes(review.state)) {
      throw new AppError(`Review cannot be decided from state ${review.state}.`, 409, 'invalid_state');
    }
    const draft = await this.repository.getLatestDraft(review.id, this.actor);
    if (!draft && input.decision.startsWith('approved')) throw new AppError('Approved decision requires a draft.', 409, 'missing_draft');

    const mapping: Record<Approval['decision'], Review['state']> = {
      approved_unchanged: 'approved',
      approved_minor_edit: 'edited',
      approved_major_edit: 'edited',
      rejected: 'rejected',
      skipped: 'skipped',
      escalated: 'escalated',
    };
    const nextState = mapping[input.decision];
    if (review.state === 'awaiting_approval') assertTransition(review.state, nextState);
    if (review.state === 'escalated' && !['skipped', 'awaiting_approval', 'qa_required'].includes(nextState)) {
      if (!input.decision.startsWith('approved')) assertTransition(review.state, nextState);
    }

    let updatedDraft: Draft | undefined;
    if (draft) {
      updatedDraft = await this.repository.updateDraft(draft.id, {
        ...(input.finalText ? { finalText: input.finalText } : {}),
        status: input.decision === 'rejected' ? 'rejected' : input.decision.startsWith('approved') ? 'approved' : draft.status,
        updatedAt: new Date().toISOString(),
      }, this.actor);
    }

    const approval = await this.repository.createApproval({
      id: newId(),
      reviewId: review.id,
      draftId: draft?.id ?? newId(),
      decision: input.decision,
      ...(input.finalText ? { approvedText: input.finalText } : {}),
      ...(input.editReason ? { editReason: input.editReason } : {}),
      decidedBy: this.actor.id,
      decidedAt: new Date().toISOString(),
      channel: input.channel,
    }, this.actor);
    const updatedReview = await this.repository.updateReview(review.id, { state: nextState, updatedAt: new Date().toISOString() }, this.actor);
    await this.audit('review.decision_recorded', 'review', review.id, review.restaurantId, { decision: input.decision });
    return { review: updatedReview, approval, ...(updatedDraft ? { draft: updatedDraft } : {}) };
  }

  async confirmPublication(reviewId: string, confirmed: boolean, metadata: Record<string, unknown>): Promise<Review> {
    const review = await this.requireReview(reviewId);
    if (!['approved', 'edited', 'publishing_manually', 'publication_unconfirmed'].includes(review.state)) {
      throw new AppError(`Publication cannot be recorded from state ${review.state}.`, 409, 'invalid_state');
    }
    const nextState = confirmed ? 'published' : 'publication_unconfirmed';
    if (review.state !== 'publication_unconfirmed' || confirmed) assertTransition(review.state, nextState);
    const updated = await this.repository.updateReview(review.id, { state: nextState, updatedAt: new Date().toISOString() }, this.actor);
    await this.audit(confirmed ? 'response.published' : 'response.publication_unconfirmed', 'review', review.id, review.restaurantId, metadata);
    return updated;
  }

  async escalate(reviewId: string, reason: string): Promise<Review> {
    const review = await this.requireReview(reviewId);
    if (review.state !== 'escalated') assertTransition(review.state, 'escalated');
    const updated = await this.repository.updateReview(review.id, { state: 'escalated', updatedAt: new Date().toISOString() }, this.actor);
    await this.audit('review.escalated', 'review', review.id, review.restaurantId, { reason });
    return updated;
  }

  private async requireReview(id: string): Promise<Review> {
    const review = await this.repository.getReview(id, this.actor);
    if (!review) throw new AppError('Review not found.', 404, 'not_found');
    return review;
  }

  private async getVoice(restaurantId: string): Promise<VoiceProfile> {
    const voice = await this.repository.getActiveVoiceProfile(restaurantId, this.actor);
    if (!voice) throw new AppError('An active restaurant voice profile is required.', 409, 'voice_profile_required');
    return voice;
  }

  private async audit(action: string, resourceType: string, resourceId: string, restaurantId: string, metadata: Record<string, unknown>): Promise<AuditEvent> {
    return this.repository.createAuditEvent({
      id: newId(),
      actorId: this.actor.id,
      action,
      resourceType,
      resourceId,
      restaurantId,
      metadata,
      createdAt: new Date().toISOString(),
    }, this.actor);
  }
}
