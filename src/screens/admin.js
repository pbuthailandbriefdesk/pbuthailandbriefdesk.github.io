// Admin area: User management (who can use the Desk, their name and role) and the
// reference lists that used to be edited directly in SharePoint.
import { useState } from 'preact/hooks';
import { ALLOWED_DOMAINS } from '../config.js';
import { app, db, loadLookups, toast, useCrumbs, useStore } from '../data/store.js';
import { ROLES } from '../lib/constants.js';
import { lower } from '../lib/util.js';
import { html, ConfirmButton, DateInput, PageHead, Select, TextInput } from '../ui/ui.js';

const ROLE_HELP = {
  Planner: 'Creates and submits briefs, requests changes.',
  'Ad Ops': 'Taxonomy, actions, DV360 IDs, SDF export.',
  Gatekeeper: 'Runs the Gate check; also accepts set-ups.',
  Buyer: 'Accepts locked briefs and marks them set up.',
  Admin: 'Everything, including this page.',
};
const TEAMS = ['CPD', 'Non-CPD', 'PBU', 'All'];

const LISTS = {
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

export function Admin({ route }) {
  const s = useStore(app);
  const tab = route.query.tab || 'users';
  useCrumbs([{ label: 'Admin', href: '#/admin' }, { label: tab === 'users' ? 'User management' : LISTS[tab]?.label || 'Reference lists' }]);
  if (!s.me.isAdmin) return html`<div class="page"><div class="callout err">Only Admins can open this page.</div></div>`;

  return html`<div class="page">
    <${PageHead} eyebrow="Admin" title=${tab === 'users' ? 'User management' : 'Reference lists'}
      sub=${tab === 'users' ? 'People sign in with their work email. Their name and role come from this list.' : 'These lists replace the SharePoint lists the Power App read.'}>
      ${s.db.mode === 'demo' && html`<${ConfirmButton} cls="btn" label="Reset demo data" confirmLabel="Click again to reset"
        onConfirm=${async () => { await s.db.reset(); window.location.reload(); }} />`}
    <//>
    <div class="tabs">
      <a class=${`tablink${tab === 'users' ? ' on' : ''}`} href="#/admin">Users (${s.team.length})</a>
      ${Object.entries(LISTS).map(([k, v]) => html`<a class=${`tablink${tab === k ? ' on' : ''}`} href=${`#/admin?tab=${k}`}>${v.label} (${s[v.key].length})</a>`)}
    </div>
    ${tab === 'users' ? html`<${Users} />` : LISTS[tab] ? html`<${RefList} table=${tab} />` : null}
  </div>`;
}

// ---------------------------------------------------------------------------
function Users() {
  const { team, me } = useStore(app);
  const [form, setForm] = useState({ email: '', name: '', role: 'Planner', team: '' });
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const admins = team.filter((t) => t.role === 'Admin');
  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget.value });

  const add = async (e) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!ALLOWED_DOMAINS.includes(email.split('@')[1])) { setErr(`Use a ${ALLOWED_DOMAINS.map((x) => '@' + x).join(' or ')} address.`); return; }
    if (team.some((t) => lower(t.email) === email)) { setErr(`${email} is already in the list.`); return; }
    if (!form.name.trim()) { setErr('Enter a name.'); return; }
    setErr(null);
    try {
      await db().insert('desk_team', { email, name: form.name.trim(), role: form.role, team: form.team || null });
      await loadLookups();
      setForm({ email: '', name: '', role: 'Planner', team: '' });
      toast(`${form.name.trim()} added as ${form.role}`, 'success');
    } catch (ex) { setErr(ex.message); }
  };
  const save = (row, f) => async (v) => {
    if (f === 'role' && row.role === 'Admin' && v !== 'Admin' && admins.length <= 1) {
      toast('Keep at least one Admin.', 'warning'); await loadLookups(); return;
    }
    if (f === 'email') {
      v = lower(v || '').trim();
      if (!ALLOWED_DOMAINS.includes(v.split('@')[1])) { toast('Use a work email address.', 'warning'); await loadLookups(); return; }
      if (team.some((t) => t.id !== row.id && lower(t.email) === v)) { toast(`${v} is already in the list.`, 'warning'); await loadLookups(); return; }
    }
    try { await db().update('desk_team', row.id, { [f]: v }); await loadLookups(); } catch (ex) { toast(`Not saved: ${ex.message}`, 'error'); }
  };
  const remove = async (row) => {
    try { await db().remove('desk_team', row.id); await loadLookups(); toast(`${row.name || row.email} removed`, 'success'); } catch (ex) { toast(`Not removed: ${ex.message}`, 'error'); }
  };

  const counts = Object.fromEntries(ROLES.map((r) => [r, team.filter((t) => t.role === r).length]));
  const rows = [...team].sort((a, b) => a.id - b.id).filter((t) => !q || [t.email, t.name, t.role, t.team].some((v) => lower(v).includes(lower(q))));

  return html`<div class="stack" style="gap:20px">
    <div class="tiles" style="margin-bottom:0">
      ${ROLES.map((r) => html`<div class=${`tile${r === 'Admin' ? ' accent' : ''}`}>
        <div class="k">${r === 'Gatekeeper' ? 'Gate' : r}</div><div class="v">${counts[r]}</div><div class="n">${ROLE_HELP[r]}</div></div>`)}
    </div>

    <div class="card">
      <div class="card-head"><h3>Add a user</h3></div>
      <form class="card-body" onSubmit=${add}>
        <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) auto;align-items:end">
          <div class="field"><label for="nu-email">Work email</label>
            <input id="nu-email" class="input" type="email" required placeholder="name@wppmedia.com" value=${form.email} onInput=${set('email')} /></div>
          <div class="field"><label for="nu-name">Name</label>
            <input id="nu-name" class="input" required placeholder="Shown on briefs and history" value=${form.name} onInput=${set('name')} /></div>
          <div class="field"><label for="nu-role">Role</label>
            <select id="nu-role" class="select" value=${form.role} onChange=${set('role')}>
              ${ROLES.map((r) => html`<option value=${r}>${r === 'Gatekeeper' ? 'Gate (Gatekeeper)' : r}</option>`)}</select></div>
          <div class="field"><label for="nu-team">Team</label>
            <select id="nu-team" class="select" value=${form.team} onChange=${set('team')}>
              <option value="">—</option>${TEAMS.map((t) => html`<option value=${t}>${t}</option>`)}</select></div>
          <button class="btn btn-primary" type="submit">Add user</button>
        </div>
        <div class="hint" style="margin-top:8px">${ROLE_HELP[form.role]}</div>
        ${err && html`<div class="callout err" style="margin-top:12px">${err}</div>`}
      </form>
    </div>

    <div>
      <div class="toolbar">
        <div class="search"><input class="input" type="search" placeholder="Search users…" aria-label="Search users" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} /></div>
        <span class="muted small">${rows.length} of ${team.length} users · changes save when you leave a field</span>
      </div>
      <div class="table-wrap"><table class="table" style="min-width:820px">
        <thead><tr><th style="width:32%">Work email</th><th>Name</th><th style="width:170px">Role</th><th style="width:130px">Team</th><th style="width:110px"></th></tr></thead>
        <tbody>
          ${rows.length === 0 && html`<tr><td colspan="5" class="empty">No users match.</td></tr>`}
          ${rows.map((r) => {
            const self = lower(r.email) === me.email;
            const lastAdmin = r.role === 'Admin' && admins.length <= 1;
            return html`<tr key=${r.id}>
              <td><${TextInput} mono value=${r.email} onSave=${save(r, 'email')} />${self && html`<div class="sub">This is you</div>`}</td>
              <td><${TextInput} value=${r.name} onSave=${save(r, 'name')} /></td>
              <td><${Select} value=${r.role} options=${ROLES} allowEmpty=${false} onSave=${save(r, 'role')} /></td>
              <td><${Select} value=${r.team} options=${TEAMS} onSave=${save(r, 'team')} /></td>
              <td class="num">${self || lastAdmin
                ? html`<span class="faint small" title=${self ? "You can't remove yourself" : 'Keep at least one Admin'}>—</span>`
                : html`<${ConfirmButton} cls="btn btn-sm btn-danger" label="Remove" confirmLabel="Confirm" onConfirm=${() => remove(r)} />`}</td>
            </tr>`;
          })}
        </tbody>
      </table></div>
      ${team.some((t) => !ROLES.includes(t.role)) && html`<div class="callout warn" style="margin-top:12px">
        Some users have an old role (for example "Standard") from SharePoint. They are treated as Planners until you pick a role.</div>`}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
function RefList({ table }) {
  const s = useStore(app);
  const L = LISTS[table];
  const rows = s[L.key];
  const save = (id, f) => async (v) => {
    try { await db().update(table, id, { [f]: v }); await loadLookups(); } catch (e) { toast(`Not saved: ${e.message}`, 'error'); }
  };
  const add = async () => {
    try { await db().insert(table, L.blank); await loadLookups(); } catch (e) { toast(`Not added: ${e.message}`, 'error'); }
  };
  const del = async (id) => {
    try { await db().remove(table, id); await loadLookups(); } catch (e) { toast(`Not deleted: ${e.message}`, 'error'); }
  };
  return html`<div>
    <div class="toolbar"><span class="muted">${L.hint}</span><span class="spacer"></span><button class="btn btn-dark" onClick=${add}>+ Add row</button></div>
    <div class="table-wrap"><table class="table">
      <thead><tr>${L.cols.map((c) => html`<th style=${c.w ? `width:${c.w}` : ''}>${c.label}</th>`)}<th></th></tr></thead>
      <tbody>
        ${rows.length === 0 && html`<tr><td colspan=${L.cols.length + 1} class="empty">No rows yet.</td></tr>`}
        ${[...rows].sort((a, b) => a.id - b.id).map((r) => html`<tr key=${r.id}>
          ${L.cols.map((c) => html`<td>${c.date ? html`<${DateInput} value=${r[c.f]} onSave=${save(r.id, c.f)} />`
            : html`<${TextInput} mono=${c.mono} value=${r[c.f]} onSave=${save(r.id, c.f)} />`}</td>`)}
          <td class="num"><${ConfirmButton} cls="btn btn-sm btn-danger" label="Delete" confirmLabel="Confirm" onConfirm=${() => del(r.id)} /></td>
        </tr>`)}
      </tbody>
    </table></div>
  </div>`;
}
