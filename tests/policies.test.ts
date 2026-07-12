import { describe, expect, it } from 'vitest';
import { assessDeterministically, hasBlockingDefect, validateDraft } from '../src/domain/policies';
import type { VoiceProfile } from '../src/domain/types';

const voice: VoiceProfile = {
  id: 'voice',
  restaurantId: 'restaurant',
  version: 1,
  status: 'active',
  defaultLanguage: 'English',
  supportedLanguages: ['English'],
  formality: 3,
  warmth: 4,
  brevity: 3,
  wordMin: 5,
  wordMax: 80,
  emojiPolicy: 'none',
  preferredPhrases: [],
  prohibitedPhrases: ['valued customer'],
  compensationPolicy: 'approval_required',
  employeeNamePolicy: 'never',
  createdAt: new Date().toISOString(),
};

describe('risk and draft policies', () => {
  it('fails closed for food safety language', () => {
    const result = assessDeterministically('I became sick and went to hospital after eating here', 1);
    expect(result.risk).toBe('red');
    expect(result.primaryCategory).toBe('SAFETY');
  });

  it('treats ordinary praise as green', () => {
    const result = assessDeterministically('Great food and wonderful service', 5);
    expect(result.risk).toBe('green');
  });

  it('blocks invented investigations and compensation promises', () => {
    const defects = validateDraft('We investigated this and will give you a refund for the inconvenience.', voice);
    expect(defects.map((defect) => defect.code)).toContain('invented_investigation');
    expect(defects.map((defect) => defect.code)).toContain('unauthorised_compensation');
    expect(hasBlockingDefect(defects)).toBe(true);
  });
});
