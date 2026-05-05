import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilesHandler } from '../src/handlers/filesHandler.js';

describe('FilesHandler', () => {
  let tmpDir: string;
  let handler: FilesHandler;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), '.nitro-test-'));
    handler = new FilesHandler();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('read', () => {
    it('reads file contents', () => {
      const filePath = path.join(tmpDir, 'a.pdf');
      fs.writeFileSync(filePath, Buffer.from('pdf-content'));
      expect(handler.read(filePath)).toEqual(Buffer.from('pdf-content'));
    });

    it('throws when file does not exist', () => {
      expect(() => handler.read(path.join(tmpDir, 'missing.pdf'))).toThrow('File does not exist');
    });
  });

  describe('write', () => {
    it('writes data and returns output path', () => {
      const inputPath = path.join(tmpDir, 'input.pdf');
      const outputPath = handler.write(inputPath, Buffer.from('output-bytes'));
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.readFileSync(outputPath)).toEqual(Buffer.from('output-bytes'));
    });

    it('appends stem suffix and ext when provided', () => {
      const inputPath = path.join(tmpDir, 'input.pdf');
      const outputPath = handler.write(inputPath, Buffer.from('bytes'), {
        stemSuffix: 'converted',
        ext: 'docx',
      });
      expect(path.basename(outputPath)).toBe('input-converted.docx');
    });

    it('avoids collision by incrementing counter', () => {
      const inputPath = path.join(tmpDir, 'input.pdf');
      fs.writeFileSync(path.join(tmpDir, 'input-converted.docx'), Buffer.from('existing'));
      const outputPath = handler.write(inputPath, Buffer.from('bytes'), {
        stemSuffix: 'converted',
        ext: 'docx',
      });
      expect(path.basename(outputPath)).toBe('input-converted(1).docx');
    });

    it('increments counter past multiple existing collisions', () => {
      const inputPath = path.join(tmpDir, 'input.pdf');
      fs.writeFileSync(path.join(tmpDir, 'input-converted.docx'), Buffer.from('existing'));
      fs.writeFileSync(path.join(tmpDir, 'input-converted(1).docx'), Buffer.from('existing'));
      fs.writeFileSync(path.join(tmpDir, 'input-converted(2).docx'), Buffer.from('existing'));
      const outputPath = handler.write(inputPath, Buffer.from('bytes'), {
        stemSuffix: 'converted',
        ext: 'docx',
      });
      expect(path.basename(outputPath)).toBe('input-converted(3).docx');
    });
  });

  describe('home directory restriction', () => {
    it('read rejects an absolute path under a system directory', () => {
      expect(() => handler.read('/etc/passwd')).toThrow(/within the home directory/);
    });

    it('read rejects a path that traverses out of the home directory', () => {
      const traversal = path.join(os.homedir(), '..', 'other-user', 'secret.pdf');
      expect(() => handler.read(traversal)).toThrow(/within the home directory/);
    });

    it('read accepts a path inside the home directory', () => {
      const filePath = path.join(tmpDir, 'allowed.pdf');
      fs.writeFileSync(filePath, Buffer.from('pdf-content'));
      expect(handler.read(filePath)).toEqual(Buffer.from('pdf-content'));
    });

    it('write rejects an absolute path under a system directory', () => {
      expect(() => handler.write('/etc/output.pdf', Buffer.from('x'))).toThrow(
        /within the home directory/,
      );
    });

    it('write rejects a path that traverses out of the home directory', () => {
      const traversal = path.join(os.homedir(), '..', 'other-user', 'output.pdf');
      expect(() => handler.write(traversal, Buffer.from('x'))).toThrow(/within the home directory/);
    });
  });

  describe('listFiles', () => {
    it('lists all files in folder', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.pdf'), '');
      fs.writeFileSync(path.join(tmpDir, 'b.docx'), '');
      const entries = handler.listFiles(tmpDir);
      const names = entries.map((e) => path.basename(e.filePath)).sort();
      expect(names).toEqual(['a.pdf', 'b.docx']);
    });

    it('filters by extension', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.pdf'), '');
      fs.writeFileSync(path.join(tmpDir, 'b.docx'), '');
      const entries = handler.listFiles(tmpDir, 'pdf');
      expect(entries).toHaveLength(1);
      const firstEntry = entries.at(0);
      expect(firstEntry).toBeDefined();
      if (!firstEntry) throw new Error('Expected entry to be defined');
      expect(path.basename(firstEntry.filePath)).toBe('a.pdf');
    });

    it('throws when folder does not exist', () => {
      expect(() => handler.listFiles(path.join(tmpDir, 'missing'))).toThrow(
        'Folder does not exist',
      );
    });

    it('returns size and mtime for each file', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.pdf'), 'hello');
      const entries = handler.listFiles(tmpDir);
      const entry = entries.at(0);
      expect(entry).toBeDefined();
      if (!entry) throw new Error('Expected entry to be defined');
      expect(entry.sizeBytes).toBe(5);
      expect(typeof entry.mtimeMs).toBe('number');
    });
  });
});
