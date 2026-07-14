import type { Actor, ReviewCategory, VoiceProfile } from '../domain/types';
import { AppError } from '../lib/errors';
import { newId } from '../lib/id';
import type { VoiceStore } from './store';
import type {
  VoiceEvaluation,
  VoiceExample,
  VoicePreview,
  VoiceProfileApproval,
  VoiceRule,
  VoiceRuleCandidate,
  VoiceVersionDiff,
} from './types';

export interface VoiceSystemConfig { enabled: boolean; }
export interface VoiceSystemFactory { (env: CloudflareBindings): VoiceSystemService; }

const immutableSafetyKinds = new Set(['privacy_policy']);

function normaliseText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function replyRepetitionScore(replies: string[]): number {
  if (replies.length < 2) return 0;
  const sets = replies.map((reply) => new Set(normaliseText(reply).split(' ').filter(Boolean)));
  let total = 0; let pairs = 0;
  for (let left = 0; left < sets.length; left += 1) {
    for (let right = left + 1; right < sets.length; right += 1) {
      const a = sets[left]; const b = sets[right];
      if (!a || !b) continue;
      const intersection = [...a].filter((word) => b.has(word)).length;
      const union = new Set([...a, ...b]).size;
      total += union ? intersection / union : 0; pairs += 1;
    }
  }
  return pairs ? Number((total / pairs).toFixed(4)) : 0;
}

function diffProfiles(from: VoiceProfile, to: VoiceProfile): VoiceVersionDiff {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(to) as Array<keyof VoiceProfile>) {
    if (['id', 'version', 'createdAt', 'approvedAt', 'approvedBy', 'status'].includes(String(key))) continue;
    if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) changed[String(key)] = { from: from[key], to: to[key] };
  }
  return { from, to, changed };
}

export class VoiceSystemService {
  constructor(readonly store: VoiceStore, readonly config: VoiceSystemConfig) {}

  private assertEnabled() {
    if (!this.config.enabled) throw new AppError('Phase 4 voice system is disabled.', 503, 'voice_disabled');
  }

  async createVersion(actor: Actor, restaurantId: string, input: Partial<VoiceProfile>): Promise<VoiceProfile> {
    this.assertEnabled();
    const profiles = await this.store.listProfiles(restaurantId);
    const base = profiles.find((item) => item.status === 'active') ?? profiles[0];
    const now = new Date().toISOString();
    const profile: VoiceProfile = {
      id: newId(), restaurantId, version: Math.max(0, ...profiles.map((item) => item.version)) + 1,
      status: 'draft', defaultLanguage: input.defaultLanguage ?? base?.defaultLanguage ?? 'English',
      supportedLanguages: input.supportedLanguages ?? base?.supportedLanguages ?? ['English'],
      formality: input.formality ?? base?.formality ?? 3, warmth: input.warmth ?? base?.warmth ?? 4,
      brevity: input.brevity ?? base?.brevity ?? 3, wordMin: input.wordMin ?? base?.wordMin ?? 12,
      wordMax: input.wordMax ?? base?.wordMax ?? 100, emojiPolicy: input.emojiPolicy ?? base?.emojiPolicy ?? 'none',
      preferredPhrases: input.preferredPhrases ?? base?.preferredPhrases ?? [],
      prohibitedPhrases: input.prohibitedPhrases ?? base?.prohibitedPhrases ?? [],
      ...(input.contactChannel ?? base?.contactChannel ? { contactChannel: input.contactChannel ?? base?.contactChannel } : {}),
      compensationPolicy: input.compensationPolicy ?? base?.compensationPolicy ?? 'approval_required',
      employeeNamePolicy: input.employeeNamePolicy ?? base?.employeeNamePolicy ?? 'never',
      createdAt: now,
    };
    return this.store.createProfile(profile);
  }

  async listVersions(restaurantId: string) { this.assertEnabled(); return this.store.listProfiles(restaurantId); }

