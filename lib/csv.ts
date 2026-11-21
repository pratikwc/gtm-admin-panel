/** RFC 4180 CSV with a BOM so Excel opens UTF-8 (Arabic names, etc.) correctly. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '﻿';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    if (v == null) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
}
