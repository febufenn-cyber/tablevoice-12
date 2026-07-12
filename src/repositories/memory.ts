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

interface MemoryState {
  organizations: Map<string, Organization>;
  restaurants: Map<string, Restaurant>;
  voiceProfiles: Map<string, VoiceProfile>;
  reviews: Map<string, Review>;
  drafts: Map<string, Draft>;
  approvals: Map<string, Approval>;
  actions: Map<string, InternalAction>;
  findings: Map<string, ListingFinding>;
  reports: Map<string, WeeklyReport>;
  modelRuns: Map<string, ModelRun>;
  auditEvents: Map<string, AuditEvent>;
  organizationMembers: Map<string, Map<string, RestaurantRole>>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryRepositoryFactory implements RepositoryFactory {
  readonly state: MemoryState = {
    organizations: new Map(),
    restaurants: new Map(),
    voiceProfiles: new Map(),
    reviews: new Map(),
    drafts: new Map(),
    approvals: new Map(),
    actions: new Map(),
    findings: new Map(),
    reports: new Map(),
    modelRuns: new Map(),
    auditEvents: new Map(),
    organizationMembers: new Map(),
  };

  forActor(): Repository {
    return new MemoryRepository(this.state);
  }
}

class MemoryRepository implements Repository {
  constructor(private readonly state: MemoryState) {}

  async createOrganization(input: Organization, actor: Actor): Promise<Organization> {
    this.state.organizations.set(input.id, clone(input));
    this.state.organizationMembers.set(input.id, new Map([[actor.id, 'buyer']]));
    return clone(input);
  }

  async getOrganizationRole(organizationId: string, actor: Actor): Promise<RestaurantRole | null> {
    if (actor.platformRole === 'admin' || actor.platformRole === 'operator') return 'operator';
    return this.state.organizationMembers.get(organizationId)?.get(actor.id) ?? null;
  }

  async getRestaurantRole(restaurantId: string, actor: Actor): Promise<RestaurantRole | null> {
    const restaurant = this.state.restaurants.get(restaurantId);
    return restaurant ? this.getOrganizationRole(restaurant.organizationId, actor) : null;
  }

  async createRestaurant(input: Restaurant, actor: Actor): Promise<Restaurant> {
    this.assertOrganizationAccess(input.organizationId, actor);
    this.state.restaurants.set(input.id, clone(input));
    return clone(input);
  }

  async listRestaurants(actor: Actor): Promise<Restaurant[]> {
    return [...this.state.restaurants.values()]
      .filter((restaurant) => this.canAccessOrganization(restaurant.organizationId, actor))
      .map(clone);
  }

  async getRestaurant(id: string, actor: Actor): Promise<Restaurant | null> {
    const value = this.state.restaurants.get(id);
    if (!value || !this.canAccessOrganization(value.organizationId, actor)) return null;
    return clone(value);
  }

  async createVoiceProfile(input: VoiceProfile, actor: Actor): Promise<VoiceProfile> {
    await this.assertRestaurantAccess(input.restaurantId, actor);
    if (input.status === 'active') {
      for (const [id, profile] of this.state.voiceProfiles.entries()) {
        if (profile.restaurantId === input.restaurantId && profile.status === 'active') {
          this.state.voiceProfiles.set(id, { ...profile, status: 'archived' });
        }
      }
    }
    this.state.voiceProfiles.set(input.id, clone(input));
    return clone(input);
  }

  async getActiveVoiceProfile(restaurantId: string, actor: Actor): Promise<VoiceProfile | null> {
    await this.assertRestaurantAccess(restaurantId, actor);
    const profiles = [...this.state.voiceProfiles.values()]
      .filter((profile) => profile.restaurantId === restaurantId && profile.status === 'active')
      .sort((a, b) => b.version - a.version);
    return profiles[0] ? clone(profiles[0]) : null;
  }

  async createReview(input: Review, actor: Actor): Promise<Review> {
    await this.assertRestaurantAccess(input.restaurantId, actor);
    this.state.reviews.set(input.id, clone(input));
    return clone(input);
  }