  async compare(restaurantId: string, fromId: string, toId: string) {
    this.assertEnabled();
    const [from, to] = await Promise.all([this.store.getProfile(fromId), this.store.getProfile(toId)]);
    if (!from || !to || from.restaurantId !== restaurantId || to.restaurantId !== restaurantId) throw new AppError('Voice profile not found.', 404, 'not_found');
    return diffProfiles(from, to);
  }

  async activate(actor: Actor, restaurantId: string, profileId: string, evidence: string, action: VoiceProfileApproval['action'] = 'activated') {
    this.assertEnabled();
    if (!evidence.trim()) throw new AppError('Approval evidence is required.', 422, 'voice_evidence_required');
    const profiles = await this.store.listProfiles(restaurantId);
    const target = profiles.find((item) => item.id === profileId);
    if (!target) throw new AppError('Voice profile not found.', 404, 'not_found');
    const current = profiles.find((item) => item.status === 'active');
    const active = await this.store.activateProfile(restaurantId, profileId);
    const approval: VoiceProfileApproval = {
      id: newId(), restaurantId, voiceProfileId: profileId, action, approvedBy: actor.id,
      evidence, ...(current ? { previousVoiceProfileId: current.id } : {}), createdAt: new Date().toISOString(),
    };
    await this.store.addApproval(approval);
    return { profile: active, approval };
  }

  async rollback(actor: Actor, restaurantId: string, profileId: string, evidence: string) {
    return this.activate(actor, restaurantId, profileId, evidence, 'rolled_back');
  }

  async addRule(actor: Actor, restaurantId: string, profileId: string, input: Omit<VoiceRule, 'id' | 'restaurantId' | 'voiceProfileId' | 'createdAt'>) {
    this.assertEnabled();
    const profile = await this.store.getProfile(profileId);
    if (!profile || profile.restaurantId !== restaurantId) throw new AppError('Voice profile not found.', 404, 'not_found');
    if (profile.status === 'active') throw new AppError('Active voice versions are immutable. Create a draft version first.', 409, 'voice_version_immutable');
    const rule: VoiceRule = { id: newId(), restaurantId, voiceProfileId: profileId, ...input, createdAt: new Date().toISOString() };
    return this.store.addRule(rule);
  }

  async addExample(actor: Actor, restaurantId: string, input: Omit<VoiceExample, 'id' | 'restaurantId' | 'createdBy' | 'createdAt'>) {
    this.assertEnabled();
    const example: VoiceExample = { id: newId(), restaurantId, ...input, createdBy: actor.id, createdAt: new Date().toISOString() };
    return this.store.addExample(example);
  }

  async addCandidate(restaurantId: string, input: Omit<VoiceRuleCandidate, 'id' | 'restaurantId' | 'status' | 'createdAt'>) {
    this.assertEnabled();
    const candidate: VoiceRuleCandidate = { id: newId(), restaurantId, ...input, status: 'pending', createdAt: new Date().toISOString() };
    return this.store.addCandidate(candidate);
  }

  async decideCandidate(actor: Actor, restaurantId: string, candidateId: string, decision: 'approved' | 'rejected', targetProfileId?: string) {
    this.assertEnabled();
    const candidate = (await this.store.listCandidates(restaurantId)).find((item) => item.id === candidateId);
    if (!candidate) throw new AppError('Voice rule candidate not found.', 404, 'not_found');
    if (candidate.status !== 'pending') throw new AppError('Voice rule candidate was already decided.', 409, 'voice_candidate_decided');
    const decided = await this.store.updateCandidate(candidateId, { status: decision, decidedBy: actor.id, decidedAt: new Date().toISOString() });
    let rule: VoiceRule | undefined;
    if (decision === 'approved' && candidate.scope !== 'one_off') {
      if (!targetProfileId) throw new AppError('A draft target voice version is required.', 422, 'voice_target_required');
      if (immutableSafetyKinds.has(candidate.kind)) throw new AppError('Safety policy candidates require direct version editing and review.', 422, 'voice_safety_rule_restricted');
      rule = await this.addRule(actor, restaurantId, targetProfileId, {
        kind: candidate.kind, value: candidate.proposedValue, priority: 50,
        ...(candidate.category ? { category: candidate.category } : {}), ...(candidate.language ? { language: candidate.language } : {}),
      });
    }
    return { candidate: decided, ...(rule ? { rule } : {}) };
  }

