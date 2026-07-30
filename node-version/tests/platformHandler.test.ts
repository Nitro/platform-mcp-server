import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformHandler, ConversionNotSupportedError } from '../src/handlers/platformHandler.js';
import { PlatformApiClient } from '../src/client/platformClient.js';
import { ContentType, FileFormat } from '../src/client/enums.js';

describe('PlatformHandler', () => {
  let clientMock: PlatformApiClient;
  let runMock: ReturnType<typeof vi.fn>;
  let handler: PlatformHandler;

  beforeEach(() => {
    runMock = vi.fn();
    clientMock = {
      run: runMock,
    } as unknown as PlatformApiClient;
    handler = new PlatformHandler(clientMock);
  });

  describe('getPdfMetadata', () => {
    it('calls extractions with get-properties and returns extracted result', async () => {
      const rawResponse = JSON.stringify({ result: { title: 'doc-title' } });
      runMock.mockResolvedValueOnce({
        body: Buffer.from(rawResponse),
        contentType: 'application/json',
      });

      const result = await handler.getPdfMetadata(Buffer.from('pdf-bytes'));

      expect(result).toEqual(Buffer.from(JSON.stringify({ title: 'doc-title' }, null, 2)));
      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.objectContaining({
          kind: 'bytes',
          contentType: ContentType.PDF,
          name: 'document.pdf',
        }),
        { method: 'get-properties', params: {}, acceptFormat: 'json' },
      );
    });
  });

  describe('extractPdfData', () => {
    it.each([
      ['forms', 'extract-forms'],
      ['tables', 'extract-tables'],
      ['text', 'extract-text'],
      ['accessibility', 'extract-accessibility-data'],
    ] as const)('calls correct method for %s', async (dataType, expectedMethod) => {
      const rawResponse = JSON.stringify({ result: {} });
      runMock.mockResolvedValueOnce({
        body: Buffer.from(rawResponse),
        contentType: 'application/json',
      });

      await handler.extractPdfData(Buffer.from('pdf-bytes'), dataType, {});

      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        expect.objectContaining({ method: expectedMethod, acceptFormat: 'json' }),
      );
    });

    it('passes params to client', async () => {
      const rawResponse = JSON.stringify({ result: [] });
      runMock.mockResolvedValueOnce({
        body: Buffer.from(rawResponse),
        contentType: 'application/json',
      });

      await handler.extractPdfData(Buffer.from('pdf-bytes'), 'tables', { pageIndices: [0, 1] });

      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.anything(),
        expect.objectContaining({ params: { pageIndices: [0, 1] } }),
      );
    });
  });

  describe('extractTextBoundingBoxes', () => {
    it('calls extract-text-bounding-boxes with literal queries by default', async () => {
      const rawResponse = JSON.stringify({ result: { textBoxes: [] } });
      runMock.mockResolvedValueOnce({
        body: Buffer.from(rawResponse),
        contentType: 'application/json',
      });

      await handler.extractTextBoundingBoxes(Buffer.from('pdf-bytes'), [
        { text: 'hello' },
        { text: 'world' },
      ]);

      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        {
          method: 'extract-text-bounding-boxes',
          params: { queries: [{ text: 'hello' }, { text: 'world' }] },
          acceptFormat: 'json',
        },
      );
    });

    it('marks queries as regex and attaches flags when requested', async () => {
      const rawResponse = JSON.stringify({ result: { textBoxes: [] } });
      runMock.mockResolvedValueOnce({
        body: Buffer.from(rawResponse),
        contentType: 'application/json',
      });

      await handler.extractTextBoundingBoxes(Buffer.from('pdf-bytes'), [
        { text: '[0-9]+', isRegex: true, regexFlags: ['ignore-case'] },
      ]);

      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        {
          method: 'extract-text-bounding-boxes',
          params: { queries: [{ text: '[0-9]+', isRegex: true, regexFlags: ['ignore-case'] }] },
          acceptFormat: 'json',
        },
      );
    });
  });

  describe('extractFillableFormData', () => {
    it('calls extract-fillable-form-data and returns extracted result', async () => {
      const formData = {
        formFields: [{ pageIndex: 0, fieldType: 'TextBox', name: 'field-name', value: 'value' }],
      };
      const rawResponse = JSON.stringify({ result: formData });
      runMock.mockResolvedValueOnce({
        body: Buffer.from(rawResponse),
        contentType: 'application/json',
      });

      const result = await handler.extractFillableFormData(Buffer.from('pdf-bytes'));

      expect(result).toEqual(Buffer.from(JSON.stringify(formData, null, 2)));
      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.objectContaining({
          kind: 'bytes',
          contentType: ContentType.PDF,
          name: 'document.pdf',
        }),
        { method: 'extract-fillable-form-data', params: {}, acceptFormat: 'json' },
      );
    });
  });

  describe('extractPiiBoundingBoxes', () => {
    it('calls extract-pii-bounding-boxes with language param', async () => {
      const rawResponse = JSON.stringify({ result: { PIIBoxes: [] } });
      runMock.mockResolvedValueOnce({
        body: Buffer.from(rawResponse),
        contentType: 'application/json',
      });

      await handler.extractPiiBoundingBoxes(Buffer.from('pdf-bytes'), 'en');

      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'extract-pii-bounding-boxes', params: { language: 'en' }, acceptFormat: 'json' },
      );
    });
  });

  describe('redactPdf', () => {
    it('calls transformations with redact and returns body', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('redacted-pdf'),
        contentType: 'application/pdf',
      });
      const redactions = [{ pageIndex: 0, boundingBox: [10, 20, 30, 40] }];

      const result = await handler.redactPdf(Buffer.from('pdf-bytes'), redactions);

      expect(result).toEqual(Buffer.from('redacted-pdf'));
      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'redact', params: { redactions } },
      );
    });

    it('passes through per-redaction labels', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('redacted-pdf'),
        contentType: 'application/pdf',
      });
      const redactions = [{ pageIndex: 0, boundingBox: [10, 20, 30, 40], label: 'label' }];

      await handler.redactPdf(Buffer.from('pdf-bytes'), redactions);

      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'redact', params: { redactions } },
      );
    });
  });

  describe('mergePdfs', () => {
    it('calls transformations with merge and bookmarks enabled by default', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('merged-pdf'),
        contentType: 'application/pdf',
      });

      const result = await handler.mergePdfs([Buffer.from('pdf-1'), Buffer.from('pdf-2')]);

      expect(result).toEqual(Buffer.from('merged-pdf'));
      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        [
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.PDF,
            name: 'document_0.pdf',
          }),
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.PDF,
            name: 'document_1.pdf',
          }),
        ],
        { method: 'merge', params: { tableOfContents: { enabled: true } } },
      );
    });

    it('disables bookmarks when tableOfContents is false', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('merged-pdf'),
        contentType: 'application/pdf',
      });

      await handler.mergePdfs([Buffer.from('pdf-1'), Buffer.from('pdf-2')], false);

      expect(runMock).toHaveBeenCalledWith('transformations', expect.anything(), {
        method: 'merge',
        params: { tableOfContents: { enabled: false } },
      });
    });
  });

  describe('splitPdf', () => {
    it('calls transformations with split and page indices', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('zip-bytes'),
        contentType: 'application/zip',
      });

      const result = await handler.splitPdf(Buffer.from('pdf-bytes'), [[0, 1], [3]]);

      expect(result).toEqual(Buffer.from('zip-bytes'));
      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'split', params: { pageIndices: [[0, 1], [3]] } },
      );
    });
  });

  describe('rotatePdf', () => {
    it('calls transformations with rotate and rotations param', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('rotated'),
        contentType: 'application/pdf',
      });
      const rotations = [
        { pageIndex: 0, amount: 90 },
        { pageIndex: 2, amount: 180 },
      ];

      await handler.rotatePdf(Buffer.from('pdf-bytes'), rotations);

      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'rotate', params: { rotations } },
      );
    });
  });

  describe('protectPdf', () => {
    it('calls transformations with protect and password params', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('protected'),
        contentType: 'application/pdf',
      });

      await handler.protectPdf(Buffer.from('pdf-bytes'), 'owner-pass', 'user-pass', [
        'print',
        'copy',
      ]);

      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        {
          method: 'protect',
          params: {
            ownerPassword: 'owner-pass',
            userPassword: 'user-pass',
            permissions: ['print', 'copy'],
          },
        },
      );
    });

    it('omits undefined password fields', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('protected'),
        contentType: 'application/pdf',
      });

      await handler.protectPdf(Buffer.from('pdf-bytes'), 'owner-pass');

      expect(runMock).toHaveBeenCalledWith('transformations', expect.anything(), {
        method: 'protect',
        params: { ownerPassword: 'owner-pass' },
      });
    });
  });

  describe('unprotectPdf', () => {
    it('calls transformations with unprotect and password params', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('unprotected'),
        contentType: 'application/pdf',
      });

      await handler.unprotectPdf(Buffer.from('pdf-bytes'), 'owner-pass');

      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'unprotect', params: { ownerPassword: 'owner-pass' } },
      );
    });
  });

  describe('deletePdfPages', () => {
    it('calls transformations with delete-pages and page indices', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('modified'),
        contentType: 'application/pdf',
      });

      await handler.deletePdfPages(Buffer.from('pdf-bytes'), [0, 2, 4]);

      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'delete-pages', params: { pageIndices: [0, 2, 4] } },
      );
    });
  });

  describe('setPdfMetadata', () => {
    it('calls transformations with set-properties and metadata params', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('modified'),
        contentType: 'application/pdf',
      });
      const metadata = { title: 'doc-title', author: 'doc-author' };

      await handler.setPdfMetadata(Buffer.from('pdf-bytes'), metadata);

      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'set-properties', params: metadata },
      );
    });
  });

  describe('flattenPdf', () => {
    it('calls transformations with flatten and empty params', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('flattened'),
        contentType: 'application/pdf',
      });

      const result = await handler.flattenPdf(Buffer.from('pdf-bytes'));

      expect(result).toEqual(Buffer.from('flattened'));
      expect(runMock).toHaveBeenCalledWith(
        'transformations',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'flatten', params: {} },
      );
    });
  });

  describe('convertFile', () => {
    it('converts pdf to docx and returns result bytes', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('converted-bytes'),
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const result = await handler.convertFile(
        Buffer.from('pdf-bytes'),
        FileFormat.PDF,
        FileFormat.DOCX,
      );

      expect(result).toEqual(Buffer.from('converted-bytes'));
      expect(runMock).toHaveBeenCalledWith(
        'conversions',
        expect.objectContaining({ kind: 'bytes', name: 'input.pdf' }),
        { method: null, params: { to: FileFormat.DOCX } },
      );
    });

    it('throws ConversionNotSupportedError for unsupported conversion', async () => {
      await expect(
        handler.convertFile(Buffer.from('bytes'), FileFormat.PDF, FileFormat.PDF),
      ).rejects.toThrow(ConversionNotSupportedError);
      expect(runMock).not.toHaveBeenCalled();
    });

    it('converts docx to pdf', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('pdf-output'),
        contentType: 'application/pdf',
      });

      const result = await handler.convertFile(
        Buffer.from('docx-bytes'),
        FileFormat.DOCX,
        FileFormat.PDF,
      );

      expect(result).toEqual(Buffer.from('pdf-output'));
      expect(runMock).toHaveBeenCalledWith(
        'conversions',
        expect.objectContaining({ kind: 'bytes', name: 'input.docx' }),
        { method: null, params: { to: FileFormat.PDF } },
      );
    });
  });

  describe('fillForms', () => {
    it('passes pdf and json as two files to generations', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('filled-pdf'),
        contentType: 'application/pdf',
      });

      const result = await handler.fillForms(
        Buffer.from('pdf-bytes'),
        Buffer.from('json-bytes'),
        'json',
        {},
      );

      expect(result).toEqual(Buffer.from('filled-pdf'));
      expect(runMock).toHaveBeenCalledWith(
        'generations',
        [
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.PDF,
            name: 'input.pdf',
          }),
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.JSON,
            name: 'fields.json',
          }),
        ],
        { method: 'fill-forms', params: {} },
      );
    });

    it('passes pdf and csv as two files to generations when format is csv', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('filled-pdf'),
        contentType: 'application/pdf',
      });

      await handler.fillForms(Buffer.from('pdf-bytes'), Buffer.from('csv-bytes'), 'csv', {});

      expect(runMock).toHaveBeenCalledWith(
        'generations',
        [
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.PDF,
            name: 'input.pdf',
          }),
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.CSV,
            name: 'fields.csv',
          }),
        ],
        { method: 'fill-forms', params: {} },
      );
    });

    it('passes pdf and xfdf as two files to generations when format is xfdf', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('filled-pdf'),
        contentType: 'application/pdf',
      });

      await handler.fillForms(Buffer.from('pdf-bytes'), Buffer.from('xfdf-bytes'), 'xfdf', {});

      expect(runMock).toHaveBeenCalledWith(
        'generations',
        [
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.PDF,
            name: 'input.pdf',
          }),
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.XFDF,
            name: 'fields.xfdf',
          }),
        ],
        { method: 'fill-forms', params: {} },
      );
    });

    it('passes pdf and fdf as two files to generations when format is fdf', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('filled-pdf'),
        contentType: 'application/pdf',
      });

      await handler.fillForms(Buffer.from('pdf-bytes'), Buffer.from('fdf-bytes'), 'fdf', {});

      expect(runMock).toHaveBeenCalledWith(
        'generations',
        [
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.PDF,
            name: 'input.pdf',
          }),
          expect.objectContaining({
            kind: 'bytes',
            contentType: ContentType.FDF,
            name: 'fields.fdf',
          }),
        ],
        { method: 'fill-forms', params: {} },
      );
    });

    it('passes strict param', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('filled-pdf'),
        contentType: 'application/pdf',
      });

      await handler.fillForms(Buffer.from('pdf-bytes'), Buffer.from('json-bytes'), 'json', {
        strict: true,
      });

      expect(runMock).toHaveBeenCalledWith('generations', expect.anything(), {
        method: 'fill-forms',
        params: { strict: true },
      });
    });
  });
});
