// scrDetail: history and set-up actions (accept, set up, take over, change requests, cancel).
import { useEffect, useState } from 'preact/hooks';
import {
  acceptSetup, deleteOrCancel, doneToast, logChange, logNamingFix, sendToQa, takeOver,
} from '../data/actions.js';
import { app, db, toast, useBrief, useCrumbs, useStore } from '../data/store.js';
import { LOCKED_STATUSES, OPT } from '../lib/constants.js';
import { coalesce, fmtTs, isBlank, num, singleLine } from '../lib/util.js';
import { briefPath, go } from '../router.js';
import { ActionButton, ConfirmButton, ErrorBox, Field, html, Loading, PageHead, Select, TextInput } from '../ui/ui.js';
import { CampaignIdField } from '../ui/campaign.js';
import { matchPastedIds } from '../lib/adops.js';
import { buildRows } from '../lib/tree.js';
import { BriefSummary, briefCrumbs } from './common.js';
import { loadBriefs } from './home.js';

export function Detail({ route }) {
  const [st, store] = useBrief(route.briefId);
  const { me } = useStore(app);
  const [changeType, setChangeType] = useState(OPT.changeType[0]);
  const [why, setWhy] = useState('');
  useCrumbs(briefCrumbs(st.b, 'History & set-up'));

  if (st.loading) return html`<${Loading} />`;
  if (st.error) return html`<${ErrorBox} msg=${st.error} />`;
  const { b, E } = st;
  const mine = b.planner_email?.toLowerCase() === me.email || me.isAdmin;
  const locked = LOCKED_STATUSES.includes(b.status);
  const events = [...E].sort((x, y) => num(y.id) - num(x.id));

  const show = {
    accept: b.status === 'Locked' && me.isBuyer,
    setUp: b.status === 'In set-up' && (b.buyer_email?.toLowerCase() === me.email || me.isSuper),
    takeOver: b.status === 'In set-up' && me.isBuyer && b.buyer_email?.toLowerCase() !== me.email && !me.isSuper,
    change: locked && mine,
    namingFix: b.status === 'Set up' && (me.isBuyer || me.isAdOps),
    cancel: ['Draft', 'Returned', 'With Ad Ops', 'With Gatekeeper', 'Locked', 'In set-up'].includes(b.status) && mine,
  };

  const change = async () => {
    const major = changeType.startsWith('Major');
    const mail = await logChange(store, major, why);
    setWhy('');
    if (major) {
      doneToast('Brief reopened as a new version. Ad Ops, the Gate and the buyer were notified.', mail);
      await loadBriefs();
      go(briefPath(b.brief_id, 'edit'));
    } else {
      doneToast('Minor change logged and sent to the buyer', mail);
    }
  };

  return html`<div class="page">
    <${PageHead} eyebrow=${`${b.brief_id} · v${b.brief_version ?? ''}`} title="History & set-up">
      <a class="btn" href=${briefPath(b.brief_id)}>Brief summary</a>
    <//>
    <div class="split">
      <div class="stack">
        <${BriefSummary} st=${st} extra=${html`<div class="grid g3 small" style="margin-top:14px">
          <div><div class="label">Taxonomy</div><div class="mono" style="word-break:break-all">${coalesce(b.campaign_taxonomy, '–')}</div></div>
          <div><div class="label">Buyer</div><div>${coalesce(b.buyer_name, b.buyer_email, 'unassigned')}${isBlank(b.buyer_accepted_at) ? '' : ` (accepted ${fmtTs(b.buyer_accepted_at)})`}</div></div>
          <div><div class="label">Gate</div><div>${coalesce(b.gate_result, '–')}${isBlank(b.locked_at) ? '' : `  ·  Locked ${fmtTs(b.locked_at)}`}</div></div>
        </div>`} />
        ${locked && (me.isBuyer || me.isAdOps) && html`<${DV360Ids} st=${st} store=${store} canEdit=${me.isBuyer} />`}
        <div class="card">
          <div class="card-head"><h3>History</h3><span class="muted small">${events.length} events</span></div>
          <div class="card-body">
            ${events.length === 0 ? html`<div class="muted">No history yet.</div>` : html`<ul class="timeline">
              ${events.map((e) => html`<li>
                <div class="when">${fmtTs(e.at, 'dd mmm yy hh:mm')}  ·  ${e.by_email}</div>
                <div class="what">${e.event}</div>
                ${!isBlank(e.detail) && html`<div class="detail">${e.detail}</div>`}
              </li>`)}
            </ul>`}
          </div>
        </div>
      </div>

      <aside>
        <div class="card">
          <div class="card-head"><h3>Actions</h3></div>
          <div class="card-body stack" style="gap:12px">
            ${show.accept && html`<${ActionButton} cls="btn btn-primary btn-lg btn-arrow" onClick=${() => acceptSetup(store)}>Accept this set-up<//>`}
            ${show.setUp && b.qa_result === 'Fail' && html`<${QaFailNote} b=${b} />`}
            ${show.setUp && html`<${ActionButton} cls="btn btn-primary btn-lg btn-arrow" onClick=${async () => { const mail = await sendToQa(store); doneToast('Sent to P2P QA. The campaign is marked set up once QA passes.', mail); }}>Send to P2P QA<//>`}
            ${show.setUp && html`<div class="small muted">Set up in DV360 first. QA compares the DV360 export with this brief; only a QA pass marks it set up.</div>`}
            ${b.status === 'In QA' && html`<div class="callout small">With P2P QA since ${fmtTs(b.qa_requested_at)}.${me.isQA ? html` <a href=${briefPath(b.brief_id, 'qa')}>Open P2P QA</a>` : ''}</div>`}
            ${show.takeOver && html`<${ActionButton} cls="btn" onClick=${() => takeOver(store)}>Take over this set-up<//>`}
            ${!show.accept && !show.setUp && !show.takeOver && !locked && !show.cancel && html`<div class="muted small">No actions for you on this brief right now.</div>`}

            ${locked && (show.change || show.namingFix) && html`<div class="stack" style="gap:10px;border-top:1px solid var(--rule);padding-top:14px">
              <div class="strong">Request a change after Lock</div>
              <${Select} label="Change type" value=${changeType} options=${OPT.changeType} allowEmpty=${false} onSave=${setChangeType} />
              <div class="field"><label for="why">Reason</label>
                <textarea id="why" class="textarea" rows="3" value=${why} onInput=${(e) => setWhy(e.currentTarget.value)}></textarea></div>
              ${show.change && html`<${ActionButton} cls="btn btn-dark" onClick=${change}>Log change<//>`}
              ${show.change && changeType.startsWith('Major') && html`<div class="small muted">A major change reopens the brief as a new version and restarts the SLA after the Gate.</div>`}
              ${show.namingFix && html`<${ActionButton} cls="btn" onClick=${async () => { await logNamingFix(store, why); setWhy(''); }}>Log naming fix after launch<//>`}
            </div>`}

            ${show.cancel && html`<div style=${show.accept || show.setUp || show.takeOver || (locked && (show.change || show.namingFix)) ? 'border-top:1px solid var(--rule);padding-top:14px' : ''}>
              <${ConfirmButton} label=${isBlank(b.submitted_at) ? 'Delete draft' : 'Cancel brief'}
                onConfirm=${async () => { await deleteOrCancel(store); await loadBriefs(); go('#/'); }} />
            </div>`}
          </div>
        </div>
      </aside>
    </div>
  </div>`;
}

// Buyer step: record the DV360 Campaign ID and the IDs DV360 gives each IO, line item,
// ad group and ad after set-up (moved here from Ad Ops on 2026-10-19).
function DV360Ids({ st, store, canEdit }) {
  const { brands } = useStore(app);
  const { b, I, L, G, A } = st;
  const [paste, setPaste] = useState('');
  const [open, setOpen] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const rows = buildRows(b, I, L, G, A, brands);
  const withId = rows.filter((r) => !isBlank(r.dvId)).length;
  const shown = onlyMissing ? rows.filter((r) => isBlank(r.dvId)) : rows;

  const match = async () => {
    const m = matchPastedIds(paste, b, I, L, G, A);
    await store.patchRows(m.ups);
    if (m.campaignId) await store.patchBrief({ dv360_campaign_id: m.campaignId });
    const n = m.ups.length + (m.campaignId ? 1 : 0);
    toast(`${m.pastedCount} pasted lines matched a name here. Filled ${n} DV360 IDs (IO ${m.counts.io} · LI ${m.counts.li} · AG ${m.counts.ag} · ad ${m.counts.ad}${m.campaignId ? ' · campaign' : ''}). Rows that already had an ID were left alone.`, n > 0 ? 'success' : 'warning');
    setPaste('');
  };

  return html`<div class="card">
    <div class="card-head"><h3>DV360 IDs</h3>
      <span class="right small ${withId === rows.length && rows.length ? 'strong' : 'muted'}">${withId} of ${rows.length} rows have an ID${isBlank(b.dv360_campaign_id) ? ' · no campaign ID yet' : ''}</span></div>
    <div class="card-body stack" style="gap:16px">
      <div class="small muted">Fill these in during set-up, after creating or finding each item in DV360. Optional, but they make later updates, pauses and SDF edits match the right items.</div>
      <div class="grid g2" style="align-items:start">
        <${CampaignIdField} b=${b} disabled=${!canEdit} onSave=${(v) => store.patchBrief({ dv360_campaign_id: v })} />
        <div class="stack" style="gap:8px">
          <${Field} label="Paste IDs from DV360" hint="One item per line: name and ID (copy the table from DV360 or an SDF export).">
            <textarea class="textarea mono" rows="4" disabled=${!canEdit} value=${paste} onInput=${(e) => setPaste(e.currentTarget.value)}
              placeholder=${'name<TAB>1234567'}></textarea>
          <//>
          <div><${ActionButton} cls="btn btn-dark btn-sm" disabled=${!canEdit || !paste.trim()} onClick=${match}>Match IDs by name<//></div>
        </div>
      </div>
      <div class="row">
        <button class="btn btn-sm" onClick=${() => setOpen(!open)}>${open ? 'Hide items' : 'Enter IDs item by item'}</button>
        ${open && html`<label class="small row" style="gap:6px"><input type="checkbox" checked=${onlyMissing} onChange=${(e) => setOnlyMissing(e.currentTarget.checked)} /> Only items without an ID</label>`}
      </div>
      ${open && html`<div class="ao-list" style="border:1px solid var(--rule)">
        ${shown.length === 0 && html`<div class="empty small">Every item has a DV360 ID.</div>`}
        ${shown.map((r) => html`<div class=${`ao-item ${r.lvl}`} key=${r.table + r.rec.id} style=${`padding-left:${16 + r.indent * 20}px`}>
          <div class="ao-label"><span class=${`lvl ${r.lvl === 'AD' && num(r.ag_no) === 0 ? 'CR' : r.lvl}`}>${r.lvl === 'AD' && num(r.ag_no) === 0 ? 'CR' : r.lvl}</span>
            <span>${singleLine(r.label)}</span></div>
          <div class="ao-controls" style="grid-template-columns:minmax(0,1fr) 200px">
            <div class="field"><label>Name</label><div class="code-chip">${r.nm || '–'}</div></div>
            <div class="field"><label>DV360 ID</label><${TextInput} mono value=${r.dvId} disabled=${!canEdit}
              onSave=${(v) => store.patchRow(r.table, r.rec.id, { dv360_id: v })} /></div>
          </div>
        </div>`)}
      </div>`}
    </div>
  </div>`;
}

// Shown to the Buyer after a failed QA: the blocking findings of the last run.
function QaFailNote({ b }) {
  const [run, setRun] = useState(null);
  useEffect(() => {
    db().list('qa_runs', { eq: { brief_id: b.brief_id }, order: ['id', 'desc'] }).then((r) => setRun(r[0] || null)).catch(() => {});
  }, [b.brief_id, b.qa_done_at]);
  const fails = (run?.findings || []).filter((f) => f.status === 'FAIL');
  return html`<div class="callout err small">
    <strong>P2P QA failed${run ? ` on ${fmtTs(run.at)}` : ''}.</strong> Fix these in DV360, then send to QA again.
    ${fails.length > 0 && html`<ul style="margin:6px 0 0;padding-left:18px">${fails.slice(0, 8).map((f) => html`<li>${f.scope} · ${f.entity}: ${f.parameter} (${f.reason})</li>`)}</ul>`}
    ${fails.length > 8 && html`<div>…and ${fails.length - 8} more. <a href=${briefPath(b.brief_id, 'qa')}>See the QA report</a></div>`}
    ${run?.note && html`<div style="margin-top:6px">QA note: ${run.note}</div>`}
  </div>`;
}
