import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VoiceProfile } from '../domain/types';
import { AppError } from '../lib/errors';
import type {
  VoiceExample,
  VoiceProfileApproval,
  VoiceRule,
  VoiceRuleCandidate,
} from './types';

export interface VoiceStore {
  listProfiles(restaurantId: string): Promise<VoiceProfile[]>;
  getProfile(id: string): Promise<VoiceProfile | null>;
  createProfile(profile: VoiceProfile): Promise<VoiceProfile>;
  activateProfile(restaurantId: string, profileId: string): Promise<VoiceProfile>;
  listRules(profileId: string): Promise<VoiceRule[]>;
  addRule(rule: VoiceRule): Promise<VoiceRule>;
  listExamples(restaurantId: string): Promise<VoiceExample[]>;
  addExample(example: VoiceExample): Promise<VoiceExample>;
  listCandidates(restaurantId: string): Promise<VoiceRuleCandidate[]>;
  addCandidate(candidate: VoiceRuleCandidate): Promise<VoiceRuleCandidate>;
  updateCandidate(id: string, patch: Partial<VoiceRuleCandidate>): Promise<VoiceRuleCandidate>;
  addApproval(approval: VoiceProfileApproval): Promise<VoiceProfileApproval>;
  countDraftOutcomes(restaurantId: string, profileId: string): Promise<{
    generated: number;
    approvedUnchanged: number;
    minorEdits: number;
    majorEdits: number;
    rejected: number;
    replies: string[];
  }>;
}

function clone<T>(value: T): T { return structuredClone(value); }

export class MemoryVoiceStore implements VoiceStore {
  readonly profiles = new Map<string, VoiceProfile>();
  readonly rules = new Map<string, VoiceRule>();
  readonly examples = new Map<string, VoiceExample>();
  readonly candidates = new Map<string, VoiceRuleCandidate>();
  readonly approvals = new Map<string, VoiceProfileApproval>();
  outcomes = new Map<string, { generated: number; approvedUnchanged: number; minorEdits: number; majorEdits: number; rejected: number; replies: string[] }>();

  async listProfiles(restaurantId: string) {
    return [...this.profiles.values()].filter((item) => item.restaurantId === restaurantId).sort((a, b) => b.version - a.version).map(clone);
  }
  async getProfile(id: string) { return clone(this.profiles.get(id) ?? null); }
  async createProfile(profile: VoiceProfile) { this.profiles.set(profile.id, clone(profile)); return clone(profile); }
  async activateProfile(restaurantId: string, profileId: string) {
    const target = this.profiles.get(profileId);
    if (!target || target.restaurantId !== restaurantId) throw new AppError('Voice profile not found.', 404, 'not_found');
    for (const [id, profile] of this.profiles) {
      if (profile.restaurantId !== restaurantId) continue;
      this.profiles.set(id, { ...profile, status: id === profileId ? 'active' : profile.status === 'active' ? 'archived' : profile.status });
    }
    return clone(this.profiles.get(profileId)!);
  }
  async listRules(profileId: string) { return [...this.rules.values()].filter((item) => item.voiceProfileId === profileId).sort((a, b) => b.priority - a.priority).map(clone); }
  async addRule(rule: VoiceRule) { this.rules.set(rule.id, clone(rule)); return clone(rule); }
  async listExamples(restaurantId: string) { return [...this.examples.values()].filter((item) => item.restaurantId === restaurantId).map(clone); }
  async addExample(example: VoiceExample) { this.examples.set(example.id, clone(example)); return clone(example); }
  async listCandidates(restaurantId: string) { return [...this.candidates.values()].filter((item) => item.restaurantId === restaurantId).map(clone); }
  async addCandidate(candidate: VoiceRuleCandidate) { this.candidates.set(candidate.id, clone(candidate)); return clone(candidate); }
  async updateCandidate(id: string, patch: Partial<VoiceRuleCandidate>) {
    const current = this.candidates.get(id); if (!current) throw new AppError('Voice rule candidate not found.', 404, 'not_found');
    const updated = { ...current, ...patch }; this.candidates.set(id, clone(updated)); return clone(updated);
  }
  async addApproval(approval: VoiceProfileApproval) { this.approvals.set(approval.id, clone(approval)); return clone(approval); }
  async countDraftOutcomes(_restaurantId: string, profileId: string) {
    return clone(this.outcomes.get(profileId) ?? { generated: 0, approvedUnchanged: 0, minorEdits: 0, majorEdits: 0, rejected: 0, replies: [] });
  }
}

type JsonRow = Record<string, unknown>;
function toSnake(value: object): JsonRow {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]));
}
function toCamel(row: JsonRow): JsonRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
}
function required<T>(data: T | null, error: { message: string } | null, label: string): T {
  if (error) throw new AppError(`${label}: ${error.message}`, 500, 'voice_store_error');
  if (!data) throw new AppError(`${label} returned no data.`, 500, 'voice_store_error');
  return data;
}

