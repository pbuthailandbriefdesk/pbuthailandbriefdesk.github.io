// Shared UI pieces. Inputs save on blur / Enter (like the Power App OnChange),
// selects and dates save as soon as they change.
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import htm from 'htm';
import { fmtInt, isBlank } from '../lib/util.js';

export const html = htm.bind(h);

// Line icons in the Iconoir style used by the design system (1.5 stroke, round joins).
const P = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z',
  gate: 'M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  wrench: 'M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18l3 3 6.2-6.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  chevL: 'M15 6l-6 6 6 6',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  download: 'M12 4v12M6 10l6 6 6-6M4 20h16',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  logout: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
};
export const Icon = ({ name, ...rest }) => html`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ...${rest}>
    <path d=${P[name] || ''} />
  </svg>`;

export const Field = ({ label, hint, error, children, class: cls = '' }) => html`
  <div class=${`field ${cls}`}>
    ${label && html`<label>${label}</label>`}
    ${children}
    ${error ? html`<div class="err">${error}</div>` : hint ? html`<div class="hint">${hint}</div>` : null}
  </div>`;

function useDraft(value, fmt = (v) => (isBlank(v) ? '' : String(v))) {
  const [draft, setDraft] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(fmt(value)); }, [value]);
  return [draft, setDraft, focused];
}

export function TextInput({ value, onSave, placeholder, disabled, readOnly, mono, multiline, rows = 3, label, hint, cls }) {
  const [draft, setDraft, focused] = useDraft(value);
  const commit = () => {
    focused.current = false;
    const v = draft === '' ? null : draft;
    if ((v ?? '') !== (value ?? '')) onSave && onSave(v);
  };
  const props = {
    class: `${multiline ? 'textarea' : 'input'}${mono ? ' mono' : ''}`,
    value: draft, placeholder, disabled, readOnly,
    onFocus: () => { focused.current = true; },
    onInput: (e) => setDraft(e.currentTarget.value),
    onBlur: commit,
    onKeyDown: (e) => { if (!multiline && e.key === 'Enter') e.currentTarget.blur(); },
  };
  const input = multiline ? html`<textarea rows=${rows} ...${props}></textarea>` : html`<input type="text" ...${props} />`;
  return label !== undefined ? html`<${Field} label=${label} hint=${hint} class=${cls}>${input}<//>` : input;
}

// Value(Self.Text): accepts "1,234.5"; blank saves blank.
export function NumberInput({ value, onSave, placeholder, disabled, money, label, hint, cls }) {
  const show = (v) => (isBlank(v) ? '' : money ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v));
  const [draft, setDraft, focused] = useDraft(value, show);
  const [bad, setBad] = useState(false);
  const commit = () => {
    focused.current = false;
    const raw = draft.replace(/,/g, '').trim();
    if (raw === '') { setBad(false); if (!isBlank(value)) onSave(null); return; }
    const n = Number(raw);
    if (Number.isNaN(n)) { setBad(true); return; }
    setBad(false);
    setDraft(show(n));
    if (n !== (isBlank(value) ? null : Number(value))) onSave(n);
  };
  const input = html`<input type="text" inputmode="decimal" class=${`input${bad ? ' invalid' : ''}`} value=${draft}
    placeholder=${placeholder} disabled=${disabled}
    onFocus=${() => { focused.current = true; setDraft(isBlank(value) ? '' : String(value)); }}
    onInput=${(e) => setDraft(e.currentTarget.value)} onBlur=${commit}
    onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />`;
  return label !== undefined
    ? html`<${Field} label=${label} hint=${hint} error=${bad ? 'Enter a number' : null} class=${cls}>${input}<//>`
    : input;
}

export function DateInput({ value, onSave, disabled, label, hint, cls }) {
  const input = html`<input type="date" class="input" value=${value || ''} disabled=${disabled}
    onChange=${(e) => { const v = e.currentTarget.value || null; if (v !== (value || null)) onSave(v); }} />`;
  return label !== undefined ? html`<${Field} label=${label} hint=${hint} class=${cls}>${input}<//>` : input;
}

