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
  ReviewState,
  VoiceProfile,
  WeeklyReport,
} from '../domain/types';

export interface ReviewFilters {
  state?: ReviewState;
  risk?: string;
  limit?: number;
}

export interface Repository {
  createOrganization(input: Organization, actor: Actor): Promise<Organization>;
  getOrganizationRole(organizationId: string, actor: Actor): Promise<RestaurantRole | null>;
  getRestaurantRole(restaurantId: string, actor: Actor): Promise<RestaurantRole | null>;
  createRestaurant(input: Restaurant, actor: Actor): Promise<Restaurant>;
  listRestaurants(actor: Actor): Promise<Restaurant[]>;
  getRestaurant(id: string, actor: Actor): Promise<Restaurant | null>;
  createVoiceProfile(input: VoiceProfile, actor: Actor): Promise<VoiceProfile>;
  getActiveVoiceProfile(restaurantId: string, actor: Actor): Promise<VoiceProfile | null>;

  createReview(input: Review, actor: Actor): Promise<Review>;
  getReview(id: string, actor: Actor): Promise<Review | null>;
  listReviews(restaurantId: string, filters: ReviewFilters, actor: Actor): Promise<Review[]>;
  updateReview(id: string, patch: Partial<Review>, actor: Actor): Promise<Review>;
  findDuplicateReview(review: Review, actor: Actor): Promise<Review | null>;
  deleteReview(id: string, actor: Actor): Promise<void>;

  createDraft(input: Draft, actor: Actor): Promise<Draft>;
  getDraft(id: string, actor: Actor): Promise<Draft | null>;
  getLatestDraft(reviewId: string, actor: Actor): Promise<Draft | null>;
  updateDraft(id: string, patch: Partial<Draft>, actor: Actor): Promise<Draft>;
  createApproval(input: Approval, actor: Actor): Promise<Approval>;

  createInternalAction(input: InternalAction, actor: Actor): Promise<InternalAction>;
  listInternalActions(restaurantId: string, actor: Actor): Promise<InternalAction[]>;
  getInternalAction(id: string, actor: Actor): Promise<InternalAction | null>;
  updateInternalAction(id: string, patch: Partial<InternalAction>, actor: Actor): Promise<InternalAction>;

  createListingFinding(input: ListingFinding, actor: Actor): Promise<ListingFinding>;
  listListingFindings(restaurantId: string, actor: Actor): Promise<ListingFinding[]>;
  getListingFinding(id: string, actor: Actor): Promise<ListingFinding | null>;
  updateListingFinding(id: string, patch: Partial<ListingFinding>, actor: Actor): Promise<ListingFinding>;

  createWeeklyReport(input: WeeklyReport, actor: Actor): Promise<WeeklyReport>;
  listWeeklyReports(restaurantId: string, actor: Actor): Promise<WeeklyReport[]>;
  createModelRun(input: ModelRun, actor: Actor): Promise<ModelRun>;
  createAuditEvent(input: AuditEvent, actor: Actor): Promise<AuditEvent>;
  listAuditEvents(restaurantId: string, actor: Actor): Promise<AuditEvent[]>;
}

export interface RepositoryFactory {
  forActor(actor: Actor): Repository;
}
