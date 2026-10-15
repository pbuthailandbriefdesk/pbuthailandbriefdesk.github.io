// Small helpers that reproduce Power Fx behaviour the original app relied on.
// Date-only fields are 'YYYY-MM-DD' strings (Bangkok calendar days); timestamps are ISO strings.

export const TZ = 'Asia/Bangkok';

// Power Fx IsBlank: null, undefined and "" are blank.
export const isBlank = (v) => v === null || v === undefined || v === '';

// Power Fx Coalesce: first value that is not blank.
export const coalesce = (...vals) => {
  for (const v of vals) if (!isBlank(v)) return v;
  return null;
};

// Power Fx Text(value) with no format.
export const txt = (v) => (isBlank(v) ? '' : String(v));

export const num = (v) => (isBlank(v) ? 0 : Number(v));

// Power Fx comparison "x > 0" where blank counts as 0.
export const gt0 = (v) => !isBlank(v) && Number(v) > 0;

export const round2 = (v) => Math.round(num(v) * 100) / 100;

export const sum = (rows, key) => rows.reduce((s, r) => s + num(r[key]), 0);

// Text(x, "#,##0"). Like Power Fx, a blank value gives "".
export const fmtInt = (v) =>
  isBlank(v) ? '' : Math.round(num(v)).toLocaleString('en-US', { maximumFractionDigits: 0 });

// Text(x, "#,##0.00")
export const fmtMoney2 = (v) =>
  isBlank(v) ? '' : num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Text(x, "0.0#")
export const fmt0d0h = (v) => {
  if (isBlank(v)) return '';
  let s = round2(v).toFixed(2);
  if (s.endsWith('0')) s = s.slice(0, -1);
  return s;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parts of an instant in Bangkok time.
export function bkkParts(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((x) => [x.type, x.value])
  );
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export const todayBkk = () => {
  const p = bkkParts();
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};

export const nowIso = () => new Date().toISOString();

// "BR-" & Text(Now(), "yymmdd-hhmmss")
export const newBriefId = () => {
  const p = bkkParts();
  return `BR-${pad(p.y % 100)}${pad(p.m)}${pad(p.d)}-${pad(p.hh)}${pad(p.mm)}${pad(p.ss)}`;
};

// Date-only arithmetic on 'YYYY-MM-DD' strings (UTC-anchored so no DST drift).
const asUtc = (s) => new Date(`${s}T00:00:00Z`);
const fromUtc = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (s, n) => { const d = asUtc(s); d.setUTCDate(d.getUTCDate() + n); return fromUtc(d); };
export const diffDays = (a, b) => Math.round((asUtc(b) - asUtc(a)) / 86400000);
// Weekday(x, StartOfWeek.Monday): Monday = 1 ... Sunday = 7
export const weekdayMon = (s) => ((asUtc(s).getUTCDay() + 6) % 7) + 1;

// Text(date, "dd mmm yy") / "dd mmm" / "mm/dd/yyyy" for date-only strings.
export function fmtDate(s, pattern = 'dd mmm yy') {
  if (isBlank(s)) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return pattern
    .replace('dd', pad(d))
    .replace('mmm', MONTHS[m - 1])
    .replace('mm', pad(m))
    .replace('yyyy', String(y))
    .replace('yy', pad(y % 100));
}

// Timestamps shown in Bangkok time, e.g. "dd mmm hh:mm" or "dd mmm yy hh:mm".
export function fmtTs(iso, pattern = 'dd mmm hh:mm') {
  if (isBlank(iso)) return '';
  const p = bkkParts(new Date(iso));
  return pattern
    .replace('dd', pad(p.d))
    .replace('mmm', MONTHS[p.m - 1])
    .replace('yy', pad(p.y % 100))
    .replace('hh', pad(p.hh))
    .replace('mm', pad(p.mm));
}

export const tsToBkkDate = (iso) => {
  const p = bkkParts(new Date(iso));
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};

export const sortBy = (rows, ...keys) =>
  [...rows].sort((a, b) => {
    for (const k of keys) {
      const av = num(a[k]); const bv = num(b[k]);
      if (av !== bv) return av - bv;
    }
    return 0;
  });

export const lower = (v) => (isBlank(v) ? '' : String(v).toLowerCase());

export const singleLine = (v) => txt(v).replace(/\r/g, ' ').replace(/\n/g, ' ');

export function mailtoHref(to, subject, body) {
  const list = (Array.isArray(to) ? to : [to]).filter((x) => !isBlank(x));
  return `mailto:${encodeURIComponent(list.join(';')).replace(/%40/g, '@').replace(/%3B/g, ';')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function downloadText(name, content, type = 'text/csv') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