export function Select({ value, options, onSave, disabled, allowEmpty = true, label, hint, cls, emptyLabel = '—' }) {
  const opts = [...options];
  if (!isBlank(value) && !opts.includes(value)) opts.unshift(value); // keep legacy values visible
  const input = html`<select class="select" disabled=${disabled} value=${value ?? ''}
    onChange=${(e) => { const v = e.currentTarget.value || null; if (v !== (value ?? null)) onSave(v); }}>
    ${(allowEmpty || isBlank(value)) && html`<option value="">${emptyLabel}</option>`}
    ${opts.map((o) => html`<option value=${o}>${o}</option>`)}
  </select>`;
  return label !== undefined ? html`<${Field} label=${label} hint=${hint} class=${cls}>${input}<//>` : input;
}

const STATUS_CLASS = {
  Draft: 's-draft', Returned: 's-returned', 'With Ad Ops': 's-adops', 'With Gatekeeper': 's-gate',
  Locked: 's-locked', 'In set-up': 's-setup-in', 'In QA': 's-qa', 'Set up': 's-setup', Cancelled: 's-cancelled',
};
export const StatusPill = ({ status }) => html`<span class=${`pill ${STATUS_CLASS[status] || ''}`}>${status || '—'}</span>`;

export const Lvl = ({ lvl }) => html`<span class=${`lvl ${lvl}`}>${lvl}</span>`;

export const Money = ({ v }) => html`<span class="nowrap">THB ${fmtInt(v)}</span>`;

// Two-step confirm like the Power App ("Click again to confirm").
export function ConfirmButton({ label, confirmLabel = 'Click again to confirm', onConfirm, cls = 'btn btn-danger', disabled }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return html`<button class=${`${cls}${armed ? ' confirm' : ''}`} disabled=${disabled}
    onClick=${() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>${armed ? confirmLabel : label}</button>`;
}

// Runs an async handler once at a time and disables the button while it runs.
export function ActionButton({ onClick, children, cls = 'btn', disabled, title }) {
  const [busy, setBusy] = useState(false);
  return html`<button class=${cls} title=${title} disabled=${disabled || busy}
    onClick=${async () => { setBusy(true); try { await onClick(); } catch (e) { /* toast already shown */ } finally { setBusy(false); } }}>
    ${busy ? 'Working…' : children}</button>`;
}

export const Loading = ({ text = 'Loading…' }) => html`<div class="loading"><div class="spinner"></div>${text}</div>`;

export const ErrorBox = ({ msg }) => html`<div class="page"><div class="callout err">${msg}</div></div>`;

export const PageHead = ({ eyebrow, title, sub, children }) => html`
  <div class="page-head">
    <div class="titles">
      ${eyebrow && html`<div class="eyebrow"><span class="dot"></span>${eyebrow}</div>`}
      <h1>${title}</h1>
      ${sub && html`<div class="sub">${sub}</div>`}
    </div>
    ${children && html`<div class="actions">${children}</div>`}
  </div>`;

export function ChecksList({ checks }) {
  return html`<ul class="checks">
    ${checks.map((c) => html`<li class=${c.ok ? 'ok' : 'bad'}>
      <span class="mark">${c.ok ? '✓' : '✗'}</span>
      <span class="item">${c.no === 0 ? '' : `${c.no} · `}${c.item}</span>
      <span class="rule">${c.rule}</span>
      ${!c.ok && c.gap && html`<span class="gap">${c.gap}</span>`}
    </li>`)}
  </ul>`;
}

export function CheckSummary({ checks }) {
  const ok = checks.filter((c) => c.ok).length;
  const pct = Math.round((ok / checks.length) * 100);
  return html`<div>
    <div class="row"><strong>${ok} of ${checks.length} checks passed</strong></div>
    <div class=${`progress${ok === checks.length ? ' full' : ''}`}><i style=${`width:${pct}%`}></i></div>
  </div>`;
}

export function Modal({ title, children, onClose }) {
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return html`<div class="modal-back" onClick=${(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
    <div class="modal" role="dialog" aria-modal="true" aria-label=${title}>
      <h2>${title}</h2>
      ${children}
    </div>
  </div>`;
}
