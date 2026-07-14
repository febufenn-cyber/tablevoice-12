import { describe, expect, it } from 'vitest';
import type { Actor, VoiceProfile } from '../src/domain/types';
import { VoiceSystemService, replyRepetitionScore } from '../src/voice/service';
import { MemoryVoiceStore } from '../src/voice/store';

const actor: Actor = { id: '11111111-1111-4111-8111-111111111111', platformRole: 'user' };
const restaurantId = '22222222-2222-4222-8222-222222222222';

function baseProfile(id = '33333333-3333-4333-8333-333333333333'): VoiceProfile {
  return {
    id, restaurantId, version: 1, status: 'active', defaultLanguage: 'English', supportedLanguages: ['English'],
    formality: 3, warmth: 4, brevity: 3, wordMin: 10, wordMax: 80, emojiPolicy: 'none',
    preferredPhrases: ['We appreciate your visit.'], prohibitedPhrases: ['valued customer'],
    compensationPolicy: 'approval_required', employeeNamePolicy: 'never', createdAt: new Date().toISOString(),
  };
}

describe('Phase 4 voice system', () => {
  it('creates immutable versions, activates explicitly, and rolls back without deleting history', async () => {
    const store = new MemoryVoiceStore(); await store.createProfile(baseProfile());
    const service = new VoiceSystemService(store, { enabled: true });
    const draft = await service.createVersion(actor, restaurantId, { warmth: 5, preferredPhrases: ['Thank you for visiting us.'] });
    expect(draft.version).toBe(2); expect(draft.status).toBe('draft');
    const activated = await service.activate(actor, restaurantId, draft.id, 'Owner approved after side-by-side preview.');
    expect(activated.profile.status).toBe('active');
    expect((await service.listVersions(restaurantId)).find((item) => item.version === 1)?.status).toBe('archived');
    const rolledBack = await service.rollback(actor, restaurantId, baseProfile().id, 'Regression detected in acceptance review.');
    expect(rolledBack.profile.version).toBe(1);
    expect(await service.compare(restaurantId, baseProfile().id, draft.id)).toMatchObject({ changed: { warmth: { from: 4, to: 5 } } });
    expect(await service.listVersions(restaurantId)).toHaveLength(2);
  });

  it('does not let an unapproved candidate affect production voice', async () => {
    const store = new MemoryVoiceStore(); const active = baseProfile(); await store.createProfile(active);
    const service = new VoiceSystemService(store, { enabled: true });
    const candidate = await service.addCandidate(restaurantId, { kind: 'preferred_phrase', proposedValue: 'Come again soon!', scope: 'restaurant', reason: 'Owner used this edit repeatedly.' });
    const before = await service.preview(restaurantId, active.id, 'Great dinner', 'PRAISE', 'English');
    expect(before.reply).not.toContain('Come again soon!');
    const draft = await service.createVersion(actor, restaurantId, {});
    await service.decideCandidate(actor, restaurantId, candidate.id, 'approved', draft.id);
    const stillActive = await service.preview(restaurantId, active.id, 'Great dinner', 'PRAISE', 'English');
    expect(stillActive.reply).not.toContain('Come again soon!');
    const candidateVersion = await service.preview(restaurantId, draft.id, 'Great dinner', 'PRAISE', 'English');
    expect(candidateVersion.reply).toContain('Come again soon!');
  });

  it('blocks active-version mutation and flags prohibited or repetitive previews', async () => {
    const store = new MemoryVoiceStore(); const active = baseProfile(); await store.createProfile(active);
    const service = new VoiceSystemService(store, { enabled: true });
    await expect(service.addRule(actor, restaurantId, active.id, { kind: 'preferred_phrase', value: 'New phrase', priority: 50 })).rejects.toMatchObject({ code: 'voice_version_immutable' });
    const draft = await service.createVersion(actor, restaurantId, { preferredPhrases: ['valued customer'] });
    const preview = await service.preview(restaurantId, draft.id, 'Good food', 'PRAISE', 'English');
    expect(preview.warnings.some((warning) => warning.includes('Prohibited phrase'))).toBe(true);
    expect(replyRepetitionScore(['Thank you for visiting our restaurant', 'Thank you for visiting our restaurant'])).toBe(1);
  });

  it('keeps evaluation metrics scoped to the selected restaurant voice version', async () => {
    const store = new MemoryVoiceStore(); const active = baseProfile(); await store.createProfile(active);
    store.outcomes.set(active.id, { generated: 4, approvedUnchanged: 2, minorEdits: 1, majorEdits: 0, rejected: 1, replies: ['Thank you for visiting.', 'Thank you for visiting.'] });
    const service = new VoiceSystemService(store, { enabled: true });
    const metrics = await service.evaluation(restaurantId, active.id);
    expect(metrics.acceptanceRate).toBe(0.75);
    expect(metrics.repetitionScore).toBe(1);
    await expect(service.evaluation('99999999-9999-4999-8999-999999999999', active.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});
