/** Read-only source preview. Does not classify assets, normalize actions or save data. */
const FORMATS: Record<string, { required: string[]; preview: string[] }> = {
  Robinhood: {
    required: ['Settle Date', 'Instrument', 'Description', 'Trans Code', 'Quantity', 'Price', 'Amount'],
    preview: ['Settle Date', 'Instrument', 'Trans Code', 'Quantity', 'Price', 'Amount'],
  },
  Schwab: {
    required: ['Date', 'Symbol', 'Description', 'Action', 'Quantity', 'Price', 'Amount'],
    preview: ['Date', 'Symbol', 'Action', 'Quantity', 'Price', 'Amount'],
  },
};

export interface StatementInspection {
  headers: string[];
  columns: string[];
  rows: string[][];
  rowCount: number;
  error: string;
}

export function inspectStatement(text: string, brokerage: string): StatementInspection {
  const result: StatementInspection = { headers: [], columns: [], rows: [], rowCount: 0, error: '' };
  if (!text.trim()) return { ...result, error: 'Add a CSV export to continue.' };
  if (!FORMATS[brokerage]) return { ...result, error: 'Choose a supported brokerage format.' };
  const input = text.replace(/^\uFEFF/, '');
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  const finishRow = () => {
    cells.push(cell);
    if (cells.some(value => value.trim())) {
      if (!result.headers.length) result.headers = cells.map(header => header.trim());
      else {
        result.rowCount++;
        if (result.rows.length < 5) result.rows.push(cells);
      }
    }
    cells = []; cell = ''; closedQuote = false;
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else cell += char;
    } else if (char === '"' && !cell && !closedQuote) quoted = true;
    else if (char === ',') { cells.push(cell); cell = ''; closedQuote = false; }
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      finishRow();
    } else if (closedQuote && char.trim()) {
      return { ...result, error: 'Unexpected text after a quoted field. Check the CSV export.' };
    } else cell += char;
  }
  if (quoted) return { ...result, error: 'A quoted CSV field is unfinished. Include the complete export.' };
  if (cell || cells.length) finishRow();
  const missing = FORMATS[brokerage].required.filter(header => !result.headers.includes(header));
  if (missing.length) result.error = `This does not match the ${brokerage} format. Missing columns: ${missing.join(', ')}.`;
  else if (new Set(result.headers).size !== result.headers.length) result.error = 'The CSV contains duplicate column names. Use an unmodified export.';
  else if (!result.rowCount) result.error = 'The export contains a header but no source rows.';
  result.columns = FORMATS[brokerage].preview;
  return result;
}
