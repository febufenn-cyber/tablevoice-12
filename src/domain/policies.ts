import type { DraftDefect, ReviewCategory, RiskLevel, VoiceProfile } from './types';

const redPatterns: Array<[string, RegExp]> = [
  ['food_safety', /food\s*poison|poisoning|allerg|anaphyl|foreign object|glass|metal|worm|insect|hospital|vomit|sick after/i],
  ['harassment_or_discrimination', /harass|sexual|molest|discriminat|racist|caste|assault|threatened|hit me/i],
  ['fraud_or_legal', /fraud|stole|theft|card misuse|police|lawyer|legal notice|court|consumer forum/i],
  ['child_safety', /child|kid|minor/i],
  ['self_harm', /suicide|self[- ]harm|kill myself/i],
  ['extortion', /pay me|compensate me.*delete|remove.*review|blackmail|extort/i],
];

const categoryPatterns: Array<[ReviewCategory, RegExp]> = [
  ['SAFETY', /food\s*poison|allerg|foreign object|glass|worm|sick after|became sick|hospital/i],
  ['HARASSMENT', /harass|discriminat|racist|caste|assault|threat/i],
  ['FRAUD', /fraud|stole|theft|card misuse/i],
  ['HYGIENE', /dirty|unclean|hygiene|cockroach|insect|smell/i],
  ['DELIVERY_DELAY', /delivery.*late|late delivery|delayed delivery/i],
  ['MISSING_ITEM', /missing item|item was missing|didn't receive/i],
  ['WRONG_ORDER', /wrong order|wrong item|ordered.*received/i],
  ['PACKAGING', /packag|leak|spill|container/i],
  ['SPEED', /waited|slow service|long wait|took .*minute/i],
  ['STAFF', /staff|waiter|server|cashier|manager|rude|helpful/i],
  ['BILLING', /bill|charged|payment|duplicate charge/i],
  ['PRICE', /expensive|overpriced|price|value for money/i],
  ['FOOD_TASTE', /taste|tasty|bland|salty|stale|delicious|food quality/i],
  ['PORTION', /portion|quantity|serving size/i],
  ['AMBIENCE', /ambience|atmosphere|noise|seating|air condition/i],
  ['PARKING', /parking|hard to find/i],
  ['RESERVATION', /reservation|booking|table not ready/i],
  ['LISTING_INFO', /wrong hours|phone number|location|closed when/i],
  ['FAKE_SUSPECTED', /never visited|fake review|no such order/i],
  ['PRAISE', /excellent|amazing|great|good|loved|wonderful|best/i],
];

export interface DeterministicAssessment {
  risk: RiskLevel;
  riskReason: string;
  policyFlags: string[];
  primaryCategory: ReviewCategory;
}

export function assessDeterministically(text: string, rating: number): DeterministicAssessment {
  const flags = redPatterns.filter(([, pattern]) => pattern.test(text)).map(([flag]) => flag);
  const primaryCategory = categoryPatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? (rating >= 4 ? 'PRAISE' : 'OTHER');

  if (flags.length > 0 || ['SAFETY', 'HARASSMENT', 'FRAUD'].includes(primaryCategory)) {
    return {
      risk: 'red',
      riskReason: `Sensitive trigger detected: ${flags.join(', ') || primaryCategory}`,
      policyFlags: flags,
      primaryCategory,
    };
  }

  if (rating <= 3 || !['PRAISE'].includes(primaryCategory)) {
    return {
      risk: 'amber',
      riskReason: rating <= 2 ? 'Low rating requires factual context and approval.' : 'Complaint or mixed feedback requires judgement.',
      policyFlags: flags,
      primaryCategory,
    };
  }

  return {
    risk: 'green',
    riskReason: 'Routine positive feedback with no sensitive trigger.',
    policyFlags: flags,
    primaryCategory,
  };
}

const compensation = /\b(refund|free meal|free item|discount|voucher|replace(?:ment)?|compensat(?:e|ion))\b/i;
const investigationClaim = /\b(we (?:have )?(?:investigated|reviewed|checked)|our investigation|we checked (?:the )?(?:cctv|records|order))\b/i;
const absoluteClaim = /\b(this never happens|always deliver|never make mistakes)\b/i;
const pressureRemoval = /\b(delete|remove|change) (?:this|your) review\b/i;

export function validateDraft(text: string, voice: VoiceProfile, confirmedActions: string[] = []): DraftDefect[] {
  const defects: DraftDefect[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  if (words < voice.wordMin) {
    defects.push({ code: 'too_short', severity: 'minor', message: `Draft has ${words} words; minimum is ${voice.wordMin}.` });
  }
  if (words > voice.wordMax) {
    defects.push({ code: 'too_long', severity: 'major', message: `Draft has ${words} words; maximum is ${voice.wordMax}.` });
  }
  for (const phrase of voice.prohibitedPhrases) {
    if (phrase.trim() && text.toLowerCase().includes(phrase.toLowerCase())) {
      defects.push({ code: 'prohibited_phrase', severity: 'major', message: `Contains prohibited phrase: ${phrase}` });
    }
  }
  if (voice.compensationPolicy !== 'rule_based' && compensation.test(text)) {
    defects.push({ code: 'unauthorised_compensation', severity: 'critical', message: 'Draft may promise compensation without recorded authority.' });
  }
  if (investigationClaim.test(text) && !confirmedActions.includes('investigation_completed')) {
    defects.push({ code: 'invented_investigation', severity: 'critical', message: 'Draft claims an investigation or record check that is not confirmed.' });
  }
  if (absoluteClaim.test(text)) {
    defects.push({ code: 'unverifiable_absolute', severity: 'major', message: 'Draft contains an unverifiable absolute claim.' });
  }
  if (pressureRemoval.test(text)) {
    defects.push({ code: 'review_pressure', severity: 'critical', message: 'Draft pressures the reviewer to alter or remove the review.' });
  }
  return defects;
}

export function hasBlockingDefect(defects: DraftDefect[]): boolean {
  return defects.some((defect) => defect.severity === 'critical' || defect.severity === 'major');
}
