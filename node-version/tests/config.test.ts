import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config.js';

describe('settings.baseDir', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.NITRO_BASE_DIR;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NITRO_BASE_DIR;
    } else {
      process.env.NITRO_BASE_DIR = original;
    }
  });

  it('uses the configured directory when set', () => {
    process.env.NITRO_BASE_DIR = '/base-dir';
    expect(settings.baseDir).toBe('/base-dir');
  });

  it('falls back to the home directory when unset', () => {
    delete process.env.NITRO_BASE_DIR;
    expect(settings.baseDir).toBe(os.homedir());
  });

  it('falls back to the home directory when empty', () => {
    process.env.NITRO_BASE_DIR = '   ';
    expect(settings.baseDir).toBe(os.homedir());
  });

  it('falls back to the home directory when the host leaves a placeholder unexpanded', () => {
    process.env.NITRO_BASE_DIR = '${HOME}';
    expect(settings.baseDir).toBe(os.homedir());
  });

  it('falls back to the home directory on an unexpanded user_config placeholder', () => {
    process.env.NITRO_BASE_DIR = '${user_config.base_directory}';
    expect(settings.baseDir).toBe(os.homedir());
  });
});
