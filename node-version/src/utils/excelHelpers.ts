import ExcelJS from 'exceljs';

interface _FormField {
  name: string;
  value: string;
  confidence: number;
}

export interface FormsResult {
  fields: _FormField[];
  averageConfidence: number;
}

interface _TableData {
  title: string | null;
  cells: unknown[][];
  averageConfidence: number;
}

interface _ExtractedTable {
  tableData: _TableData;
  pageIndices: number[];
}

export interface TablesResult {
  tables: _ExtractedTable[];
}

function _autoAdjustColumns(ws: ExcelJS.Worksheet, minWidth: number, maxWidth: number): void {
  for (const column of ws.columns) {
    let maxLength = 0;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      const text =
        v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (text.length > maxLength) maxLength = text.length;
    });
    column.width = Math.min(Math.max(maxLength, minWidth), maxWidth);
  }
}

export async function createFormsExcel(data: FormsResult, filename: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Form Data');

  ws.addRow(['Document', 'Field Name', 'Field Value', 'Confidence']);

  for (const field of data.fields) {
    let value: string;
    if (field.value === 'NOT_SELECTED' || field.value === 'None') {
      value = 'Not filled';
    } else if (field.value === 'SELECTED') {
      value = 'Selected';
    } else {
      value = field.value;
    }
    ws.addRow([filename, field.name, value, `${(field.confidence * 100).toFixed(1)}%`]);
  }

  ws.addRow([
    filename,
    'SUMMARY',
    `Total Fields: ${String(data.fields.length)}`,
    `Avg Confidence: ${(data.averageConfidence * 100).toFixed(1)}%`,
  ]);

  _autoAdjustColumns(ws, 15, 50);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function createTablesExcel(data: TablesResult, filename: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const contentsSheet = workbook.addWorksheet('Contents');
  contentsSheet.addRow(['Sheet', 'Document', 'Table', 'Title', 'Confidence', 'Pages']);

  for (const [i, table] of data.tables.entries()) {
    const tableNum = i + 1;
    const rawName = `Table ${String(tableNum)}`;
    const sheetName = rawName.length <= 31 ? rawName : `T${String(tableNum)}`;
    const ws = workbook.addWorksheet(sheetName);

    for (const row of table.tableData.cells) {
      ws.addRow(row);
    }

    _autoAdjustColumns(ws, 10, 50);

    const pagesText =
      table.pageIndices.length > 0
        ? `Pages ${table.pageIndices.map((p) => String(p + 1)).join(', ')}`
        : 'Unknown';

    const contentsRow = contentsSheet.addRow([
      sheetName,
      filename,
      rawName,
      table.tableData.title ?? '',
      `${(table.tableData.averageConfidence * 100).toFixed(1)}%`,
      pagesText,
    ]);

    const sheetCell = contentsRow.getCell(1);
    sheetCell.value = { text: sheetName, hyperlink: `#'${sheetName}'!A1` };
    sheetCell.font = { color: { argb: 'FF0563C1' }, underline: true };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
