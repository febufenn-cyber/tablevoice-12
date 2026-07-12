import { describe, expect, it } from 'vitest';
import { allowedTransitions, assertTransition, canTransition } from '../src/domain/state-machine';

describe('review state machine', () => {
  it('allows the controlled approval path', () => {
    expect(canTransition('verified', 'classifying')).toBe(true);
    expect(canTransition('draft_ready', 'qa_required')).toBe(true);
    expect(canTransition('qa_required', 'awaiting_approval')).toBe(true);
    expect(canTransition('awaiting_approval', 'approved')).toBe(true);
    expect(canTransition('approved', 'published')).toBe(true);
  });

  it('blocks uncontrolled publication', () => {
    expect(() => assertTransition('received', 'published')).toThrow('Invalid review transition');
    expect(allowedTransitions('received')).not.toContain('published');
  });

  it('makes closed terminal', () => {
    expect(allowedTransitions('closed')).toEqual([]);
  });
});
