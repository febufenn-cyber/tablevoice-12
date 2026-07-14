import { IncidentService, type IncidentFactory } from './service';
import { SupabaseIncidentStore } from './store';

export const incidentsForEnv: IncidentFactory = (env) => new IncidentService(
  new SupabaseIncidentStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
  { enabled: env.PHASE6_INCIDENTS_ENABLED === 'true' },
);
