export type PlatformRole = 'user' | 'operator' | 'admin';
export type RestaurantRole = 'buyer' | 'approver' | 'operator' | 'action_owner' | 'viewer';

export interface Actor {
  id: string;
  email?: string;
  platformRole: PlatformRole;
  accessToken?: string;
}

export type ReviewSource = 'manual' | 'csv' | 'email' | 'google' | 'zomato';
export type ServiceMode = 'dine_in' | 'delivery' | 'takeaway' | 'unknown';
export type Sentiment = 'positive' | 'mixed' | 'negative' | 'neutral' | 'unclear';
export type RiskLevel = 'green' | 'amber' | 'red' | 'unknown';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type Urgency = 'immediate' | 'same_business_day' | 'normal';
export type Disposition =
  | 'reply_publicly'
  | 'reply_and_move_offline'
  | 'request_context'
  | 'report_and_consider_no_reply'
  | 'do_not_reply'
  | 'escalate';

export type ReviewCategory =
  | 'PRAISE'
  | 'FOOD_TASTE'
  | 'PORTION'
  | 'PRICE'
  | 'SPEED'
  | 'STAFF'
  | 'HYGIENE'
  | 'DELIVERY_DELAY'
  | 'MISSING_ITEM'
  | 'WRONG_ORDER'
  | 'PACKAGING'
  | 'AMBIENCE'
  | 'PARKING'
  | 'BILLING'
  | 'RESERVATION'
  | 'LISTING_INFO'
  | 'SAFETY'
  | 'HARASSMENT'
  | 'FRAUD'
  | 'FAKE_SUSPECTED'
  | 'OTHER';

export type ReviewState =
  | 'received'
  | 'needs_verification'
  | 'verified'
  | 'classifying'
  | 'classified'
  | 'needs_context'
  | 'drafting'
  | 'draft_ready'
  | 'qa_required'
  | 'awaiting_approval'
  | 'approved'
  | 'edited'
  | 'rejected'
  | 'skipped'
  | 'publishing_manually'
  | 'published'
  | 'publication_unconfirmed'
  | 'escalated'
  | 'closed';

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface Restaurant {
  id: string;
  organizationId: string;
  brandName: string;
  legalName?: string;
  cuisine?: string;
  positioning?: string;
  defaultLanguage: string;
  timezone: string;
  status: 'active' | 'paused' | 'deleting';
  createdAt: string;
}

export interface VoiceProfile {
  id: string;
  restaurantId: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  defaultLanguage: string;
  supportedLanguages: string[];
  formality: number;
  warmth: number;
  brevity: number;
  wordMin: number;
  wordMax: number;
  emojiPolicy: 'none' | 'limited' | 'allowed';
  preferredPhrases: string[];
  prohibitedPhrases: string[];
  contactChannel?: string;
  compensationPolicy: 'never' | 'approval_required' | 'rule_based';
  employeeNamePolicy: 'never' | 'approval_required';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface ReviewClassification {
  primaryCategory: ReviewCategory;
  secondaryCategories: ReviewCategory[];
  sentiment: Sentiment;
  risk: RiskLevel;
  confidence: ConfidenceLevel;
  urgency: Urgency;
  language: string;
  serviceMode: ServiceMode;
  safeFacts: string[];
  unverifiedClaims: string[];
  contextQuestions: string[];
  recommendedDisposition: Disposition;
  riskReason: string;
  replyStrategyReason: string;
  policyFlags: string[];
}

export interface Review {
  id: string;
  restaurantId: string;
  source: ReviewSource;
  sourceReference?: string;
  rating: number;
  reviewDate: string;
  reviewerDisplayName?: string;
  originalLanguage?: string;
  originalText: string;
  translatedText?: string;
  serviceMode: ServiceMode;
  ingestionMethod: 'manual' | 'csv' | 'email' | 'screenshot';
  verificationStatus: 'unverified' | 'verified';
  state: ReviewState;
  classification?: ReviewClassification;
  duplicateOf?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Draft {
  id: string;
  reviewId: string;
  version: number;
  strategy: string;
  text: string;
  finalText?: string;
  status: 'generated' | 'qa_passed' | 'qa_failed' | 'approved' | 'rejected';
  defects: DraftDefect[];
  modelRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export type DefectSeverity = 'critical' | 'major' | 'minor';
export interface DraftDefect {
  code: string;
  severity: DefectSeverity;
  message: string;
}

export interface Approval {
  id: string;
  reviewId: string;
  draftId: string;
  decision: 'approved_unchanged' | 'approved_minor_edit' | 'approved_major_edit' | 'rejected' | 'skipped' | 'escalated';
  approvedText?: string;
  editReason?: string;
  decidedBy: string;
  decidedAt: string;
  channel: 'web' | 'whatsapp_link' | 'email_link' | 'operator';
}

export interface InternalAction {
  id: string;
  restaurantId: string;
  reviewId?: string;
  actionType: string;
  description: string;
  suggestedOwnerRole: RestaurantRole;
  assignedTo?: string;
  priority: 'low' | 'medium' | 'high' | 'immediate';
  dueAt?: string;
  status: 'open' | 'in_progress' | 'completed' | 'dismissed';
  completionEvidence?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ListingFinding {
  id: string;
  restaurantId: string;
  field: string;
  sourceA: string;
  sourceAValue: string;
  sourceB: string;
  sourceBValue: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  confidence: ConfidenceLevel;
  status: 'observed' | 'needs_confirmation' | 'confirmed_issue' | 'dismissed' | 'action_required' | 'corrected' | 'verification_pending' | 'closed';
  ownerConfirmation?: string;
  recommendedAction: string;
  assignedTo?: string;
  dueAt?: string;
  resolvedAt?: string;
  evidence?: string;
  createdAt: string;
}

export interface WeeklyReport {
  id: string;
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  status: 'draft' | 'approved' | 'delivered';
  summary: Record<string, unknown>;
  createdAt: string;
  approvedAt?: string;
  deliveredAt?: string;
}

export interface ModelRun {
  id: string;
  restaurantId: string;
  reviewId: string;
  taskType: 'classify_and_draft' | 'validate' | 'weekly_report';
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  output: unknown;
  schemaValid: boolean;
  latencyMs: number;
  estimatedCost?: number;
  status: 'succeeded' | 'failed';
  error?: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  restaurantId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface IntelligenceResult {
  classification: ReviewClassification;
  internalAction?: Omit<InternalAction, 'id' | 'restaurantId' | 'reviewId' | 'createdAt' | 'status'>;
  strategy: string;
  draft: string;
  provider: string;
  model: string;
  promptVersion: string;
  rawOutput: unknown;
  latencyMs: number;
}
