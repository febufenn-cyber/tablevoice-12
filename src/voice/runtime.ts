import { SupabaseVoiceStore } from './store';
import { VoiceSystemService, type VoiceSystemFactory } from './service';

export const voiceSystemForEnv: VoiceSystemFactory = (env) => new VoiceSystemService(
  new SupabaseVoiceStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
  { enabled: env.PHASE4_VOICE_ENABLED === 'true' },
);
