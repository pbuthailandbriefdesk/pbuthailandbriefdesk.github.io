// scrReview: review & submit (planner) / brief summary (everyone else), structure outline and SDF export.
import { useMemo, useState } from 'preact/hooks';
import { doneToast, pullBack, submitBrief } from '../data/actions.js';
import { app, loadNotifications, toast, useBrief, useCrumbs, useStore } from '../data/store.js';
import { LOCKED_STATUSES, MIN_LEAD_DAYS } from '../lib/constants.js';
import { buildSdf, sdfWarnings } from '../lib/sdf.js';
import { rowKey } from '../lib/tree.js';
import { coalesce, diffDays, downloadText, fmtDate, fmtInt, isBlank, num, singleLine, txt } from '../lib/util.js';
import { briefPath, go } from '../router.js';
import { ActionButton, ChecksList, CheckSummary, ErrorBox, html, Icon, Loading, PageHead } from '../ui/ui.js';
import { briefCrumbs, useDerived } from './common.js';
import { loadBriefs } from './home.js';

export function Review({ route }) {
  const [st, store] = useBrief(route.briefId);
  const { me, testMode } = useStore(app);
  const d = useDerived(st);
  const [open, setOpen] = useState(null); // expanded keys (colOpen)
  const [confirmRecall, setConfirmRecall] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  useCrumbs(briefCrumbs(st.b));

  if (st.loading) return html`<${Loading} />`;
  if (st.error) return html`<${ErrorBox} msg=${st.error} />`;
  const { b, I, L, G, A } = st;
  const mine = b.planner_email?.toLowerCase() === me.email || me.isAdmin;
  const planning = ['Draft', 'Returned'].includes(b.status);
  const openKeys = open || new Set(I.map((i) => `IO${i.io_no}`)); // OnVisible: IOs expanded

  const failing = d.checks.filter((c) => !c.ok);
  const plannerDone = b.status === 'With Ad Ops' && failing.every((c) => c.rule === 'Ad Ops');
  const gapsText = d.open === 0
    ? 'Everything Ad Ops needs is here. Check the structure below, then submit.'
    : (plannerDone ? 'Planner part complete. Waiting on Ad Ops: ' : 'To fix: ') + failing.map((c) => c.item).join('  ·  ');
  const leadOk = d.lead >= MIN_LEAD_DAYS;

  const visible = d.rows.filter((r) => r.lvl === 'IO' || (openKeys.has(`IO${r.io_no}`) &&
    (r.lvl === 'LI' || (openKeys.has(`LI${r.io_no}.${r.line_no}`) && (r.lvl === 'AG' || num(r.ag_no) === 0 || openKeys.has(`AG${r.io_no}.${r.line_no}.${r.ag_no}`))))));
  const toggle = (k) => { const s = new Set(openKeys); if (s.has(k)) s.delete(k); else s.add(k); setOpen(s); };
  const kids = (r) => {
    if (r.lvl === 'IO') return `${L.filter((l) => l.io_no === r.io_no).length} line items`;
    if (r.lvl === 'LI') {
      const g = G.filter((x) => x.io_no === r.io_no && x.line_no === r.line_no).length;
      return g > 0 ? `${g} ad groups` : `${A.filter((x) => x.io_no === r.io_no && x.line_no === r.line_no).length} creatives`;
    }
    if (r.lvl === 'AG') return `${A.filter((x) => x.io_no === r.io_no && x.line_no === r.line_no && x.ag_no === r.ag_no).length} ads`;
    return '';
  };

  // ---- footer actions (rvBackEdit / rvGoNext / rvSubmit)
  const backEdit = async () => {
    if (planning && mine) return go(briefPath(b.brief_id, 'edit'));
    if (['With Ad Ops', 'With Gatekeeper'].includes(b.status) && mine) {
      if (!confirmRecall) return setConfirmRecall(true);
      const mail = await pullBack(store);
      setConfirmRecall(false);
      doneToast('Pulled back. Ad Ops and the Gate have been told to pause.', mail);
      loadNotifications();
      return go(briefPath(b.brief_id, 'edit'));
    }
    if (LOCKED_STATUSES.includes(b.status) && mine) return go(briefPath(b.brief_id, 'detail'));
    return go('#/');
  };
  const backLabel = confirmRecall ? 'Yes, pull back and edit'
    : (planning || ['With Ad Ops', 'With Gatekeeper'].includes(b.status)) && mine ? 'Edit brief'
      : LOCKED_STATUSES.includes(b.status) && mine ? 'Request a change' : 'Back to list';
  const footNote = confirmRecall ? 'Ad Ops and the Gate stop work on this brief while you edit. Submitting it again counts as 1 resubmission on your scorecard.'
    : testMode && planning ? 'Test mode is ON: submit skips the checks and lead time.'
      : b.status === 'Draft' && !isBlank(b.submitted_at) && mine ? 'Submitted before: submitting again counts as 1 resubmission on your scorecard.'
        : planning && mine ? (d.open === 0 ? 'Will be sent to Ad Ops for taxonomy.' : 'Fix the open checks first (Edit brief).')
          : ['With Ad Ops', 'With Gatekeeper'].includes(b.status) && mine ? 'Viewing only. Edit brief pulls it back to you; nothing counts until you submit again.'
            : LOCKED_STATUSES.includes(b.status) ? 'Locked brief. Changes go through Request a change (major change = new version).' : 'Viewing only.';
  const next = b.status === 'With Ad Ops' && me.isAdOps ? ['adops', 'Open Ad Ops taxonomy']
    : b.status === 'With Gatekeeper' && me.isGate ? ['gate', 'Open Gate review'] : ['detail', 'History & set-up'];
  const submit = async () => {
    if (!testMode && d.open > 0) return toast('Not ready: fix the checks marked ✗ first.', 'error');
    if (!testMode && d.lead < MIN_LEAD_DAYS && !(b.is_exception === 'Yes' && !isBlank(b.exception_approver))) {
      return toast(`Lead time is under ${MIN_LEAD_DAYS} working days. Record an approved exception first.`, 'error');
    }
    const mail = await submitBrief(store, d.lead, testMode, d.open);
    doneToast('Sent to Ad Ops', mail);
    await loadBriefs();
    go('#/');
  };

  return html`<div class="page">
    <${PageHead} eyebrow=${b.brief_id} title=${planning ? 'Review & submit' : 'Brief summary'}
      sub=${`${coalesce(b.brand, '—')}  ·  ${coalesce(b.campaign_name, '(no campaign name)')}  ·  ${coalesce(b.brief_type, 'New')} brief  ·  ● ${b.status}${num(b.resubmits) > 0 ? `  ·  resubmitted ${txt(b.resubmits)}×` : ''}`} />

    <div class="tiles">
      <div class="tile hero"><div class="k">Total budget (incl. fee)</div><div class="v">THB ${fmtInt(coalesce(b.total_budget, 0))}</div>
        <div class="n">PO ${coalesce(b.po_number, '–')}  ·  THB ${fmtInt(coalesce(b.po_amount, 0))}</div></div>
      <div class="tile"><div class="k">Insertion orders</div><div class="v">${I.length}</div>
        <div class="n">IO budgets THB ${fmtInt(coalesce(I.reduce((s, x) => s + num(x.budget), 0), 0))}</div></div>
      <div class="tile"><div class="k">Line items</div><div class="v">${L.length}</div>
        <div class="n">${G.length} ad groups  ·  ${A.length} ads / creatives</div></div>
      <div class="tile"><div class="k">Flight</div><div class="v" style="font-size:22px">${fmtDate(b.launch_date, 'dd mmm')} – ${fmtDate(b.end_date)}</div>
        <div class="n">${isBlank(b.launch_date) || isBlank(b.end_date) ? '–' : `${diffDays(b.launch_date, b.end_date) + 1} days`}${['Extension', 'Update'].includes(b.brief_type) ? `  ·  changes from ${fmtDate(b.effective_date, 'dd mmm')}` : ''}</div></div>
      <div class=${`tile${leadOk ? '' : ' accent'}`}><div class="k">Lead time</div><div class="v">${d.lead} WD</div>
        <div class="n">${leadOk ? `OK (min ${MIN_LEAD_DAYS})` : b.is_exception === 'Yes' ? `Exception: ${txt(b.exception_approver)}` : `Under ${MIN_LEAD_DAYS}: needs exception`}</div></div>
    </div>

    <div class="card" style="margin-bottom:22px"><div class="card-body">
      <div class="row" style="align-items:flex-start">
        <span class=${`mark-lg ${d.open === 0 ? 'ok' : 'bad'}`} aria-hidden="true">${d.open === 0 ? '✓' : '!'}</span>
        <div style="flex:1;min-width:240px">
          <${CheckSummary} checks=${d.checks} />
          <div class=${d.open === 0 ? 'muted' : ''} style="margin-top:6px">${gapsText}</div>
        </div>
        <button class="btn btn-sm" onClick=${() => setShowChecks(!showChecks)}>${showChecks ? 'Hide details' : 'All 14 checks'}</button>
      </div>
      ${showChecks && html`<div style="margin-top:12px"><${ChecksList} checks=${d.checks} /></div>`}
    </div></div>

    ${(me.isAdOps || me.isGate) && html`<${SdfPanel} st=${st} store=${store} />`}

    <div class="card">
      <div class="card-head">
        <h3>Structure</h3>
        <span class="muted small">IO insertion order · LI line item · AG ad group · AD ad · CR creative</span>
        <div class="right">
          <button class="btn btn-sm" onClick=${() => setOpen(new Set(d.rows.filter((r) => r.lvl !== 'AD').map(rowKey)))}>Expand all</button>
          <button class="btn btn-sm" onClick=${() => setOpen(new Set())}>Collapse all</button>
        </div>
      </div>
      ${d.rows.length === 0 ? html`<div class="empty">No insertion orders yet.</div>` : html`<div class="otree" style="border:none">
        ${visible.map((r) => {
          const k = rowKey(r);
          const badge = r.lvl === 'AD' && num(r.ag_no) === 0 ? 'CR' : r.lvl;
          return html`<div class=${`orow l${r.indent} ${r.lvl}`}>
            ${r.lvl !== 'AD'
              ? html`<button class="chev" aria-label=${openKeys.has(k) ? 'Collapse' : 'Expand'} aria-expanded=${openKeys.has(k)} onClick=${() => toggle(k)}><${Icon} name=${openKeys.has(k) ? 'chevD' : 'chevR'} /></button>`
              : html`<span></span>`}
            <span class=${`lvl ${badge}`}>${badge}</span>
            <div style="min-width:0">
              <div class="lbl">${singleLine(r.label)}</div>
              <div class="meta">${isBlank(r.nm) ? '' : html`<span class="mono">${r.nm}</span>   ·   `}${singleLine(r.detail)}</div>
            </div>
            <div class="kids">${num(r.bud) > 0 && html`<div class="strong" style="color:var(--ink)">THB ${fmtInt(r.bud)}</div>`}${kids(r)}</div>
          </div>`;
        })}
      </div>`}
    </div>

    <div class="footbar">
      <button class="btn" onClick=${backEdit}>${backLabel === 'Edit brief' ? html`<${Icon} name="edit" />` : null}${backLabel}</button>
      ${confirmRecall && html`<button class="btn btn-ghost" onClick=${() => setConfirmRecall(false)}>Cancel</button>`}
      <div class="note">${footNote}</div>
      ${!(planning && mine) && html`<a class="btn btn-dark" href=${briefPath(b.brief_id, next[0])}>${next[1]} →</a>`}
      ${planning && mine && html`<${ActionButton} cls="btn btn-primary btn-lg btn-arrow" onClick=${submit}>
        ${d.open === 0 ? 'Submit to Ad Ops' : `Submit to Ad Ops (${d.open} open)`}<//>`}
    </div>
  </div>`;
}

// rvSdf*: build the DV360 SDF v11 files. Downloads replace the "Email files to me" button.
function SdfPanel({ st, store }) {
  const { sdf } = useStore(app);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const { b, I, L, G, A } = st;
  const warns = useMemo(() => (files ? sdfWarnings(b, I, L, G, A, sdf) : []), [files, st, sdf]);
  const build = () => { setFiles(buildSdf(b, I, L, G, A, sdf)); toast('SDF v11 files built', 'success'); };
  const log = (detail) => store.event('SDF v11 downloaded', detail);
  const zipAll = async () => {
    if (!window.JSZip) { toast('Zip library still loading. Try again in a moment.', 'warning'); return; }
    const zip = new window.JSZip();
    files.forEach((f) => zip.file(f.name, f.content));
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `SDF-v11_${b.brief_id}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    await log(files.map((f) => `${f.name} ${f.rows}`).join(', '));
  };
  return html`<div class="card" style="margin-bottom:22px">
    <div class="card-head">
      <h3>DV360 SDF v11</h3>
      <span class="muted small">Upload-ready files from this brief and the default settings list</span>
      <div class="right"><button class="btn btn-sm" onClick=${() => setOpen(!open)}>${open ? 'Close' : 'Open'}</button></div>
    </div>
    ${open && html`<div class="card-body stack" style="gap:14px">
      <div class="row">
        <button class="btn btn-dark" onClick=${build}><${Icon} name="file" />${files ? 'Rebuild files' : 'Build files'}</button>
        ${files && files.length > 0 && html`<button class="btn" onClick=${zipAll}><${Icon} name="download" />Download all (.zip)</button>`}
      </div>
      ${!files ? html`<div class="muted small">Click Build to create the files.</div>` : html`
        <div class="table-wrap"><table class="table">
          <thead><tr><th>File</th><th class="num">Rows</th><th></th></tr></thead>
          <tbody>${files.map((f) => html`<tr>
            <td class="strong">✓ ${f.name}</td><td class="num">${f.rows}</td>
            <td class="num">
              <button class="btn btn-sm" onClick=${() => { downloadText(f.name, f.content); log(`${f.name} ${f.rows}`); }}><${Icon} name="download" />Download</button>
              <button class="btn btn-sm btn-ghost" onClick=${async () => { await navigator.clipboard.writeText(f.content); toast(`Copied ${f.name}`); }}><${Icon} name="copy" />Copy</button>
            </td></tr>`)}</tbody>
        </table></div>
        ${warns.length > 0 && html`<div class="callout warn">${warns.map((w) => html`<div>• ${w}</div>`)}</div>`}
        <div class="small muted">Upload in DV360: advertiser ${txt(b.advertiser)} → Resources → Structured data → Upload, in this order: Campaigns, Insertion orders, Line items, Ad groups, Ads. New rows use ext IDs so they link to each other in one upload.
          ${I.some((x) => x.action === 'Update') && html` <strong>EDIT-SDF-InsertionOrders.csv</strong> changes live IOs: paste the Timestamp column from a fresh DV360 download before uploading.`}</div>`}
    </div>`}
  </div>`;
}