  async preview(restaurantId: string, profileId: string, reviewText: string, category: ReviewCategory, language: string): Promise<VoicePreview> {
    this.assertEnabled();
    const profile = await this.store.getProfile(profileId);
    if (!profile || profile.restaurantId !== restaurantId) throw new AppError('Voice profile not found.', 404, 'not_found');
    const rules = await this.store.listRules(profileId);
    const examples = await this.store.listExamples(restaurantId);
    const preferred = [...profile.preferredPhrases, ...rules.filter((item) => item.kind === 'preferred_phrase').map((item) => item.value)];
    const prohibited = [...profile.prohibitedPhrases, ...rules.filter((item) => item.kind === 'prohibited_phrase').map((item) => item.value)];
    const greeting = rules.find((item) => item.kind === 'greeting' && (!item.language || item.language === language))?.value ?? 'Thank you for sharing your feedback.';
    const posture = rules.find((item) => item.kind === 'category_posture' && item.category === category)?.value;
    const signoff = rules.find((item) => item.kind === 'signoff')?.value;
    let reply = [greeting, posture, preferred[0], signoff].filter(Boolean).join(' ').trim();
    if (!reply) reply = 'Thank you for sharing your feedback.';
    const words = reply.split(/\s+/);
    if (words.length > profile.wordMax) reply = words.slice(0, profile.wordMax).join(' ');
    const warnings = prohibited.filter((phrase) => normaliseText(reply).includes(normaliseText(phrase))).map((phrase) => `Prohibited phrase: ${phrase}`);
    if (!profile.supportedLanguages.includes(language)) warnings.push(`Language ${language} is not approved; fallback to ${profile.defaultLanguage}.`);
    const recent = examples.filter((item) => item.disposition === 'approved').slice(0, 5).map((item) => item.replyText);
    const repetitionScore = replyRepetitionScore([...recent, reply]);
    if (repetitionScore > 0.72) warnings.push('Reply is too similar to recent approved examples.');
    return { voiceProfileId: profile.id, voiceProfileVersion: profile.version, reviewText, category, language, reply, warnings, repetitionScore };
  }

  async evaluation(restaurantId: string, profileId: string): Promise<VoiceEvaluation> {
    this.assertEnabled();
    const profile = await this.store.getProfile(profileId);
    if (!profile || profile.restaurantId !== restaurantId) throw new AppError('Voice profile not found.', 404, 'not_found');
    const outcomes = await this.store.countDraftOutcomes(restaurantId, profileId);
    const decided = outcomes.approvedUnchanged + outcomes.minorEdits + outcomes.majorEdits + outcomes.rejected;
    const prohibited = profile.prohibitedPhrases.map(normaliseText);
    return {
      restaurantId, voiceProfileId: profile.id, voiceProfileVersion: profile.version,
      generatedDrafts: outcomes.generated, approvedUnchanged: outcomes.approvedUnchanged,
      minorEdits: outcomes.minorEdits, majorEdits: outcomes.majorEdits, rejected: outcomes.rejected,
      acceptanceRate: decided ? Number(((outcomes.approvedUnchanged + outcomes.minorEdits + outcomes.majorEdits) / decided).toFixed(4)) : null,
      majorEditRate: decided ? Number((outcomes.majorEdits / decided).toFixed(4)) : null,
      repetitionScore: replyRepetitionScore(outcomes.replies),
      prohibitedPhraseViolations: outcomes.replies.filter((reply) => prohibited.some((phrase) => normaliseText(reply).includes(phrase))).length,
    };
  }
}