export class SupabaseVoiceStore implements VoiceStore {
  private readonly client: SupabaseClient;
  constructor(url: string, serviceRoleKey: string) {
    if (!url || !serviceRoleKey) throw new AppError('Voice-system storage is not configured.', 503, 'voice_not_configured');
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  async listProfiles(restaurantId: string) {
    const { data, error } = await this.client.from('voice_profiles').select('*').eq('restaurant_id', restaurantId).order('version', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'voice_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as VoiceProfile);
  }
  async getProfile(id: string) {
    const { data, error } = await this.client.from('voice_profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'voice_store_error');
    return data ? (toCamel(data) as unknown as VoiceProfile) : null;
  }
  async createProfile(profile: VoiceProfile) {
    const { data, error } = await this.client.from('voice_profiles').insert(toSnake(profile)).select().single();
    return toCamel(required(data, error, 'Create voice profile')) as unknown as VoiceProfile;
  }
  async activateProfile(restaurantId: string, profileId: string) {
    const { error: archiveError } = await this.client.from('voice_profiles').update({ status: 'archived' }).eq('restaurant_id', restaurantId).eq('status', 'active');
    if (archiveError) throw new AppError(archiveError.message, 500, 'voice_store_error');
    const { data, error } = await this.client.from('voice_profiles').update({ status: 'active', approved_at: new Date().toISOString() }).eq('restaurant_id', restaurantId).eq('id', profileId).select().single();
    return toCamel(required(data, error, 'Activate voice profile')) as unknown as VoiceProfile;
  }
  async listRules(profileId: string) {
    const { data, error } = await this.client.from('voice_rules').select('*').eq('voice_profile_id', profileId).order('priority', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'voice_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as VoiceRule);
  }
  async addRule(rule: VoiceRule) {
    const { data, error } = await this.client.from('voice_rules').insert(toSnake(rule)).select().single();
    return toCamel(required(data, error, 'Add voice rule')) as unknown as VoiceRule;
  }
  async listExamples(restaurantId: string) {
    const { data, error } = await this.client.from('voice_examples').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'voice_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as VoiceExample);
  }
  async addExample(example: VoiceExample) {
    const { data, error } = await this.client.from('voice_examples').insert(toSnake(example)).select().single();
    return toCamel(required(data, error, 'Add voice example')) as unknown as VoiceExample;
  }
  async listCandidates(restaurantId: string) {
    const { data, error } = await this.client.from('voice_rule_candidates').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'voice_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as VoiceRuleCandidate);
  }
  async addCandidate(candidate: VoiceRuleCandidate) {
    const { data, error } = await this.client.from('voice_rule_candidates').insert(toSnake(candidate)).select().single();
    return toCamel(required(data, error, 'Add voice rule candidate')) as unknown as VoiceRuleCandidate;
  }
  async updateCandidate(id: string, patch: Partial<VoiceRuleCandidate>) {
    const mutable = { ...patch } as Record<string, unknown>; delete mutable.id; delete mutable.restaurantId;
    const { data, error } = await this.client.from('voice_rule_candidates').update(toSnake(mutable)).eq('id', id).select().single();
    return toCamel(required(data, error, 'Update voice rule candidate')) as unknown as VoiceRuleCandidate;
  }
  async addApproval(approval: VoiceProfileApproval) {
    const { data, error } = await this.client.from('voice_profile_approvals').insert(toSnake(approval)).select().single();
    return toCamel(required(data, error, 'Add voice approval')) as unknown as VoiceProfileApproval;
  }
  async countDraftOutcomes(restaurantId: string, profileId: string) {
    const { data: drafts, error: draftError } = await this.client.from('drafts').select('id,final_text,text,status').eq('voice_profile_id', profileId);
    if (draftError) throw new AppError(draftError.message, 500, 'voice_store_error');
    const ids = (drafts ?? []).map((row) => row.id as string);
    let approvals: Array<{ decision: string; approved_text?: string }> = [];
    if (ids.length) {
      const { data, error } = await this.client.from('approvals').select('decision,approved_text').in('draft_id', ids);
      if (error) throw new AppError(error.message, 500, 'voice_store_error'); approvals = (data ?? []) as Array<{ decision: string; approved_text?: string }>;
    }
    return {
      generated: drafts?.length ?? 0,
      approvedUnchanged: approvals.filter((item) => item.decision === 'approved_unchanged').length,
      minorEdits: approvals.filter((item) => item.decision === 'approved_minor_edit').length,
      majorEdits: approvals.filter((item) => item.decision === 'approved_major_edit').length,
      rejected: approvals.filter((item) => item.decision === 'rejected').length,
      replies: (drafts ?? []).map((item) => String(item.final_text ?? item.text ?? '')).filter(Boolean),
    };
  }
}
