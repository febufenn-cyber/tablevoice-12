import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Actor,
  Approval,
  AuditEvent,
  Draft,
  InternalAction,
  ListingFinding,
  ModelRun,
  Organization,
  Restaurant,
  RestaurantRole,
  Review,
  VoiceProfile,
  WeeklyReport,
} from '../domain/types';
import { AppError } from '../lib/errors';
import type { Repository, RepositoryFactory, ReviewFilters } from './repository';

type JsonRow = Record<string, unknown>;

function toSnake(value: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = item;
  }
  return result;
}

function toCamel(row: JsonRow): JsonRow {
  const result: JsonRow = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return result;
}

function required<T>(data: T | null, error: { message: string } | null, label: string): T {
  if (error) throw new AppError(`${label}: ${error.message}`, 500, 'database_error');
  if (!data) throw new AppError(`${label} returned no data.`, 500, 'database_error');
  return data;
}

export class SupabaseRepositoryFactory implements RepositoryFactory {
  constructor(private readonly url: string, private readonly anonKey: string) {}

  forActor(actor: Actor): Repository {
    const headers = actor.accessToken ? { Authorization: `Bearer ${actor.accessToken}` } : undefined;
    const client = createClient(this.url, this.anonKey, {
      ...(headers ? { global: { headers } } : {}),
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return new SupabaseRepository(client);
  }
}

class SupabaseRepository implements Repository {
  constructor(private readonly client: SupabaseClient) {}

  async createOrganization(input: Organization): Promise<Organization> {
    const { data, error } = await this.client.from('organizations').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create organization')) as unknown as Organization;
  }

  async getOrganizationRole(organizationId: string, actor: Actor): Promise<RestaurantRole | null> {
    if (actor.platformRole === 'admin' || actor.platformRole === 'operator') return 'operator';
    const { data, error } = await this.client.from('organization_memberships').select('role').eq('organization_id', organizationId).eq('user_id', actor.id).eq('status', 'active').maybeSingle();
    if (error) throw new AppError(error.message, 500, 'database_error');
    return (data?.role as RestaurantRole | undefined) ?? null;
  }

  async getRestaurantRole(restaurantId: string, actor: Actor): Promise<RestaurantRole | null> {
    const restaurant = await this.getRestaurant(restaurantId);
    return restaurant ? this.getOrganizationRole(restaurant.organizationId, actor) : null;
  }

  async createRestaurant(input: Restaurant): Promise<Restaurant> {
    const { data, error } = await this.client.from('restaurants').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create restaurant')) as unknown as Restaurant;
  }

  async listRestaurants(): Promise<Restaurant[]> {
    const { data, error } = await this.client.from('restaurants').select('*').order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'database_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as Restaurant);
  }

  async getRestaurant(id: string): Promise<Restaurant | null> {
    const { data, error } = await this.client.from('restaurants').select('*').eq('id', id).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'database_error');
    return data ? (toCamel(data) as unknown as Restaurant) : null;
  }

  async createVoiceProfile(input: VoiceProfile): Promise<VoiceProfile> {
    if (input.status === 'active') {
      const { error: archiveError } = await this.client
        .from('voice_profiles')
        .update({ status: 'archived' })
        .eq('restaurant_id', input.restaurantId)
        .eq('status', 'active');
      if (archiveError) throw new AppError(archiveError.message, 500, 'database_error');
    }
    const { data, error } = await this.client.from('voice_profiles').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create voice profile')) as unknown as VoiceProfile;
  }

  async getActiveVoiceProfile(restaurantId: string): Promise<VoiceProfile | null> {
    const { data, error } = await this.client
      .from('voice_profiles')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new AppError(error.message, 500, 'database_error');
    return data ? (toCamel(data) as unknown as VoiceProfile) : null;
  }

  async createReview(input: Review): Promise<Review> {
    const { data, error } = await this.client.from('reviews').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create review')) as unknown as Review;
  }

  async getReview(id: string): Promise<Review | null> {
    const { data, error } = await this.client.from('reviews').select('*').eq('id', id).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'database_error');
    return data ? (toCamel(data) as unknown as Review) : null;
  }

  async listReviews(restaurantId: string, filters: ReviewFilters): Promise<Review[]> {
    let query = this.client.from('reviews').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (filters.state) query = query.eq('state', filters.state);
    if (filters.risk) query = query.eq('classification->>risk', filters.risk);
    const { data, error } = await query.limit(filters.limit ?? 100);
    if (error) throw new AppError(error.message, 500, 'database_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as Review);
  }

  async updateReview(id: string, patch: Partial<Review>): Promise<Review> {
    const mutable = { ...patch } as Record<string, unknown>;
    delete mutable.id;
    delete mutable.restaurantId;
    const { data, error } = await this.client.from('reviews').update(toSnake(mutable)).eq('id', id).select().single();
    return toCamel(required(data, error, 'Update review')) as unknown as Review;
  }

  async findDuplicateReview(review: Review): Promise<Review | null> {
    const { data, error } = await this.client
      .from('reviews')
      .select('*')
      .eq('restaurant_id', review.restaurantId)
      .eq('rating', review.rating)
      .eq('review_date', review.reviewDate)
      .eq('original_text_hash', await this.hashText(review.originalText))
      .neq('id', review.id)
      .limit(1)
      .maybeSingle();
    if (error) throw new AppError(error.message, 500, 'database_error');
    return data ? (toCamel(data) as unknown as Review) : null;
  }

  async deleteReview(id: string): Promise<void> {
    const { error } = await this.client.from('reviews').delete().eq('id', id);
    if (error) throw new AppError(error.message, 500, 'database_error');
  }

  async createDraft(input: Draft): Promise<Draft> {
    const { data, error } = await this.client.from('drafts').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create draft')) as unknown as Draft;
  }

  async getDraft(id: string): Promise<Draft | null> {
    const { data, error } = await this.client.from('drafts').select('*').eq('id', id).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'database_error');
    return data ? (toCamel(data) as unknown as Draft) : null;
  }

