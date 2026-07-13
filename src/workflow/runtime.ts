import { AppError } from '../lib/errors';
import { SupabaseWorkflowStore, type WorkflowStore } from './store';

export interface WorkflowRuntime {
  enabled: boolean;
  store?: WorkflowStore;
}

export type WorkflowFactory = (env: CloudflareBindings) => WorkflowRuntime;

export function workflowForEnv(env: CloudflareBindings): WorkflowRuntime {
  if (env.PHASE3_WORKFLOW_ENABLED !== 'true') return { enabled: false };
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError('PHASE3_WORKFLOW_ENABLED requires SUPABASE_SERVICE_ROLE_KEY.', 503, 'workflow_not_configured');
  }
  return {
    enabled: true,
    store: new SupabaseWorkflowStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function requireWorkflow(runtime: WorkflowRuntime): WorkflowStore {
  if (!runtime.enabled || !runtime.store) {
    throw new AppError('Phase 3 production workflow is disabled.', 503, 'workflow_disabled');
  }
  return runtime.store;
}
