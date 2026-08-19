import fs from 'node:fs';
import path from 'node:path';
import { UserFacingError } from '../errors.js';
import { expandUser } from '../utils.js';

export interface FileEntry {
  readonly filePath: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

function _realpathIfExists(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

function _pathTaken(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function _realTarget(resolved: string): string {
  try {
    return fs.realpathSync(resolved);
  } catch {
    // The path does not exist, or is a dangling symlink.
  }
  let leaf = resolved;
  try {
    // A dangling symlink must be judged by where it points, not where it
    // sits — writing through it would create the file at its target.
    leaf = path.resolve(path.dirname(resolved), fs.readlinkSync(resolved));
  } catch {
    // Not a symlink — a genuinely nonexistent path; validate via its parent.
  }
  return path.join(_realpathIfExists(path.dirname(leaf)), path.basename(leaf));
}

function _resolveWithinBase(rawPath: string, baseDir: string, kind: 'File' | 'Folder'): string {
  const resolved = path.resolve(expandUser(rawPath));
  const realBase = _realpathIfExists(baseDir);
  const real = _realTarget(resolved);
  const basePrefix = realBase.endsWith(path.sep) ? realBase : realBase + path.sep;
  if (real !== realBase && !real.startsWith(basePrefix)) {
    throw new UserFacingError(`${kind} path must be within the allowed base directory: ${rawPath}`);
  }
  return resolved;
}

function _findAvailablePath(stem: string, extension: string, directory: string): string {
  const candidate = path.resolve(directory, `${stem}.${extension}`);
  if (!_pathTaken(candidate)) {
    return candidate;
  }

  const maxAttempts = 1000;
  for (let counter = 1; counter <= maxAttempts; counter++) {
    const c = path.resolve(directory, `${stem}(${String(counter)}).${extension}`);
    if (!_pathTaken(c)) {
      return c;
    }
  }

  throw new Error(
    `No available filename for '${stem}.${extension}' after ${String(maxAttempts)} attempts`,
  );
}

export class FilesHandler {
  private readonly _baseDir: string;

  constructor(baseDir: string) {
    this._baseDir = path.resolve(expandUser(baseDir));
  }

  private _searchFolderInBase(name: string): string | null {
    try {
      const entries = fs.readdirSync(this._baseDir, { withFileTypes: true });
      const nameLower = name.toLowerCase();
      for (const entry of entries) {
        if (entry.name.toLowerCase() === nameLower) {
          const entryPath = path.join(this._baseDir, entry.name);
          if (fs.statSync(entryPath).isDirectory()) {
            return entryPath;
          }
        }
      }
    } catch {
      // Ignore errors and fall back to normal path resolution below.
    }
    return null;
  }

  private _resolveFolder(folder: string): string {
    if (
      folder === '~' ||
      folder.startsWith('~/') ||
      folder.startsWith('~\\') ||
      path.isAbsolute(folder)
    ) {
      return _resolveWithinBase(folder, this._baseDir, 'Folder');
    }
    const parts = path.normalize(folder).split(path.sep);
    const firstPart = parts[0];
    let resolved: string;
    if (firstPart !== undefined) {
      const found = this._searchFolderInBase(firstPart);
      resolved =
        found !== null
          ? path.resolve(path.join(found, ...parts.slice(1)))
          : path.resolve(this._baseDir, folder);
    } else {
      resolved = path.resolve(this._baseDir, folder);
    }
    return _resolveWithinBase(resolved, this._baseDir, 'Folder');
  }

  read(filePath: string): Buffer {
    if (
      !path.isAbsolute(filePath) &&
      !filePath.startsWith('~/') &&
      !filePath.startsWith('~\\') &&
      filePath !== '~'
    ) {
      throw new UserFacingError(
        `inputPath must be an absolute path or start with ~. Use list_files to find the full path.`,
      );
    }
    if (filePath === '~') {
      throw new UserFacingError(
        `inputPath must point to a file, not a directory. Provide a full file path such as '~/Downloads/file.pdf'.`,
      );
    }
    const resolved = _resolveWithinBase(filePath, this._baseDir, 'File');
    if (!fs.existsSync(resolved)) {
      throw new UserFacingError(`File does not exist: ${resolved}`);
    }
    if (!fs.statSync(resolved).isFile()) {
      throw new UserFacingError(`Path is not a file: ${resolved}`);
    }
    return fs.readFileSync(resolved);
  }

  write(inputPath: string, data: Buffer, options?: { stemSuffix?: string; ext?: string }): string {
    const resolved = _resolveWithinBase(inputPath, this._baseDir, 'File');
    const directory = path.dirname(resolved);
    const parsed = path.parse(resolved);

    let stem = parsed.name;
    if (options?.stemSuffix) {
      stem = `${stem}-${options.stemSuffix}`;
    }
    const extension = options?.ext ?? parsed.ext.replace(/^\./, '');
    const outputPath = _findAvailablePath(stem, extension, directory);
    // 'wx' (O_CREAT|O_EXCL) refuses to follow a symlink at the output path,
    // closing the race between the boundary check and the write.
    fs.writeFileSync(outputPath, data, { flag: 'wx' });
    return outputPath;
  }

  listFiles(folder: string, extension?: string): FileEntry[] {
    const resolved = this._resolveFolder(folder);
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
      try {
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
      } catch {
        return [];
      }
    });
  }
}
