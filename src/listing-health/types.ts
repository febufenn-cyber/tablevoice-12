export type ListingConfidence = 'high' | 'medium' | 'low';
export type ListingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export interface CanonicalBusinessFacts {
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  hours?: Record<string, string[]>;
  holidayHours?: Record<string, string[]>;
  serviceModes?: string[];
  orderingUrl?: string;
  reservationUrl?: string;
  menuUrl?: string;
  categories?: string[];
}

export interface BusinessFactVersion {
  id: string;
  restaurantId: string;
  version: number;
  status: 'active' | 'superseded';
  facts: CanonicalBusinessFacts;
  confirmationSource: string;
  confirmedBy: string;
  effectiveAt: string;
  expiresAt?: string;
  createdAt: string;
}

export interface ListingSourceObservation {
  id: string;
  restaurantId: string;
  source: 'manual' | 'website' | 'google' | 'other';
  sourceReference?: string;
  facts: CanonicalBusinessFacts;
  evidence?: string;
  confidence: ListingConfidence;
  observedAt: string;
  createdBy: string;
  createdAt: string;
}

export interface ListingComparisonRun {
  id: string;
  restaurantId: string;
  canonicalVersionId: string;
  observationId: string;
  inputHash: string;
  status: 'completed';
  findingCount: number;
  createdAt: string;
}

export interface ListingHealthFinding {
  id: string;
  restaurantId: string;
  comparisonRunId: string;
  field: string;
  canonicalValue: unknown;
  observedValue: unknown;
  severity: ListingSeverity;
  confidence: ListingConfidence;
  status: 'needs_confirmation' | 'confirmed_issue' | 'dismissed' | 'action_required' | 'corrected' | 'verification_pending' | 'closed';
  ownerConfirmation?: string;
  assignedTo?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListingCorrectionAttempt {
  id: string;
  restaurantId: string;
  findingId: string;
  evidence: string;
  performedBy: string;
  attemptedAt: string;
  verificationStatus: 'pending' | 'verified' | 'failed';
  verificationEvidence?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface ListingHealthSnapshot {
  restaurantId: string;
  canonicalVersion: number | null;
  observations: number;
  findings: Record<string, number>;
  bySeverity: Record<string, number>;
  generatedAt: string;
}