  async getLatestDraft(reviewId: string): Promise<Draft | null> {
    const { data, error } = await this.client
      .from('drafts')
      .select('*')
      .eq('review_id', reviewId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new AppError(error.message, 500, 'database_error');
    return data ? (toCamel(data) as unknown as Draft) : null;
  }

  async updateDraft(id: string, patch: Partial<Draft>): Promise<Draft> {
    const mutable = { ...patch } as Record<string, unknown>;
    delete mutable.id;
    delete mutable.reviewId;
    const { data, error } = await this.client.from('drafts').update(toSnake(mutable)).eq('id', id).select().single();
    return toCamel(required(data, error, 'Update draft')) as unknown as Draft;
  }

  async createApproval(input: Approval): Promise<Approval> {
    const { data, error } = await this.client.from('approvals').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create approval')) as unknown as Approval;
  }

  async createInternalAction(input: InternalAction): Promise<InternalAction> {
    const { data, error } = await this.client.from('internal_actions').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create internal action')) as unknown as InternalAction;
  }

  async listInternalActions(restaurantId: string): Promise<InternalAction[]> {
    const { data, error } = await this.client.from('internal_actions').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'database_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as InternalAction);
  }

  async getInternalAction(id: string): Promise<InternalAction | null> {
    const { data, error } = await this.client.from('internal_actions').select('*').eq('id', id).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'database_error');
    return data ? (toCamel(data) as unknown as InternalAction) : null;
  }

  async updateInternalAction(id: string, patch: Partial<InternalAction>): Promise<InternalAction> {
    const mutable = { ...patch } as Record<string, unknown>;
    delete mutable.id;
    delete mutable.restaurantId;
    const { data, error } = await this.client.from('internal_actions').update(toSnake(mutable)).eq('id', id).select().single();
    return toCamel(required(data, error, 'Update internal action')) as unknown as InternalAction;
  }

  async createListingFinding(input: ListingFinding): Promise<ListingFinding> {
    const { data, error } = await this.client.from('listing_findings').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create listing finding')) as unknown as ListingFinding;
  }

  async listListingFindings(restaurantId: string): Promise<ListingFinding[]> {
    const { data, error } = await this.client.from('listing_findings').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'database_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as ListingFinding);
  }

  async getListingFinding(id: string): Promise<ListingFinding | null> {
    const { data, error } = await this.client.from('listing_findings').select('*').eq('id', id).maybeSingle();
    if (error) throw new AppError(error.message, 500, 'database_error');
    return data ? (toCamel(data) as unknown as ListingFinding) : null;
  }

  async updateListingFinding(id: string, patch: Partial<ListingFinding>): Promise<ListingFinding> {
    const mutable = { ...patch } as Record<string, unknown>;
    delete mutable.id;
    delete mutable.restaurantId;
    const { data, error } = await this.client.from('listing_findings').update(toSnake(mutable)).eq('id', id).select().single();
    return toCamel(required(data, error, 'Update listing finding')) as unknown as ListingFinding;
  }

  async createWeeklyReport(input: WeeklyReport): Promise<WeeklyReport> {
    const { data, error } = await this.client.from('weekly_reports').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create weekly report')) as unknown as WeeklyReport;
  }

  async listWeeklyReports(restaurantId: string): Promise<WeeklyReport[]> {
    const { data, error } = await this.client.from('weekly_reports').select('*').eq('restaurant_id', restaurantId).order('period_end', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'database_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as WeeklyReport);
  }

  async createModelRun(input: ModelRun): Promise<ModelRun> {
    const { data, error } = await this.client.from('model_runs').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create model run')) as unknown as ModelRun;
  }

  async createAuditEvent(input: AuditEvent): Promise<AuditEvent> {
    const { data, error } = await this.client.from('audit_events').insert(toSnake(input)).select().single();
    return toCamel(required(data, error, 'Create audit event')) as unknown as AuditEvent;
  }

  async listAuditEvents(restaurantId: string): Promise<AuditEvent[]> {
    const { data, error } = await this.client.from('audit_events').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'database_error');
    return (data ?? []).map((row) => toCamel(row) as unknown as AuditEvent);
  }

  private async hashText(text: string): Promise<string> {
    const bytes = new TextEncoder().encode(text.trim().toLowerCase().replace(/\s+/g, ' '));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}