  async getReview(id: string, actor: Actor): Promise<Review | null> {
    const value = this.state.reviews.get(id);
    if (!value || !(await this.hasRestaurantAccess(value.restaurantId, actor))) return null;
    return clone(value);
  }

  async listReviews(restaurantId: string, filters: ReviewFilters, actor: Actor): Promise<Review[]> {
    await this.assertRestaurantAccess(restaurantId, actor);
    return [...this.state.reviews.values()]
      .filter((review) => review.restaurantId === restaurantId)
      .filter((review) => !filters.state || review.state === filters.state)
      .filter((review) => !filters.risk || review.classification?.risk === filters.risk)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filters.limit ?? 100)
      .map(clone);
  }

  async updateReview(id: string, patch: Partial<Review>, actor: Actor): Promise<Review> {
    const current = await this.requireReview(id, actor);
    const updated = { ...current, ...clone(patch), id: current.id, restaurantId: current.restaurantId };
    this.state.reviews.set(id, updated);
    return clone(updated);
  }

  async findDuplicateReview(review: Review, actor: Actor): Promise<Review | null> {
    await this.assertRestaurantAccess(review.restaurantId, actor);
    const normalised = review.originalText.trim().toLowerCase().replace(/\s+/g, ' ');
    const duplicate = [...this.state.reviews.values()].find((candidate) =>
      candidate.id !== review.id &&
      candidate.restaurantId === review.restaurantId &&
      candidate.rating === review.rating &&
      candidate.reviewDate === review.reviewDate &&
      candidate.originalText.trim().toLowerCase().replace(/\s+/g, ' ') === normalised,
    );
    return duplicate ? clone(duplicate) : null;
  }

  async deleteReview(id: string, actor: Actor): Promise<void> {
    await this.requireReview(id, actor);
    this.state.reviews.delete(id);
    for (const [draftId, draft] of this.state.drafts.entries()) if (draft.reviewId === id) this.state.drafts.delete(draftId);
  }

  async createDraft(input: Draft, actor: Actor): Promise<Draft> {
    const review = await this.requireReview(input.reviewId, actor);
    await this.assertRestaurantAccess(review.restaurantId, actor);
    this.state.drafts.set(input.id, clone(input));
    return clone(input);
  }

  async getDraft(id: string, actor: Actor): Promise<Draft | null> {
    const value = this.state.drafts.get(id);
    if (!value) return null;
    const review = await this.getReview(value.reviewId, actor);
    return review ? clone(value) : null;
  }

  async getLatestDraft(reviewId: string, actor: Actor): Promise<Draft | null> {
    await this.requireReview(reviewId, actor);
    const drafts = [...this.state.drafts.values()]
      .filter((draft) => draft.reviewId === reviewId)
      .sort((a, b) => b.version - a.version);
    return drafts[0] ? clone(drafts[0]) : null;
  }

  async updateDraft(id: string, patch: Partial<Draft>, actor: Actor): Promise<Draft> {
    const current = await this.getDraft(id, actor);
    if (!current) throw new AppError('Draft not found.', 404, 'not_found');
    const updated = { ...current, ...clone(patch), id: current.id, reviewId: current.reviewId };
    this.state.drafts.set(id, updated);
    return clone(updated);
  }

  async createApproval(input: Approval, actor: Actor): Promise<Approval> {
    await this.requireReview(input.reviewId, actor);
    this.state.approvals.set(input.id, clone(input));
    return clone(input);
  }

  async createInternalAction(input: InternalAction, actor: Actor): Promise<InternalAction> {
    await this.assertRestaurantAccess(input.restaurantId, actor);
    this.state.actions.set(input.id, clone(input));
    return clone(input);
  }

  async listInternalActions(restaurantId: string, actor: Actor): Promise<InternalAction[]> {
    await this.assertRestaurantAccess(restaurantId, actor);
    return [...this.state.actions.values()].filter((action) => action.restaurantId === restaurantId).map(clone);
  }

  async getInternalAction(id: string, actor: Actor): Promise<InternalAction | null> {
    const action = this.state.actions.get(id);
    if (!action || !(await this.hasRestaurantAccess(action.restaurantId, actor))) return null;
    return clone(action);
  }

