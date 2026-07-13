import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { AppDependencies, AppEnv } from './app-context';
import { SupabaseAuthProvider } from './auth';
import { asAppError } from './lib/errors';
import { SupabaseRepositoryFactory } from './repositories/supabase';
import { intelligenceForEnv } from './services/intelligence';
import { registerFoundationRoutes } from './routes/foundation';
import { registerReviewRoutes } from './routes/reviews';
import { registerOperationsRoutes } from './routes/operations';
import { registerGoogleRoutes } from './routes/google';
import { googleIntegrationForEnv } from './integrations/google/service';

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono<AppEnv>();
  const authProvider = dependencies.authProvider ?? new SupabaseAuthProvider();
  app.use('*', secureHeaders());
  app.use('/v1/*', cors({ origin: '*', allowHeaders: ['authorization', 'content-type', 'x-dev-user-id', 'x-dev-platform-role'] }));
  app.get('/health', (c) => c.json({ status: 'ok', phase: 2, service: 'tablevoice' }));
  app.use('/v1/*', async (c, next) => {
    const actor = await authProvider.authenticate(c.req.raw, c.env);
    const factory = dependencies.repositoryFactory ?? new SupabaseRepositoryFactory(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
    c.set('actor', actor); c.set('repository', factory.forActor(actor));
    c.set('intelligence', (dependencies.intelligenceFactory ?? intelligenceForEnv)(c.env));
    await next();
  });
  registerFoundationRoutes(app);
  registerReviewRoutes(app);
  registerOperationsRoutes(app);
  registerGoogleRoutes(app, dependencies.googleIntegrationFactory ?? googleIntegrationForEnv);
  app.notFound(async (c) => c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.json({ error: { code: 'not_found', message: 'Route not found.' } }, 404));
  app.onError((error, c) => {
    const appError = asAppError(error);
    return c.json({ error: { code: appError.code, message: appError.message, details: appError.details } }, appError.status as 400);
  });
  return app;
}
