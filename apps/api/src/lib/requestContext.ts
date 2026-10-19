import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context available anywhere down the call stack (e.g. inside HAYAT
 * code), so LLM calls can be attributed to the user who triggered them without
 * threading userId through every function signature.
 */
export interface RequestContext {
  userId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
