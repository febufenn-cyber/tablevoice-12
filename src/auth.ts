import { createClient } from '@supabase/supabase-js';
import type { Actor } from './domain/types';
import { AppError } from './lib/errors';

export interface AuthProvider {
  authenticate(request: Request, env: CloudflareBindings): Promise<Actor>;
}

export class SupabaseAuthProvider implements AuthProvider {
  async authenticate(request: Request, env: CloudflareBindings): Promise<Actor> {
    if (env.DEV_AUTH_BYPASS === 'true') {
      return {
        id: request.headers.get('x-dev-user-id') ?? env.DEV_USER_ID ?? '00000000-0000-0000-0000-000000000001',
        email: request.headers.get('x-dev-user-email') ?? 'developer@tablevoice.local',
        platformRole: request.headers.get('x-dev-platform-role') === 'admin' ? 'admin' : 'operator',
      };
    }

    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) throw new AppError('Missing bearer token.', 401, 'unauthorized');

    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new AppError('Invalid or expired token.', 401, 'unauthorized');
    const rawRole = data.user.app_metadata?.platform_role;
    const platformRole = rawRole === 'admin' || rawRole === 'operator' ? rawRole : 'user';
    return {
      id: data.user.id,
      ...(data.user.email ? { email: data.user.email } : {}),
      platformRole,
      accessToken: token,
    };
  }
}

export class FixedAuthProvider implements AuthProvider {
  constructor(private readonly actor: Actor) {}
  async authenticate(): Promise<Actor> {
    return this.actor;
  }
}
