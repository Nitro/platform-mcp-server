import { vi } from 'vitest';
import type { AppContext } from '../../src/context.js';
import type { FilesHandler } from '../../src/handlers/filesHandler.js';
import type { PlatformHandler } from '../../src/handlers/platformHandler.js';

export interface MockPlatformHandler {
  convertFile: ReturnType<typeof vi.fn>;
}

export interface MockFilesHandler {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  listFiles: ReturnType<typeof vi.fn>;
}

export function createPlatformHandlerMock(): MockPlatformHandler {
  return {
    convertFile: vi.fn(),
  };
}

export function createFilesHandlerMock(): MockFilesHandler {
  return {
    read: vi.fn(),
    write: vi.fn(),
    listFiles: vi.fn(),
  };
}

export function createAppContext(overrides: Partial<AppContext> = {}): AppContext {
  const defaultPlatformHandler = createPlatformHandlerMock() as unknown as PlatformHandler;
  const defaultFilesHandler = createFilesHandlerMock() as unknown as FilesHandler;

  return {
    platformHandler: overrides.platformHandler ?? defaultPlatformHandler,
    filesHandler: overrides.filesHandler ?? defaultFilesHandler,
  };
}
