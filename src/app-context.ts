import { z } from 'zod';
import type { Actor, AuditEvent, RestaurantRole, Review } from './domain/types';
import type { AuthProvider } from './auth';
import type { Repository, RepositoryFactory } from './repositories/repository';
import type { ReviewIntelligence } from './services/intelligence';
import type { GoogleIntegrationFactory } from './integrations/google/service';
import { AppError } from './lib/errors';
import { newId } from './lib/id';

export type AppVariables = { actor: Actor; repository: Repository; intelligence: ReviewIntelligence };
export type AppEnv = { Bindings: CloudflareBindings; Variables: AppVariables };

export interface AppDependencies {
  authProvider?: AuthProvider;
  repositoryFactory?: RepositoryFactory;
  intelligenceFactory?: (env: CloudflareBindings) => ReviewIntelligence;
  googleIntegrationFactory?: GoogleIntegrationFactory;
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('Validation failed.', 422, 'validation_error', result.error.flatten());
  return result.data;
}

export async function jsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try { return await c.req.json(); }
  catch { throw new AppError('Request body must be valid JSON.', 400, 'invalid_json'); }
}

export async function requireOrganizationRole(repository: Repository, organizationId: string, actor: Actor, allowed: RestaurantRole[]) {
  const role = await repository.getOrganizationRole(organizationId, actor);
  if (!role || !allowed.includes(role)) throw new AppError('Insufficient organisation authority.', 403, 'forbidden');
  return role;
}

export async function requireRestaurantRole(repository: Repository, restaurantId: string, actor: Actor, allowed: RestaurantRole[]) {
  const role = await repository.getRestaurantRole(restaurantId, actor);
  if (!role || !allowed.includes(role)) throw new AppError('Insufficient restaurant authority.', 403, 'forbidden');
  return role;
}

export async function requireReviewRole(repository: Repository, reviewId: string, actor: Actor, allowed: RestaurantRole[]): Promise<Review> {
  const review = await repository.getReview(reviewId, actor);
  if (!review) throw new AppError('Review not found.', 404, 'not_found');
  await requireRestaurantRole(repository, review.restaurantId, actor, allowed);
  return review;
}

export async function audit(repository: Repository, actor: Actor, input: Omit<AuditEvent, 'id' | 'actorId' | 'createdAt'>) {
  return repository.createAuditEvent({ id: newId(), actorId: actor.id, ...input, createdAt: new Date().toISOString() }, actor);
}
