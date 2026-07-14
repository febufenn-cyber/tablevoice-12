import { ListingHealthService, type ListingHealthFactory } from './service';
import { SupabaseListingHealthStore } from './store';

export const listingHealthForEnv: ListingHealthFactory = (env) => new ListingHealthService(
  new SupabaseListingHealthStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
  { enabled: env.PHASE5_LISTING_HEALTH_ENABLED === 'true' },
);