  async updateInternalAction(id: string, patch: Partial<InternalAction>, actor: Actor): Promise<InternalAction> {
    const current = await this.getInternalAction(id, actor);
    if (!current) throw new AppError('Internal action not found.', 404, 'not_found');
    const updated = { ...current, ...clone(patch), id: current.id, restaurantId: current.restaurantId };
    this.state.actions.set(id, updated);
    return clone(updated);
  }

  async createListingFinding(input: ListingFinding, actor: Actor): Promise<ListingFinding> {
    await this.assertRestaurantAccess(input.restaurantId, actor);
    this.state.findings.set(input.id, clone(input));
    return clone(input);
  }

  async listListingFindings(restaurantId: string, actor: Actor): Promise<ListingFinding[]> {
    await this.assertRestaurantAccess(restaurantId, actor);
    return [...this.state.findings.values()].filter((finding) => finding.restaurantId === restaurantId).map(clone);
  }

  async getListingFinding(id: string, actor: Actor): Promise<ListingFinding | null> {
    const finding = this.state.findings.get(id);
    if (!finding || !(await this.hasRestaurantAccess(finding.restaurantId, actor))) return null;
    return clone(finding);
  }

  async updateListingFinding(id: string, patch: Partial<ListingFinding>, actor: Actor): Promise<ListingFinding> {
    const current = await this.getListingFinding(id, actor);
    if (!current) throw new AppError('Listing finding not found.', 404, 'not_found');
    const updated = { ...current, ...clone(patch), id: current.id, restaurantId: current.restaurantId };
    this.state.findings.set(id, updated);
    return clone(updated);
  }

  async createWeeklyReport(input: WeeklyReport, actor: Actor): Promise<WeeklyReport> {
    await this.assertRestaurantAccess(input.restaurantId, actor);
    this.state.reports.set(input.id, clone(input));
    return clone(input);
  }

  async listWeeklyReports(restaurantId: string, actor: Actor): Promise<WeeklyReport[]> {
    await this.assertRestaurantAccess(restaurantId, actor);
    return [...this.state.reports.values()].filter((report) => report.restaurantId === restaurantId).map(clone);
  }

  async createModelRun(input: ModelRun, actor: Actor): Promise<ModelRun> {
    await this.assertRestaurantAccess(input.restaurantId, actor);
    this.state.modelRuns.set(input.id, clone(input));
    return clone(input);
  }

  async createAuditEvent(input: AuditEvent, actor: Actor): Promise<AuditEvent> {
    if (input.restaurantId) await this.assertRestaurantAccess(input.restaurantId, actor);
    this.state.auditEvents.set(input.id, clone(input));
    return clone(input);
  }

  async listAuditEvents(restaurantId: string, actor: Actor): Promise<AuditEvent[]> {
    await this.assertRestaurantAccess(restaurantId, actor);
    return [...this.state.auditEvents.values()]
      .filter((event) => event.restaurantId === restaurantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  private canAccessOrganization(organizationId: string, actor: Actor): boolean {
    return actor.platformRole === 'admin' || actor.platformRole === 'operator' || Boolean(this.state.organizationMembers.get(organizationId)?.has(actor.id));
  }

  private assertOrganizationAccess(organizationId: string, actor: Actor): void {
    if (!this.canAccessOrganization(organizationId, actor)) throw new AppError('Forbidden.', 403, 'forbidden');
  }

  private async hasRestaurantAccess(restaurantId: string, actor: Actor): Promise<boolean> {
    const restaurant = this.state.restaurants.get(restaurantId);
    return Boolean(restaurant && this.canAccessOrganization(restaurant.organizationId, actor));
  }

  private async assertRestaurantAccess(restaurantId: string, actor: Actor): Promise<void> {
    if (!(await this.hasRestaurantAccess(restaurantId, actor))) throw new AppError('Restaurant not found or inaccessible.', 404, 'not_found');
  }

  private async requireReview(id: string, actor: Actor): Promise<Review> {
    const review = await this.getReview(id, actor);
    if (!review) throw new AppError('Review not found.', 404, 'not_found');
    return review;
  }
}
