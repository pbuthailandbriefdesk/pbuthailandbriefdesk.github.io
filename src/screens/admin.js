// Admin: the reference lists that used to be edited directly in SharePoint.
import { useState } from 'preact/hooks';
import { app, db, loadLookups, toast, useCrumbs, useStore } from '../data/store.js';
import { ROLES } from '../lib/constants.js';
import { html, ConfirmButton, DateInput, PageHead, Select, TextInput } from '../ui/ui.js';

const LISTS = {
  desk_team: {
    label: 'Desk team', key: 'team', hint: 'Roles decide what each person can do. Anyone not listed is a Planner.',
    cols: [
      { f: 'email', label: 'Email', w: '30%' },
      { f: 'name', label: 'Name' },
      { f: 'role', label: 'Role', options: ROLES },
      { f: 'team', label: 'Team', options: ['CPD', 'Non-CPD'] },
    ],
    blank: { email: 'name@wppmedia.com', role: 'Planner' },
  },
  brands: {
    label: 'Brands', key: 'brands', hint: 'Brand code feeds the naming convention; advertiser name and ID fill the brief automatically.',
    cols: [
      { f: 'brand_name', label: 'Brand' }, { f: 'brand_code', label: 'Brand code' },
      { f: 'advertiser_name', label: 'DV360 advertiser name', w: '32%' }, { f: 'advertiser_id', label: 'DV360 advertiser ID' },
    ],
    blank: { brand_name: 'New brand' },
  },
  holidays: {
    label: 'Holidays', key: 'holidays', hint: 'Holidays are skipped when counting working-day lead time.',
    cols: [{ f: 'holiday_name', label: 'Holiday' }, { f: 'holiday_date', label: 'Date', date: true }],
    blank: { holiday_name: 'New holiday' },
  },
  sdf_defaults: {
    label: 'SDF defaults', key: 'sdf', hint: 'Default values used when building DV360 SDF v11 files.',
    cols: [{ f: 'title', label: 'Setting', w: '26%', mono: true }, { f: 'value', label: 'Value', w: '30%', mono: true }, { f: 'note', label: 'Note' }],
    blank: { title: 'NEW_SETTING' },
  },
};

export function Admin() {
  const s = useStore(app);
  const [tab, setTab] = useState('desk_team');
  useCrumbs([{ label: 'Admin' }, { label: LISTS[tab].label }]);
  if (!s.me.isAdmin) return html`<div class="page"><div class="callout err">Only Admins can edit the reference lists.</div></div>`;
  const L = LISTS[tab];
  const rows = s[L.key];

  const save = (id, f) => async (v) => {
    try { await db().update(tab, id, { [f]: v }); await loadLookups(); } catch (e) { toast(`Not saved: ${e.message}`, 'error'); }
  };
  const add = async () => {
    try { await db().insert(tab, L.blank); await loadLookups(); } catch (e) { toast(`Not added: ${e.message}`, 'error'); }
  };
  const del = async (id) => {
    try { await db().remove(tab, id); await loadLookups(); } catch (e) { toast(`Not deleted: ${e.message}`, 'error'); }
  };

  return html`<div class="page">
    <${PageHead} eyebrow="Admin" title="Reference lists" sub="These lists replace the SharePoint lists the Power App read." >
      ${s.db.mode === 'demo' && html`<${ConfirmButton} cls="btn" label="Reset demo data" confirmLabel="Click again to reset"
        onConfirm=${async () => { await s.db.reset(); window.location.reload(); }} />`}
    <//>
    <div class="tabs">${Object.entries(LISTS).map(([k, v]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${v.label} (${s[v.key].length})</button>`)}</div>
    <div class="toolbar"><span class="muted">${L.hint}</span><span class="spacer"></span><button class="btn btn-dark" onClick=${add}>+ Add row</button></div>
    <div class="table-wrap"><table class="table">
      <thead><tr>${L.cols.map((c) => html`<th style=${c.w ? `width:${c.w}` : ''}>${c.label}</th>`)}<th></th></tr></thead>
      <tbody>
        ${rows.length === 0 && html`<tr><td colspan=${L.cols.length + 1} class="empty">No rows yet.</td></tr>`}
        ${[...rows].sort((a, b) => a.id - b.id).map((r) => html`<tr key=${r.id}>
          ${L.cols.map((c) => html`<td>${c.options
            ? html`<${Select} value=${r[c.f]} options=${c.options} onSave=${save(r.id, c.f)} />`
            : c.date ? html`<${DateInput} value=${r[c.f]} onSave=${save(r.id, c.f)} />`
              : html`<${TextInput} mono=${c.mono} value=${r[c.f]} onSave=${save(r.id, c.f)} />`}</td>`)}
          <td class="num"><${ConfirmButton} cls="btn btn-sm btn-danger" label="Delete" confirmLabel="Confirm" onConfirm=${() => del(r.id)} /></td>
        </tr>`)}
      </tbody>
    </table></div>
  </div>`;
}
