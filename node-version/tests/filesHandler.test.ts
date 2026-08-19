import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilesHandler } from '../src/handlers/filesHandler.js';

describe('FilesHandler', () => {
  let baseDir: string;
  let outsideDir: string;
  let handler: FilesHandler;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.homedir(), '.nitro-test-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nitro-outside-'));
    handler = new FilesHandler(baseDir);
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  describe('read', () => {
    it('reads file contents', () => {
      const filePath = path.join(baseDir, 'a.pdf');
      fs.writeFileSync(filePath, Buffer.from('pdf-content'));
      expect(handler.read(filePath)).toEqual(Buffer.from('pdf-content'));
    });

    it('throws when file does not exist', () => {
      expect(() => handler.read(path.join(baseDir, 'missing.pdf'))).toThrow('File does not exist');
    });
  });

  describe('write', () => {
    it('writes data and returns output path', () => {
      const inputPath = path.join(baseDir, 'input.pdf');
      const outputPath = handler.write(inputPath, Buffer.from('output-bytes'));
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.readFileSync(outputPath)).toEqual(Buffer.from('output-bytes'));
    });

    it('appends stem suffix and ext when provided', () => {
      const inputPath = path.join(baseDir, 'input.pdf');
      const outputPath = handler.write(inputPath, Buffer.from('bytes'), {
        stemSuffix: 'converted',
        ext: 'docx',
      });
      expect(path.basename(outputPath)).toBe('input-converted.docx');
    });

    it('avoids collision by incrementing counter', () => {
      const inputPath = path.join(baseDir, 'input.pdf');
      fs.writeFileSync(path.join(baseDir, 'input-converted.docx'), Buffer.from('existing'));
      const outputPath = handler.write(inputPath, Buffer.from('bytes'), {
        stemSuffix: 'converted',
        ext: 'docx',
      });
      expect(path.basename(outputPath)).toBe('input-converted(1).docx');
    });

    it('increments counter past multiple existing collisions', () => {
      const inputPath = path.join(baseDir, 'input.pdf');
      fs.writeFileSync(path.join(baseDir, 'input-converted.docx'), Buffer.from('existing'));
      fs.writeFileSync(path.join(baseDir, 'input-converted(1).docx'), Buffer.from('existing'));
      fs.writeFileSync(path.join(baseDir, 'input-converted(2).docx'), Buffer.from('existing'));
      const outputPath = handler.write(inputPath, Buffer.from('bytes'), {
        stemSuffix: 'converted',
        ext: 'docx',
      });
      expect(path.basename(outputPath)).toBe('input-converted(3).docx');
    });
  });

  describe('base directory restriction', () => {
    it('read rejects an absolute path under a system directory', () => {
      expect(() => handler.read('/etc/passwd')).toThrow(/within the allowed base directory/);
    });

    it('read rejects a path that traverses out of the base directory', () => {
      const traversal = path.join(baseDir, '..', 'other-folder', 'secret.pdf');
      expect(() => handler.read(traversal)).toThrow(/within the allowed base directory/);
    });

    it('read rejects a symlink inside the base directory that points outside it', () => {
      const target = path.join(outsideDir, 'secret.pdf');
      fs.writeFileSync(target, Buffer.from('secret'));
      const link = path.join(baseDir, 'link.pdf');
      fs.symlinkSync(target, link);
      expect(() => handler.read(link)).toThrow(/within the allowed base directory/);
    });

    it('read accepts a path inside the base directory', () => {
      const filePath = path.join(baseDir, 'allowed.pdf');
      fs.writeFileSync(filePath, Buffer.from('pdf-content'));
      expect(handler.read(filePath)).toEqual(Buffer.from('pdf-content'));
    });

    it('write rejects an absolute path under a system directory', () => {
      expect(() => handler.write('/etc/output.pdf', Buffer.from('x'))).toThrow(
        /within the allowed base directory/,
      );
    });

    it('write rejects a path that traverses out of the base directory', () => {
      const traversal = path.join(baseDir, '..', 'other-folder', 'output.pdf');
      expect(() => handler.write(traversal, Buffer.from('x'))).toThrow(
        /within the allowed base directory/,
      );
    });

    it('write rejects a symlink inside the base directory that points outside it', () => {
      const target = path.join(outsideDir, 'existing.pdf');
      fs.writeFileSync(target, Buffer.from('existing'));
      const link = path.join(baseDir, 'link.pdf');
      fs.symlinkSync(target, link);
      expect(() => handler.write(link, Buffer.from('x'))).toThrow(
        /within the allowed base directory/,
      );
    });

    it('write rejects a dangling symlink whose target is outside the base directory', () => {
      const target = path.join(outsideDir, 'escaped.pdf');
      const link = path.join(baseDir, 'dangling.pdf');
      fs.symlinkSync(target, link);
      expect(() => handler.write(link, Buffer.from('escaped'))).toThrow(
        /within the allowed base directory/,
      );
      expect(fs.existsSync(target)).toBe(false);
    });

    it('write does not follow a dangling symlink at a collision candidate', () => {
      const target = path.join(outsideDir, 'collision.docx');
      fs.symlinkSync(target, path.join(baseDir, 'input-converted.docx'));
      const outputPath = handler.write(path.join(baseDir, 'input.pdf'), Buffer.from('bytes'), {
        stemSuffix: 'converted',
        ext: 'docx',
      });
      expect(path.basename(outputPath)).toBe('input-converted(1).docx');
      expect(fs.existsSync(target)).toBe(false);
    });

    it('rejects a sibling directory sharing the base directory name prefix', () => {
      const sibling = `${baseDir}-evil`;
      fs.mkdirSync(sibling);
      try {
        expect(() => handler.listFiles(sibling)).toThrow(/within the allowed base directory/);
        expect(() => handler.read(path.join(sibling, 'a.pdf'))).toThrow(
          /within the allowed base directory/,
        );
      } finally {
        fs.rmSync(sibling, { recursive: true, force: true });
      }
    });

    it('accepts paths under a base directory that is the filesystem root', () => {
      const rootHandler = new FilesHandler(path.parse(baseDir).root);
      const filePath = path.join(baseDir, 'allowed.pdf');
      fs.writeFileSync(filePath, Buffer.from('pdf-content'));
      expect(rootHandler.read(filePath)).toEqual(Buffer.from('pdf-content'));
    });

    it('listFiles rejects an absolute path outside the base directory', () => {
      expect(() => handler.listFiles('/etc')).toThrow(/within the allowed base directory/);
    });

    it('listFiles rejects a ~-prefixed path outside the base directory', () => {
      expect(() => handler.listFiles('~/../../../etc')).toThrow(
        /within the allowed base directory/,
      );
    });

    it('listFiles rejects a path that traverses out of the base directory', () => {
      const traversal = path.join(baseDir, '..');
      expect(() => handler.listFiles(traversal)).toThrow(/within the allowed base directory/);
    });

    it('listFiles rejects a symlinked folder inside the base directory that points outside it', () => {
      const link = path.join(baseDir, 'linked-folder');
      fs.symlinkSync(outsideDir, link);
      expect(() => handler.listFiles(link)).toThrow(/within the allowed base directory/);
    });

    it('listFiles rejects a bare folder name that resolves outside the base directory', () => {
      expect(() => handler.listFiles('../sibling')).toThrow(/within the allowed base directory/);
    });

    it('listFiles omits symlinked files pointing outside the base directory', () => {
      const target = path.join(outsideDir, 'secret.pdf');
      fs.writeFileSync(target, Buffer.from('secret-content'));
      fs.symlinkSync(target, path.join(baseDir, 'link.pdf'));
      fs.writeFileSync(path.join(baseDir, 'own.pdf'), Buffer.from('own'));
      const names = handler.listFiles(baseDir).map((e) => path.basename(e.filePath));
      expect(names).toEqual(['own.pdf']);
    });

    it('listFiles includes symlinked files pointing inside the base directory', () => {
      const target = path.join(baseDir, 'target.pdf');
      fs.writeFileSync(target, Buffer.from('inside'));
      fs.symlinkSync(target, path.join(baseDir, 'link.pdf'));
      const names = handler.listFiles(baseDir).map((e) => path.basename(e.filePath));
      expect(names.sort()).toEqual(['link.pdf', 'target.pdf']);
    });
  });

  describe('listFiles', () => {
    it('lists all files in folder', () => {
      fs.writeFileSync(path.join(baseDir, 'a.pdf'), '');
      fs.writeFileSync(path.join(baseDir, 'b.docx'), '');
      const entries = handler.listFiles(baseDir);
      const names = entries.map((e) => path.basename(e.filePath)).sort();
      expect(names).toEqual(['a.pdf', 'b.docx']);
    });

    it('resolves a bare folder name from the base directory', () => {
      const sub = path.join(baseDir, 'Reports');
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, 'a.pdf'), '');
      const entries = handler.listFiles('reports');
      expect(entries).toHaveLength(1);
      expect(path.basename(entries.at(0)?.filePath ?? '')).toBe('a.pdf');
    });

    it('filters by extension', () => {
      fs.writeFileSync(path.join(baseDir, 'a.pdf'), '');
      fs.writeFileSync(path.join(baseDir, 'b.docx'), '');
      const entries = handler.listFiles(baseDir, 'pdf');
      expect(entries).toHaveLength(1);
      const firstEntry = entries.at(0);
      expect(firstEntry).toBeDefined();
      if (!firstEntry) throw new Error('Expected entry to be defined');
      expect(path.basename(firstEntry.filePath)).toBe('a.pdf');
    });

    it('throws when folder does not exist', () => {
      expect(() => handler.listFiles(path.join(baseDir, 'missing'))).toThrow(
        'Folder does not exist',
      );
    });

    it('returns size and mtime for each file', () => {
      fs.writeFileSync(path.join(baseDir, 'a.pdf'), 'hello');
      const entries = handler.listFiles(baseDir);
      const entry = entries.at(0);
      expect(entry).toBeDefined();
      if (!entry) throw new Error('Expected entry to be defined');
      expect(entry.sizeBytes).toBe(5);
      expect(typeof entry.mtimeMs).toBe('number');
    });
  });
});
