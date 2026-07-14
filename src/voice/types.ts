import type { ReviewCategory, VoiceProfile } from '../domain/types';

export type VoiceRuleKind =
  | 'preferred_phrase'
  | 'prohibited_phrase'
  | 'greeting'
  | 'acknowledgement'
  | 'apology'
  | 'contact'
  | 'invitation'
  | 'signoff'
  | 'category_posture'
  | 'language_policy'
  | 'privacy_policy';

export interface VoiceRule {
  id: string;
  restaurantId: string;
  voiceProfileId: string;
  kind: VoiceRuleKind;
  value: string;
  category?: ReviewCategory;
  language?: string;
  priority: number;
  createdAt: string;
}

export interface VoiceExample {
  id: string;
  restaurantId: string;
  voiceProfileId?: string;
  disposition: 'approved' | 'rejected';
  reviewText: string;
  replyText: string;
  reason?: string;
  language: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
}

export interface VoiceRuleCandidate {
  id: string;
  restaurantId: string;
  sourceReviewId?: string;
  sourceDraftId?: string;
  kind: VoiceRuleKind;
  proposedValue: string;
  scope: 'restaurant' | 'category' | 'language' | 'one_off';
  category?: ReviewCategory;
  language?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface VoiceProfileApproval {
  id: string;
  restaurantId: string;
  voiceProfileId: string;
  action: 'activated' | 'rolled_back' | 'superseded';
  approvedBy: string;
  evidence: string;
  previousVoiceProfileId?: string;
  createdAt: string;
}

export interface VoiceEvaluation {
  restaurantId: string;
  voiceProfileId: string;
  voiceProfileVersion: number;
  generatedDrafts: number;
  approvedUnchanged: number;
  minorEdits: number;
  majorEdits: number;
  rejected: number;
  acceptanceRate: number | null;
  majorEditRate: number | null;
  repetitionScore: number;
  prohibitedPhraseViolations: number;
}

export interface VoicePreview {
  voiceProfileId: string;
  voiceProfileVersion: number;
  reviewText: string;
  category: ReviewCategory;
  language: string;
  reply: string;
  warnings: string[];
  repetitionScore: number;
}

export interface VoiceProfileBundle {
  profile: VoiceProfile;
  rules: VoiceRule[];
}

export interface VoiceVersionDiff {
  from: VoiceProfile;
  to: VoiceProfile;
  changed: Record<string, { from: unknown; to: unknown }>;
}
