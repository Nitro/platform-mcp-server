import fs from 'node:fs';
import path from 'node:path';
import { UserFacingError } from '../errors.js';
import { expandUser } from '../utils.js';

export interface FileEntry {
  readonly filePath: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

function _findAvailablePath(stem: string, extension: string, directory: string): string {
  const candidate = path.resolve(directory, `${stem}.${extension}`);
  if (!fs.existsSync(candidate)) {
    return candidate;
  }

  const maxAttempts = 1000;
  for (let counter = 1; counter <= maxAttempts; counter++) {
    const c = path.resolve(directory, `${stem}(${String(counter)}).${extension}`);
    if (!fs.existsSync(c)) {
      return c;
    }
  }

  throw new Error(`No available filename for '${stem}.${extension}' after ${String(maxAttempts)} attempts`);
}

export class FilesHandler {
  read(filePath: string): Buffer {
    const resolved = path.resolve(expandUser(filePath));
    if (!fs.existsSync(resolved)) {
      throw new UserFacingError(`File does not exist: ${resolved}`);
    }
    if (!fs.statSync(resolved).isFile()) {
      throw new UserFacingError(`Path is not a file: ${resolved}`);
    }
    return fs.readFileSync(resolved);
  }

  write(
    inputPath: string,
    data: Buffer,
    options?: { stemSuffix?: string; ext?: string },
  ): string {
    const resolved = path.resolve(expandUser(inputPath));
    const directory = path.dirname(resolved);
    const parsed = path.parse(resolved);

    let stem = parsed.name;
    if (options?.stemSuffix) {
      stem = `${stem}-${options.stemSuffix}`;
    }
    const extension = options?.ext ?? parsed.ext.replace(/^\./, '');
    const outputPath = _findAvailablePath(stem, extension, directory);
    fs.writeFileSync(outputPath, data);
    return outputPath;
  }

  listFiles(folder: string, extension?: string): FileEntry[] {
    const resolved = path.resolve(expandUser(folder));
    let entries: string[];
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        throw new UserFacingError(`Path is not a folder: ${resolved}`);
      }
      entries = fs.readdirSync(resolved);
    } catch (err) {
      if (err instanceof UserFacingError) {
        throw err;
      }
      throw new UserFacingError(`Folder does not exist or is unreadable: ${resolved}`);
    }
    const normalizedExtension = extension?.toLowerCase();

    return entries.flatMap((name) => {
      const fullPath = path.join(resolved, name);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        return [];
      }
      if (
        normalizedExtension !== undefined &&
        path.extname(name).replace(/^\./, '').toLowerCase() !== normalizedExtension
      ) {
        return [];
      }
      return [{ filePath: fullPath, mtimeMs: stat.mtimeMs, sizeBytes: stat.size }];
    });
  }
}
