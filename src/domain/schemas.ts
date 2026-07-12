import { z } from 'zod';

export const organizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const restaurantCreateSchema = z.object({
  organizationId: z.uuid(),
  brandName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).optional(),
  cuisine: z.string().trim().max(120).optional(),
  positioning: z.string().trim().max(80).optional(),
  defaultLanguage: z.string().trim().min(2).max(40).default('English'),
  timezone: z.string().trim().min(2).max(80).default('Asia/Kolkata'),
});

export const voiceProfileCreateSchema = z.object({
  defaultLanguage: z.string().trim().min(2).max(40).default('English'),
  supportedLanguages: z.array(z.string().trim().min(2).max(40)).min(1).default(['English']),
  formality: z.number().int().min(1).max(5).default(3),
  warmth: z.number().int().min(1).max(5).default(4),
  brevity: z.number().int().min(1).max(5).default(3),
  wordMin: z.number().int().min(5).max(200).default(20),
  wordMax: z.number().int().min(20).max(500).default(100),
  emojiPolicy: z.enum(['none', 'limited', 'allowed']).default('none'),
  preferredPhrases: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  prohibitedPhrases: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  contactChannel: z.string().trim().max(160).optional(),
  compensationPolicy: z.enum(['never', 'approval_required', 'rule_based']).default('approval_required'),
  employeeNamePolicy: z.enum(['never', 'approval_required']).default('never'),
  activate: z.boolean().default(true),
});

export const reviewCreateSchema = z.object({
  source: z.enum(['manual', 'csv', 'email', 'google', 'zomato']).default('manual'),
  sourceReference: z.string().trim().max(500).optional(),
  rating: z.number().int().min(1).max(5),
  reviewDate: z.iso.date(),
  reviewerDisplayName: z.string().trim().max(160).optional(),
  originalLanguage: z.string().trim().max(40).optional(),
  originalText: z.string().trim().min(1).max(12000),
  translatedText: z.string().trim().max(12000).optional(),
  serviceMode: z.enum(['dine_in', 'delivery', 'takeaway', 'unknown']).default('unknown'),
  ingestionMethod: z.enum(['manual', 'csv', 'email', 'screenshot']).default('manual'),
  verified: z.boolean().default(true),
  autoProcess: z.boolean().default(false),
});

export const qaSchema = z.object({
  confirmedActions: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

export const approvalSchema = z.object({
  decision: z.enum(['approved_unchanged', 'approved_minor_edit', 'approved_major_edit', 'rejected', 'skipped', 'escalated']),
  finalText: z.string().trim().max(12000).optional(),
  editReason: z.string().trim().max(500).optional(),
  channel: z.enum(['web', 'whatsapp_link', 'email_link', 'operator']).default('web'),
}).superRefine((value, ctx) => {
  if (value.decision.startsWith('approved') && !value.finalText) {
    ctx.addIssue({ code: 'custom', path: ['finalText'], message: 'Approved decisions require finalText.' });
  }
});

export const publicationSchema = z.object({
  confirmed: z.boolean(),
  evidence: z.string().trim().max(1000).optional(),
  reasonNotPublished: z.string().trim().max(500).optional(),
});

export const actionUpdateSchema = z.object({
  assignedTo: z.uuid().optional(),
  status: z.enum(['open', 'in_progress', 'completed', 'dismissed']).optional(),
  completionEvidence: z.string().trim().max(2000).optional(),
  dueAt: z.iso.datetime().optional(),
});

export const listingFindingSchema = z.object({
  field: z.string().trim().min(1).max(120),
  sourceA: z.string().trim().min(1).max(200),
  sourceAValue: z.string().trim().max(2000),
  sourceB: z.string().trim().min(1).max(200),
  sourceBValue: z.string().trim().max(2000),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'informational']),
  confidence: z.enum(['high', 'medium', 'low']),
  recommendedAction: z.string().trim().min(1).max(2000),
  assignedTo: z.uuid().optional(),
  dueAt: z.iso.datetime().optional(),
});

export const listingConfirmSchema = z.object({
  result: z.enum(['confirmed_issue', 'dismissed', 'action_required', 'corrected', 'verification_pending', 'closed']),
  ownerConfirmation: z.string().trim().min(1).max(1000),
  evidence: z.string().trim().max(2000).optional(),
});

export const intelligenceResponseSchema = z.object({
  classification: z.object({
    primaryCategory: z.enum(['PRAISE','FOOD_TASTE','PORTION','PRICE','SPEED','STAFF','HYGIENE','DELIVERY_DELAY','MISSING_ITEM','WRONG_ORDER','PACKAGING','AMBIENCE','PARKING','BILLING','RESERVATION','LISTING_INFO','SAFETY','HARASSMENT','FRAUD','FAKE_SUSPECTED','OTHER']),
    secondaryCategories: z.array(z.enum(['PRAISE','FOOD_TASTE','PORTION','PRICE','SPEED','STAFF','HYGIENE','DELIVERY_DELAY','MISSING_ITEM','WRONG_ORDER','PACKAGING','AMBIENCE','PARKING','BILLING','RESERVATION','LISTING_INFO','SAFETY','HARASSMENT','FRAUD','FAKE_SUSPECTED','OTHER'])),
    sentiment: z.enum(['positive', 'mixed', 'negative', 'neutral', 'unclear']),
    risk: z.enum(['green', 'amber', 'red', 'unknown']),
    confidence: z.enum(['high', 'medium', 'low']),
    urgency: z.enum(['immediate', 'same_business_day', 'normal']),
    language: z.string(),
    serviceMode: z.enum(['dine_in', 'delivery', 'takeaway', 'unknown']),
    safeFacts: z.array(z.string()),
    unverifiedClaims: z.array(z.string()),
    contextQuestions: z.array(z.string()),
    recommendedDisposition: z.enum(['reply_publicly','reply_and_move_offline','request_context','report_and_consider_no_reply','do_not_reply','escalate']),
    riskReason: z.string(),
    replyStrategyReason: z.string(),
    policyFlags: z.array(z.string()),
  }),
  internalAction: z.object({
    actionType: z.string(),
    description: z.string(),
    suggestedOwnerRole: z.enum(['buyer', 'approver', 'operator', 'action_owner', 'viewer']),
    assignedTo: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'immediate']),
    dueAt: z.string().optional(),
    completionEvidence: z.string().optional(),
  }).optional(),
  strategy: z.string(),
  draft: z.string(),
});
