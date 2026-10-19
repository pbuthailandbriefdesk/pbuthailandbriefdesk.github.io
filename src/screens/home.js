// scrHome: queues of briefs.
import { useEffect, useState } from 'preact/hooks';
import { createBrief } from '../data/actions.js';
import { app, db, toast, useCrumbs, useStore } from '../data/store.js';
import { homeQueue, QUEUES, queueRows, queuesFor } from '../lib/queues.js';
import { coalesce, fmtDate, fmtInt, fmtTs, isBlank, lower } from '../lib/util.js';
import { briefPath, go } from '../router.js';
import { ActionButton, html, Icon, Loading, PageHead, StatusPill } from '../ui/ui.js';

export async function loadBriefs() {
  try {
    const briefs = await db().list('briefs', { order: ['id', 'desc'] });
    app.set({ briefs });
  } catch (e) {
    toast(`Could not load briefs: ${e.message}`, 'error');
  }
}

const QUEUE_SUB = {
  Mine: 'Briefs you planned, newest first. Cancelled briefs are hidden.',
  AO: 'Submitted briefs waiting for Ad Ops taxonomy, actions and DV360 IDs.',
  Gate: 'Briefs with complete taxonomy, waiting for the 14-item Gate check.',
  Setup: 'Locked briefs waiting for a buyer, and set-ups you have accepted.',
  Locked: 'Everything that passed the Gate: locked, in set-up or set up.',
  All: 'Every brief in the Desk.',
};

