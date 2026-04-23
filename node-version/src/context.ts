import type { FilesHandler } from './handlers/filesHandler.js';
import type { PlatformHandler } from './handlers/platformHandler.js';

export interface AppContext {
  readonly platformHandler: PlatformHandler;
  readonly filesHandler: FilesHandler;
}

export function getDep<K extends keyof AppContext>(ctx: AppContext, key: K): AppContext[K] {
  return ctx[key];
}
