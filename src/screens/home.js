// scrHome: queues of briefs.
import { useEffect, useState } from 'preact/hooks';
import { createBrief } from '../data/actions.js';
import { app, db, toast, useCrumbs, useStore } from '../data/store.js';
import { QUEUES, queueRows } from '../lib/queues.js';
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
  const tab = route.query.tab || 'Mine';
  const queue = QUEUES.find((q) => q.key === tab) || QUEUES[0];
  const [search, setSearch] = useState('');
  useCrumbs([{ label: 'Briefs', href: '#/' }, { label: queue.label }]);
  useEffect(() => { loadBriefs(); }, [tab]);

  if (!briefs) return html`<${Loading} />`;

  const live = briefs.filter((b) => b.status !== 'Cancelled');
  const n = (s) => live.filter((b) => b.status === s).length;
  const s = lower(search.trim());
  const rows = queueRows(briefs, tab, me).filter((b) => !s ||
    [b.brief_id, b.brand, b.team, b.campaign_taxonomy, b.campaign_name, b.planner_name, b.buyer_name, b.status, b.po_number]
      .some((v) => lower(v).includes(s)));

  const tiles = [
    { k: 'Drafts', v: n('Draft') + n('Returned'), note: `${n('Returned')} returned by the Gate`, tab: 'Mine', accent: !me.isAdOps && !me.isGate },
    { k: 'With Ad Ops', v: n('With Ad Ops'), note: 'Taxonomy in progress', tab: 'AO', accent: me.isAdOps && !me.isAdmin },
    { k: 'With the Gate', v: n('With Gatekeeper'), note: 'Waiting for the 14-item check', tab: 'Gate', accent: me.role === 'Gatekeeper' },
    { k: 'Waiting for a buyer', v: n('Locked'), note: 'Locked, SLA running', tab: 'Setup', accent: me.role === 'Buyer' },
    { k: 'In set-up', v: n('In set-up'), note: 'Accepted by a buyer', tab: 'Locked' },
    { k: 'Set up', v: n('Set up'), note: 'Live in DV360', tab: 'Locked' },
  ];

  const newBrief = async () => {
    const b = await createBrief();
    await loadBriefs();
    go(briefPath(b.brief_id, 'edit'));
  };

  return html`<div class="page">
    <${PageHead} eyebrow="Briefs" title=${queue.label} sub=${QUEUE_SUB[tab]}>
      <${ActionButton} cls="btn btn-primary btn-lg btn-arrow" onClick=${newBrief}>New brief<//>
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
      <span class="muted small">${rows.length} ${rows.length === 1 ? 'brief' : 'briefs'}</span>
    </div>

    ${rows.length === 0 ? html`<div class="table-wrap"><div class="empty">
        <div class="big">Nothing here yet.</div>
        ${tab === 'Mine' && html`<div>Start with <a href="#" onClick=${(e) => { e.preventDefault(); newBrief(); }}>a new brief</a>.</div>`}
      </div></div>` : html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th>ID / brand</th><th>Campaign</th><th>Flight</th><th class="num">Budget</th><th>Planner</th><th>Buyer</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${rows.map((b) => html`<tr class="clickable" onClick=${() => go(briefPath(b.brief_id))}
              tabindex="0" onKeyDown=${(e) => { if (e.key === 'Enter') go(briefPath(b.brief_id)); }}>
            <td><div class="id">${b.brief_id}</div><div class="sub">${coalesce(b.brand, '—')}  ·  ${coalesce(b.team, '—')}</div></td>
            <td class="camp">${coalesce(b.campaign_taxonomy, b.campaign_name) || html`<span class="faint">(no name yet)</span>`}
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
