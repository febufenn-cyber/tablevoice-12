import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../lib/errors';
import type {
  GoogleConnection,
  GoogleLocationCandidate,
  GoogleOAuthFlow,
  GoogleReviewLink,
  GoogleSyncRun,
} from './types';

export interface StoredGoogleLocation extends GoogleLocationCandidate {
  id: string;
  restaurantId: string;
  connectionId: string;
  selected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleIntegrationStore {
  createOAuthFlow(flow: GoogleOAuthFlow): Promise<GoogleOAuthFlow>;
  consumeOAuthFlow(stateHash: string, now: string): Promise<GoogleOAuthFlow | null>;
  getConnection(restaurantId: string): Promise<GoogleConnection | null>;
  upsertConnection(connection: GoogleConnection): Promise<GoogleConnection>;
  updateConnection(restaurantId: string, patch: Partial<GoogleConnection>): Promise<GoogleConnection>;
  replaceLocations(restaurantId: string, connectionId: string, locations: GoogleLocationCandidate[]): Promise<StoredGoogleLocation[]>;
  listLocations(restaurantId: string): Promise<StoredGoogleLocation[]>;
  selectLocation(restaurantId: string, locationName: string): Promise<StoredGoogleLocation>;
  createSyncRun(run: GoogleSyncRun): Promise<GoogleSyncRun>;
  updateSyncRun(id: string, patch: Partial<GoogleSyncRun>): Promise<GoogleSyncRun>;
  listSyncRuns(restaurantId: string): Promise<GoogleSyncRun[]>;
  findReviewLinkByGoogleName(restaurantId: string, googleReviewName: string): Promise<GoogleReviewLink | null>;
  findReviewLinkByLocalReviewId(localReviewId: string): Promise<GoogleReviewLink | null>;
  upsertReviewLink(link: GoogleReviewLink): Promise<GoogleReviewLink>;
  listExpiredReviewLinks(now: string, limit: number): Promise<GoogleReviewLink[]>;
  deleteReviewLink(id: string): Promise<void>;
}

function clone<T>(value: T): T { return structuredClone(value); }

export class MemoryGoogleIntegrationStore implements GoogleIntegrationStore {
  private readonly flows = new Map<string, GoogleOAuthFlow>();
  private readonly connections = new Map<string, GoogleConnection>();
  private readonly locations = new Map<string, StoredGoogleLocation>();
  private readonly syncRuns = new Map<string, GoogleSyncRun>();
  private readonly links = new Map<string, GoogleReviewLink>();

