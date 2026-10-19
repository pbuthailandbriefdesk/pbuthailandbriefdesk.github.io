// Reads DV360 SDF CSV files (as downloaded from DV360 or built by the Desk) into rows
// keyed by column name, and works out which file is which from its header.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  if (rows.length === 0) return { header: [], rows: [] };
  const header = rows[0].map((h) => h.trim());
  return { header, rows: rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}

// campaigns | ios | lines | adGroups | ads | null
export function sdfKind(header) {
  const h = new Set(header);
  if (h.has('Ad Id')) return 'ads';
  if (h.has('Ad Group Id')) return 'adGroups';
  if (h.has('Line Item Id')) return 'lines';
  if (h.has('Io Id')) return 'ios';
  if (h.has('Campaign Id')) return 'campaigns';
  return null;
}

// Reads .csv files and .zip archives (JSZip is loaded by index.html).
export async function readSdfFiles(fileList) {
  const out = { campaigns: [], ios: [], lines: [], adGroups: [], ads: [], files: [], skipped: [] };
  const add = (name, text) => {
    const { header, rows } = parseCsv(text);
    const kind = sdfKind(header);
    if (!kind) { out.skipped.push(name); return; }
    out[kind].push(...rows);
    out.files.push({ name, kind, rows: rows.length });
  };
  for (const f of fileList) {
    if (/\.zip$/i.test(f.name)) {
      if (!window.JSZip) throw new Error('The zip reader is still loading. Try again in a moment.');
      const zip = await window.JSZip.loadAsync(f);
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && /\.csv$/i.test(entry.name)) add(entry.name.split('/').pop(), await entry.async('string'));
      }
    } else if (/\.csv$/i.test(f.name)) add(f.name, await f.text());
    else out.skipped.push(f.name);
  }
  return out;
}