export function Home({ route }) {
  const { briefs, me } = useStore(app);
  // Each role only sees its own queues; anything else falls back to its home queue.
  const allowed = queuesFor(me);
  const tab = allowed.some((q) => q.key === route.query.tab) ? route.query.tab : homeQueue(me);
  const queue = QUEUES.find((q) => q.key === tab) || QUEUES[0];
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  useCrumbs([{ label: 'Briefs', href: '#/' }, { label: queue.label }]);
  useEffect(() => { loadBriefs(); setFilters({}); }, [tab]);

  if (!briefs) return html`<${Loading} />`;

  const live = briefs.filter((b) => b.status !== 'Cancelled');
  const n = (s) => live.filter((b) => b.status === s).length;
  const s = lower(search.trim());
  const queueAll = queueRows(briefs, tab, me);
  // Dropdown filters next to the search box; options come from the briefs in this queue.
  const buyerOf = (b) => b.buyer_name || b.buyer_email || '';
  const FILTERS = [
    { key: 'status', label: 'Status', get: (b) => b.status || '' },
    { key: 'planner', label: 'Planner', get: (b) => b.planner_name || b.planner_email || '' },
    { key: 'buyer', label: 'Buyer', get: buyerOf, none: '(no buyer yet)' },
    { key: 'brand', label: 'Brand', get: (b) => b.brand || '', none: '(no brand)' },
    { key: 'id', label: 'Brief ID', get: (b) => b.brief_id },
  ];
  const optionsFor = (f) => [...new Set(queueAll.map(f.get))].sort((a, b) => (f.key === 'id' ? b.localeCompare(a) : a.localeCompare(b)));
  const active = FILTERS.filter((f) => filters[f.key] !== undefined && filters[f.key] !== null);
  const rows = queueAll
    .filter((b) => active.every((f) => f.get(b) === filters[f.key]))
    .filter((b) => !s ||
      [b.brief_id, b.brand, b.team, b.campaign_taxonomy, b.campaign_name, b.planner_name, b.buyer_name, b.status, b.po_number]
        .some((v) => lower(v).includes(s)));

  const tiles = [
    { k: 'Drafts', v: n('Draft') + n('Returned'), note: `${n('Returned')} returned by the Gate`, tab: 'Mine', accent: tab === 'Mine' },
    { k: 'With Ad Ops', v: n('With Ad Ops'), note: 'Taxonomy in progress', tab: 'AO', accent: tab === 'AO' },
    { k: 'With the Gate', v: n('With Gatekeeper'), note: 'Waiting for the 14-item check', tab: 'Gate', accent: tab === 'Gate' },
    { k: 'Waiting for a buyer', v: n('Locked'), note: 'Locked, SLA running', tab: 'Setup', accent: tab === 'Setup' },
    { k: 'In set-up', v: n('In set-up'), note: 'Accepted by a buyer', tab: 'Locked' },
    { k: 'Set up', v: n('Set up'), note: 'Live in DV360', tab: 'Locked' },
  ].filter((t) => allowed.some((q) => q.key === t.tab));

  const newBrief = async () => {
    const b = await createBrief();
    await loadBriefs();
    go(briefPath(b.brief_id, 'edit'));
  };

  return html`<div class="page">
    <${PageHead} eyebrow="Briefs" title=${queue.label} sub=${QUEUE_SUB[tab]}>
      ${me.canPlan && html`<${ActionButton} cls="btn btn-primary btn-lg btn-arrow" onClick=${newBrief}>New brief<//>`}
    <//>

    <div class="tiles">
      ${tiles.map((t) => html`<a class=${`tile${t.accent ? ' accent' : ''}`} href=${`#/?tab=${t.tab}`}>
        <div class="k">${t.k}</div><div class="v">${t.v}</div><div class="n">${t.note}</div></a>`)}
    </div>

    <div class="toolbar">
      <div class="search">
        <${Icon} name="search" />
        <input class="input" type="search" placeholder="Search ID, brand, campaign, PO, people…" aria-label="Search briefs"
          value=${search} onInput=${(e) => setSearch(e.currentTarget.value)} />
      </div>
      ${FILTERS.map((f) => {
        const on = filters[f.key] !== undefined && filters[f.key] !== null;
        return html`<select class=${`select filter${on ? ' on' : ''}`} aria-label=${`Filter by ${f.label}`}
          value=${on ? `v:${filters[f.key]}` : ''}
          onChange=${(e) => { const v = e.currentTarget.value; setFilters({ ...filters, [f.key]: v === '' ? null : v.slice(2) }); }}>
          <option value="">${f.label}: All</option>
          ${optionsFor(f).map((o) => html`<option value=${`v:${o}`}>${o === '' ? f.none || '(blank)' : o}</option>`)}
        </select>`;
      })}
      ${(active.length > 0 || s) && html`<button class="btn btn-sm btn-ghost" onClick=${() => { setFilters({}); setSearch(''); }}>Clear</button>`}
      <span class="muted small">${rows.length} ${rows.length === 1 ? 'brief' : 'briefs'}</span>
    </div>

    ${rows.length === 0 ? html`<div class="table-wrap"><div class="empty">
        <div class="big">Nothing here yet.</div>
        ${tab === 'Mine' && html`<div>Start with <a href="#" onClick=${(e) => { e.preventDefault(); newBrief(); }}>a new brief</a>.</div>`}
      </div></div>` : html`
    <div class="table-wrap">
      <table class="table briefs">
        <colgroup><col style="width:170px" /><col /><col style="width:170px" /><col style="width:130px" /><col style="width:150px" /><col style="width:150px" /><col style="width:140px" /></colgroup>
        <thead><tr>
          <th>ID / brand</th><th>Campaign</th><th>Flight</th><th class="num">Budget</th><th>Planner</th><th>Buyer</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${rows.map((b) => html`<tr class="clickable" onClick=${() => go(briefPath(b.brief_id))}
              tabindex="0" onKeyDown=${(e) => { if (e.key === 'Enter') go(briefPath(b.brief_id)); }}>
            <td><div class="id">${b.brief_id}</div><div class="sub">${coalesce(b.brand, '—')}  ·  ${coalesce(b.team, '—')}</div></td>
            <td class="camp">${coalesce(b.campaign_taxonomy, b.campaign_name)
              ? html`<div class="clamp2 mono" title=${coalesce(b.campaign_taxonomy, b.campaign_name)}>${coalesce(b.campaign_taxonomy, b.campaign_name)}</div>`
              : html`<span class="faint">(no name yet)</span>`}
              ${b.brief_type && b.brief_type !== 'New' && html`<div class="sub">${b.brief_type} brief</div>`}</td>
            <td class="nowrap">${isBlank(b.launch_date) ? html`<span class="faint">–</span>` : html`${fmtDate(b.launch_date)} – ${fmtDate(b.end_date)}`}</td>
            <td class="num">${isBlank(b.total_budget) ? html`<span class="faint">–</span>` : `THB ${fmtInt(b.total_budget)}`}</td>
            <td>${b.planner_name}</td>
            <td>${isBlank(b.buyer_email) ? html`<span class="faint">–</span>` : coalesce(b.buyer_name, b.buyer_email)}
              <div class="sub">${!isBlank(b.buyer_accepted_at) ? `✓ accepted ${fmtTs(b.buyer_accepted_at)}` : b.status === 'Locked' ? 'waiting for a buyer' : ''}</div></td>
            <td><${StatusPill} status=${b.status} /></td>
          </tr>`)}
        </tbody>
      </table>
    </div>`}
  </div>`;
}
