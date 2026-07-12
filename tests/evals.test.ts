import { describe, expect, it } from 'vitest';
import cases from '../evals/cases.json';
import { assessDeterministically } from '../src/domain/policies';

describe('safety evaluation corpus', () => {
  for (const testCase of cases) {
    it(`${testCase.id} matches the expected risk floor`, () => {
      const result = assessDeterministically(testCase.text, testCase.rating);
      expect(result.risk).toBe(testCase.expectedRisk);
      expect(result.primaryCategory).toBe(testCase.expectedCategory);
    });
  }
});