  async createOAuthFlow(flow: GoogleOAuthFlow) { this.flows.set(flow.stateHash, clone(flow)); return clone(flow); }
  async consumeOAuthFlow(stateHash: string, now: string) {
    const flow = this.flows.get(stateHash);
    if (!flow || flow.consumedAt || flow.expiresAt <= now) return null;
    flow.consumedAt = now; this.flows.set(stateHash, flow); return clone(flow);
  }
  async getConnection(restaurantId: string) { return clone(this.connections.get(restaurantId) ?? null); }
  async upsertConnection(connection: GoogleConnection) { this.connections.set(connection.restaurantId, clone(connection)); return clone(connection); }
  async updateConnection(restaurantId: string, patch: Partial<GoogleConnection>) {
    const existing = this.connections.get(restaurantId); if (!existing) throw new AppError('Google connection not found.', 404, 'not_found');
    const updated = { ...existing, ...patch }; this.connections.set(restaurantId, clone(updated)); return clone(updated);
  }
  async replaceLocations(restaurantId: string, connectionId: string, candidates: GoogleLocationCandidate[]) {
    for (const [id, location] of this.locations) if (location.restaurantId === restaurantId) this.locations.delete(id);
    const now = new Date().toISOString();
    const rows = candidates.map((candidate, index) => ({ ...candidate, id: `${connectionId}:${index}`, restaurantId, connectionId, selected: false, createdAt: now, updatedAt: now }));
    for (const row of rows) this.locations.set(row.id, clone(row)); return clone(rows);
  }
  async listLocations(restaurantId: string) { return clone([...this.locations.values()].filter((item) => item.restaurantId === restaurantId)); }
  async selectLocation(restaurantId: string, locationName: string) {
    let selected: StoredGoogleLocation | undefined;
    for (const [id, location] of this.locations) {
      if (location.restaurantId !== restaurantId) continue;
      const updated = { ...location, selected: location.name === locationName, updatedAt: new Date().toISOString() };
      this.locations.set(id, updated); if (updated.selected) selected = updated;
    }
    if (!selected) throw new AppError('Google location not found.', 404, 'not_found'); return clone(selected);
  }
  async createSyncRun(run: GoogleSyncRun) { this.syncRuns.set(run.id, clone(run)); return clone(run); }
  async updateSyncRun(id: string, patch: Partial<GoogleSyncRun>) {
    const existing = this.syncRuns.get(id); if (!existing) throw new AppError('Sync run not found.', 404, 'not_found');
    const updated = { ...existing, ...patch }; this.syncRuns.set(id, updated); return clone(updated);
  }
  async listSyncRuns(restaurantId: string) { return clone([...this.syncRuns.values()].filter((run) => run.restaurantId === restaurantId)); }
  async findReviewLinkByGoogleName(restaurantId: string, googleReviewName: string) {
    return clone([...this.links.values()].find((link) => link.restaurantId === restaurantId && link.googleReviewName === googleReviewName) ?? null);
  }
  async findReviewLinkByLocalReviewId(localReviewId: string) { return clone([...this.links.values()].find((link) => link.localReviewId === localReviewId) ?? null); }
  async upsertReviewLink(link: GoogleReviewLink) {
    const existing = [...this.links.values()].find((item) => item.restaurantId === link.restaurantId && item.googleReviewName === link.googleReviewName);
    const value = existing ? { ...link, id: existing.id, createdAt: existing.createdAt } : link;
    this.links.set(value.id, clone(value)); return clone(value);
  }
  async listExpiredReviewLinks(now: string, limit: number) { return clone([...this.links.values()].filter((link) => link.contentExpiresAt <= now).slice(0, limit)); }
  async deleteReviewLink(id: string) { this.links.delete(id); }
}

type JsonRow = Record<string, unknown>;
function toSnake(value: object): JsonRow {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]));
}
function toCamel(row: JsonRow): JsonRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
}
function required<T>(data: T | null, error: { message: string } | null, label: string): T {
  if (error) throw new AppError(`${label}: ${error.message}`, 500, 'google_store_error');
  if (!data) throw new AppError(`${label} returned no data.`, 500, 'google_store_error');
  return data;
}

export class SupabaseGoogleIntegrationStore implements GoogleIntegrationStore {
  private readonly client: SupabaseClient;
  constructor(url: string, serviceRoleKey: string) {
    if (!url || !serviceRoleKey) throw new AppError('Google integration storage is not configured.', 503, 'google_not_configured');
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  async createOAuthFlow(flow: GoogleOAuthFlow) {
    const { data, error } = await this.client.from('google_oauth_flows').insert(toSnake(flow)).select().single();
    return toCamel(required(data, error, 'Create Google OAuth flow')) as unknown as GoogleOAuthFlow;
  }
  async consumeOAuthFlow(stateHash: string, now: string) {
    const { data, error } = await this.client.from('google_oauth_flows').update({ consumed_at: now }).eq('state_hash', stateHash).is('consumed_at', null).gt('expires_at', now).select().maybeSingle();
    if (error) throw new AppError(error.message, 500, 'google_store_error');
    return data ? (toCamel(data) as unknown as GoogleOAuthFlow) : null;
  }
  async getConnection(restaurantId: string) {
    const { data, error } = await this.client.from('google_connections').select('*').eq('restaurant_id', restaurantId).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'google_store_error');
    return data ? (toCamel(data) as unknown as GoogleConnection) : null;
  }
  async upsertConnection(connection: GoogleConnection) {
    const { data, error } = await this.client.from('google_connections').upsert(toSnake(connection), { onConflict: 'restaurant_id' }).select().single();
    return toCamel(required(data, error, 'Upsert Google connection')) as unknown as GoogleConnection;
  }
  async updateConnection(restaurantId: string, patch: Partial<GoogleConnection>) {
    const mutable = { ...patch } as Record<string, unknown>; delete mutable.id; delete mutable.restaurantId;
    const { data, error } = await this.client.from('google_connections').update(toSnake(mutable)).eq('restaurant_id', restaurantId).select().single();
    return toCamel(required(data, error, 'Update Google connection')) as unknown as GoogleConnection;
  }
  async replaceLocations(restaurantId: string, connectionId: string, locations: GoogleLocationCandidate[]) {
    const { error: deleteError } = await this.client.from('google_location_candidates').delete().eq('restaurant_id', restaurantId);
    if (deleteError) throw new AppError(deleteError.message, 500, 'google_store_error');
    if (!locations.length) return [];
    const now = new Date().toISOString();
    const rows = locations.map((location) => toSnake({ ...location, restaurantId, connectionId, selected: false, createdAt: now, updatedAt: now }));
    const { data, error } = await this.client.from('google_location_candidates').insert(rows).select();
    if (error) throw new AppError(error.message, 500, 'google_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as StoredGoogleLocation);
  }
  async listLocations(restaurantId: string) {
    const { data, error } = await this.client.from('google_location_candidates').select('*').eq('restaurant_id', restaurantId).order('title');
    if (error) throw new AppError(error.message, 500, 'google_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as StoredGoogleLocation);
  }
  async selectLocation(restaurantId: string, locationName: string) {
    const { error: resetError } = await this.client.from('google_location_candidates').update({ selected: false }).eq('restaurant_id', restaurantId);
    if (resetError) throw new AppError(resetError.message, 500, 'google_store_error');
    const { data, error } = await this.client.from('google_location_candidates').update({ selected: true, updated_at: new Date().toISOString() }).eq('restaurant_id', restaurantId).eq('name', locationName).select().single();
    return toCamel(required(data, error, 'Select Google location')) as unknown as StoredGoogleLocation;
  }
  async createSyncRun(run: GoogleSyncRun) {
    const { data, error } = await this.client.from('google_sync_runs').insert(toSnake(run)).select().single();
    return toCamel(required(data, error, 'Create Google sync run')) as unknown as GoogleSyncRun;
  }
  async updateSyncRun(id: string, patch: Partial<GoogleSyncRun>) {
    const mutable = { ...patch } as Record<string, unknown>; delete mutable.id;
    const { data, error } = await this.client.from('google_sync_runs').update(toSnake(mutable)).eq('id', id).select().single();
    return toCamel(required(data, error, 'Update Google sync run')) as unknown as GoogleSyncRun;
  }
  async listSyncRuns(restaurantId: string) {
    const { data, error } = await this.client.from('google_sync_runs').select('*').eq('restaurant_id', restaurantId).order('started_at', { ascending: false }).limit(50);
    if (error) throw new AppError(error.message, 500, 'google_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as GoogleSyncRun);
  }
  async findReviewLinkByGoogleName(restaurantId: string, googleReviewName: string) {
    const { data, error } = await this.client.from('google_review_links').select('*').eq('restaurant_id', restaurantId).eq('google_review_name', googleReviewName).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'google_store_error');
    return data ? (toCamel(data) as unknown as GoogleReviewLink) : null;
  }
  async findReviewLinkByLocalReviewId(localReviewId: string) {
    const { data, error } = await this.client.from('google_review_links').select('*').eq('local_review_id', localReviewId).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'google_store_error');
    return data ? (toCamel(data) as unknown as GoogleReviewLink) : null;
  }
  async upsertReviewLink(link: GoogleReviewLink) {
    const { data, error } = await this.client.from('google_review_links').upsert(toSnake(link), { onConflict: 'restaurant_id,google_review_name' }).select().single();
    return toCamel(required(data, error, 'Upsert Google review link')) as unknown as GoogleReviewLink;
  }
  async listExpiredReviewLinks(now: string, limit: number) {
    const { data, error } = await this.client.from('google_review_links').select('*').lte('content_expires_at', now).limit(limit);
    if (error) throw new AppError(error.message, 500, 'google_store_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as GoogleReviewLink);
  }
  async deleteReviewLink(id: string) {
    const { error } = await this.client.from('google_review_links').delete().eq('id', id);
    if (error) throw new AppError(error.message, 500, 'google_store_error');
  }
}
