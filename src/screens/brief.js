// scrBrief: the planner's brief form (Campaign tab + Structure tab + Gate checks).
import { useState } from 'preact/hooks';
import { deleteOrCancel } from '../data/actions.js';
import { app, useBrief, useCrumbs, useStore } from '../data/store.js';
import { adFormatOptions, AUDS, CATS, DEVICES, LANGS, MIN_LEAD_DAYS, OBJS, OPT, SUST, ytTypeForFormat } from '../lib/constants.js';
import { adGroupName, adName, campaignName, ioName, lineItemName } from '../lib/naming.js';
import { coalesce, fmtDate, fmtInt, fmtMoney2, isBlank, num, round2, sortBy, sum, txt } from '../lib/util.js';
import { briefPath, go } from '../router.js';
import {
  ChecksList, CheckSummary, ConfirmButton, DateInput, ErrorBox, Field, html, Icon, Loading, NumberInput,
  PageHead, Select, StatusPill, TextInput,
} from '../ui/ui.js';
import { AiAssist } from '../ui/aiassist.js';
import { briefCrumbs, useDerived } from './common.js';

const YT_FORMATS = OPT.ytFormats;

export function BriefEditor({ route }) {
  const [st, store] = useBrief(route.briefId);
  const { me, testMode } = useStore(app);
  const d = useDerived(st);
  const [tab, setTab] = useState(route.query.tab === 'structure' ? 'Structure' : 'Campaign');
  useCrumbs(briefCrumbs(st.b, 'Edit'));

  if (st.loading) return html`<${Loading} />`;
  if (st.error) return html`<${ErrorBox} msg=${st.error} />`;
  const { b } = st;
  const mine = b.planner_email?.toLowerCase() === me.email || me.isAdmin;
  const editable = ['Draft', 'Returned'].includes(b.status) && mine;

  return html`<div class="page">
    <${PageHead} eyebrow=${`Brief · v${txt(b.brief_version)}`} title=${b.brief_id}
      sub=${html`<span class="row" style="gap:10px"><${StatusPill} status=${b.status} /><span>${coalesce(b.brand, 'No brand yet')} · ${coalesce(b.campaign_name, '(no campaign name)')}</span></span>`}>
      ${['Draft', 'Returned'].includes(b.status) && mine && html`<${ConfirmButton}
        label=${isBlank(b.submitted_at) ? 'Delete draft' : 'Cancel brief'}
        onConfirm=${async () => { await deleteOrCancel(store); go('#/'); }} />`}
      <a class="btn btn-primary btn-lg btn-arrow" href=${briefPath(b.brief_id)}>Review & submit</a>
    <//>

    ${b.status === 'Returned' && !isBlank(b.gate_gaps) && html`<div class="callout err" style="margin-bottom:18px">
      <strong>Returned by the Gate.</strong> Gaps to fix: ${b.gate_gaps}</div>`}
    ${!editable && html`<div class="callout warn" style="margin-bottom:18px">
      ${mine
        ? html`This brief is <strong>${b.status}</strong>, so it can't be edited here. ${['Locked', 'In set-up', 'In QA', 'Set up'].includes(b.status) ? 'Use Request a change on the History & set-up page.' : 'Pull it back from the Review page to edit it.'}`
        : 'Only the planner who owns this brief (or an Admin) can edit it.'}
      <a href=${briefPath(b.brief_id)}> Go to the brief summary</a></div>`}

    ${editable && html`<${AiAssist} st=${st} store=${store} />`}

    <div class="tabs" role="tablist">
      <button role="tab" class=${tab === 'Campaign' ? 'on' : ''} onClick=${() => setTab('Campaign')}>Campaign</button>
      <button role="tab" class=${tab === 'Structure' ? 'on' : ''} onClick=${() => setTab('Structure')}>Structure (${st.I.length} IO)</button>
    </div>

    ${tab === 'Campaign'
      ? html`<div class="split">
          <${CampaignForm} st=${st} store=${store} disabled=${!editable} />
          <aside><${ChecksPanel} st=${st} d=${d} me=${me} testMode=${testMode} /></aside>
        </div>`
      : html`<div class="stack">
          <${ChecksStrip} d=${d} />
          <${Structure} st=${st} store=${store} disabled=${!editable} />
        </div>`}
  </div>`;
}

// ---------------------------------------------------------------------------
function ChecksPanel({ st, d, me, testMode }) {
  const { b } = st;
  const under = d.lead < MIN_LEAD_DAYS;
  const exc = b.is_exception === 'Yes' && !isBlank(b.exception_approver);
  return html`<div class="card">
    <div class="card-head"><h3>Brief Gate checks</h3></div>
    <div class="card-body stack" style="gap:14px">
      <div class=${`callout ${under ? (exc ? 'ok' : 'warn') : 'ok'}`}>
        Lead time: <strong>${d.lead} working days</strong>${under ? (exc ? '  ·  exception approved' : `  ·  under ${MIN_LEAD_DAYS}: needs an approved exception`) : ''}
      </div>
      <${CheckSummary} checks=${d.checks} />
      <${ChecksList} checks=${d.checks} />
      <div class="small muted">${testMode ? 'Test mode: Submit skips the checks and lead time.' : 'Review the whole brief, then submit to Ad Ops.'}</div>
      ${me.isAdmin && html`<button class="btn btn-sm" onClick=${() => app.set({ testMode: !testMode })}>Test mode: ${testMode ? 'ON' : 'OFF'}</button>`}
    </div>
  </div>`;
}

function ChecksStrip({ d }) {
  const [open, setOpen] = useState(false);
  return html`<div class="card"><div class="card-body" style="padding:14px 20px">
    <div class="row">
      <div style="flex:1;min-width:220px"><${CheckSummary} checks=${d.checks} /></div>
      <span class="muted small">Lead time ${d.lead} WD</span>
      <button class="btn btn-sm" onClick=${() => setOpen(!open)}>${open ? 'Hide checks' : 'Show checks'}</button>
    </div>
    ${open && html`<div style="margin-top:10px"><${ChecksList} checks=${d.checks} /></div>`}
  </div></div>`;
}

// ---------------------------------------------------------------------------
function CampaignForm({ st, store, disabled }) {
  const { brands } = useStore(app);
  const { b } = st;
  const save = (f) => (v) => store.patchBrief({ [f]: v });
  const P = { disabled };

  return html`<div class="stack">
    <section class="card"><div class="card-body">
      <h2 class="section-title">Campaign basics</h2>
      <div class="grid g3">
        <${Select} label="Team" value=${b.team} options=${OPT.team} onSave=${save('team')} ...${P} />
        <${Select} label="Brand" value=${b.brand} options=${brands.map((x) => x.brand_name).sort()} ...${P}
          onSave=${(v) => {
            const br = brands.find((x) => x.brand_name === v) || {};
            return store.patchBrief({ brand: br.brand_name || null, advertiser_name: br.advertiser_name || null, advertiser: br.advertiser_id || null });
          }} />
        <${Select} label="Brief type" value=${b.brief_type} options=${OPT.briefType} onSave=${save('brief_type')} ...${P} />
        <${TextInput} label="DV360 advertiser name (auto)" value=${b.advertiser_name} readOnly />
        <${TextInput} label="DV360 advertiser ID (auto)" value=${b.advertiser} readOnly />
        <${DateInput} label="Changes start on (extension / update)" value=${b.effective_date} onSave=${save('effective_date')} ...${P} />
        <${TextInput} label="Campaign name (draft)" cls="span2" value=${b.campaign_name} onSave=${save('campaign_name')} ...${P} />
        <${TextInput} label="Geo targeting" value=${b.geo} onSave=${save('geo')} ...${P} />
      </div>
    </div></section>

    <section class="card"><div class="card-body">
      <h2 class="section-title"><span class="num">3–4</span> Flight, objective & KPI</h2>
      <div class="grid g3">
        <${DateInput} label="Launch date" value=${b.launch_date} onSave=${save('launch_date')} ...${P} />
        <${DateInput} label="End date" value=${b.end_date} onSave=${save('end_date')} ...${P} />
        <${Select} label="Objective" value=${b.objective} options=${OPT.objective} onSave=${save('objective')} ...${P} />
        <${Select} label="KPI model" value=${b.kpi_model} options=${OPT.kpiModel} onSave=${save('kpi_model')} ...${P} />
        <${NumberInput} label="KPI target (THB)" value=${b.kpi_target} onSave=${save('kpi_target')} ...${P} />
      </div>
    </div></section>

    <section class="card"><div class="card-body">
      <h2 class="section-title">Naming</h2>
      <div class="grid g2">
        <${Select} label="Product category" value=${b.category} options=${CATS.map((c) => c.name)} onSave=${save('category')} ...${P} />
        <${TextInput} label="Line / franchise" value=${b.franchise} onSave=${save('franchise')} ...${P} />
        <${TextInput} label="Campaign description" value=${b.campaign_desc} onSave=${save('campaign_desc')} ...${P} />
        <${TextInput} label="Other / PO (optional)" value=${b.campaign_other} onSave=${save('campaign_other')} ...${P} />
      </div>
      <div class="name-preview">
        <div class="label">Campaign name from the naming convention (Ad Ops confirms)</div>
        <div class="code-chip" style="margin-top:6px">${campaignName(b, brands)}</div>
      </div>
    </div></section>

    <section class="card"><div class="card-body">
      <h2 class="section-title"><span class="num">1–2</span> PO & budget</h2>
      <div class="grid g3">
        <${TextInput} label="PO number" value=${b.po_number} onSave=${save('po_number')} ...${P} />
        <${NumberInput} label="PO amount (THB)" money value=${b.po_amount} onSave=${save('po_amount')} ...${P} />
        <${NumberInput} label="Total budget incl. fee (THB)" money value=${b.total_budget} onSave=${save('total_budget')} ...${P} />
        <${TextInput} label="PO file link" cls="span-all" value=${b.po_link} onSave=${save('po_link')} ...${P} />
      </div>
    </div></section>

    <section class="card"><div class="card-body">
      <h2 class="section-title"><span class="num">8 · 11 · 12</span> Tracking, brand safety & reporting</h2>
      <div class="grid g2">
        <${TextInput} label="Tracking" cls="span-all" multiline rows=${2} hint="Floodlight / pixel / UTM / 3P tag" value=${b.tracking} onSave=${save('tracking')} ...${P} />
        <${TextInput} label="Brand safety" value=${b.brand_safety} onSave=${save('brand_safety')} ...${P} />
        <${TextInput} label="Reporting" value=${b.reporting} onSave=${save('reporting')} ...${P} />
        <${Select} label="Brand lift study?" value=${b.brand_lift} options=${OPT.yesNo} onSave=${save('brand_lift')} ...${P} />
        <div></div>
        <${TextInput} label="BLS budget, dates, questions" cls="span-all" multiline rows=${2} value=${b.bls_notes} onSave=${save('bls_notes')} ...${P} />
      </div>
    </div></section>

    <section class="card"><div class="card-body">
      <h2 class="section-title"><span class="num">9–10</span> Test & handover</h2>
      <div class="grid g2">
        <${Select} label="Is this a test?" value=${b.is_test} options=${OPT.yesNo} onSave=${save('is_test')} ...${P} />
        <${Select} label="Handover needed?" value=${b.handover_needed} options=${OPT.yesNo} onSave=${save('handover_needed')} ...${P} />
        <${TextInput} label="Test design" multiline rows=${2} hint="Test / control, variable and duration" value=${b.test_design} onSave=${save('test_design')} ...${P} />
        <${TextInput} label="Handover notes" multiline rows=${2} value=${b.handover_notes} onSave=${save('handover_notes')} ...${P} />
      </div>
    </div></section>

    <section class="card"><div class="card-body">
      <h2 class="section-title">Lead time & notes</h2>
      <div class="grid g2">
        <${Select} label="Lead-time exception?" value=${b.is_exception} options=${OPT.yesNo} onSave=${save('is_exception')} ...${P} />
        <${TextInput} label="Exception approved by" value=${b.exception_approver} onSave=${save('exception_approver')} ...${P} />
        <${TextInput} label="Notes for Ad Ops / buyer" cls="span-all" multiline rows=${5} value=${b.notes} onSave=${save('notes')} ...${P} />
      </div>
    </div></section>
  </div>`;
}

// ---------------------------------------------------------------------------
// Structure: tree on the left, editor for the selected item on the right.

const lineIssues = (l, io, G, A) => {
  const out = [];
  if (io.channel === 'YouTube') {
    if (!G.some((g) => g.io_no === l.io_no && g.line_no === l.line_no)) out.push('add at least one ad group');
  } else if (!A.some((a) => a.io_no === l.io_no && a.line_no === l.line_no)) out.push('add at least one creative');
  if ((l.start_date && io.start_date && l.start_date < io.start_date) || (l.end_date && io.end_date && l.end_date > io.end_date)) out.push('dates outside the IO flight');
  return out;
};
const ioIssues = (io, b, L) => {
  const out = [];
  const lines = L.filter((l) => l.io_no === io.io_no);
  if (round2(sum(lines, 'budget')) !== round2(io.budget)) out.push('line budgets must add up to the IO budget');
  if ((io.start_date && b.launch_date && io.start_date < b.launch_date) || (io.end_date && b.end_date && io.end_date > b.end_date)) out.push('IO dates outside the campaign flight');
  return out;
};
const agIssues = (g, A) => {
  const out = [];
  if (!A.some((a) => a.io_no === g.io_no && a.line_no === g.line_no && a.ag_no === g.ag_no)) out.push('add at least one ad');
  if (isBlank(g.audience)) out.push('audience missing');
  return out;
};
const adIssues = (a, io, li) => {
  const yt = io.channel === 'YouTube';
  const out = [];
  if (!txt(a.landing_url).startsWith('https://')) out.push('landing URL must start with https://');
  if (yt && isBlank(a.asset_url)) out.push('YouTube URL missing');
  if (yt && li.format === 'Bumper' && num(a.video_length) > 6) out.push('bumper max 6 sec');
  if (yt && li.format === 'Non-skip' && num(a.video_length) > 15) out.push('non-skip max 15 sec');
  if (yt && txt(a.cta).length > 10) out.push('CTA over 10 characters');
  if (yt && txt(a.headline).length > 15) out.push('headline over 15 characters');
  return out;
};

function Structure({ st, store, disabled }) {
  const { b, I, L, G, A } = st;
  const [sel, setSel] = useState(null); // { lvl, id }

  const ios = sortBy(I, 'io_no');
  const rec = sel && { IO: I, LI: L, AG: G, AD: A }[sel.lvl].find((r) => r.id === sel.id);
  const ioOf = (r) => I.find((x) => x.io_no === r.io_no) || {};
  const liOf = (r) => L.find((x) => x.io_no === r.io_no && x.line_no === r.line_no) || {};
  const path = { io: null, li: null, ag: null };
  if (rec) {
    path.io = sel.lvl === 'IO' ? rec : ioOf(rec);
    if (sel.lvl !== 'IO') path.li = sel.lvl === 'LI' ? rec : liOf(rec);
    if (sel.lvl === 'AG') path.ag = rec;
    if (sel.lvl === 'AD' && num(rec.ag_no) > 0) path.ag = G.find((g) => g.io_no === rec.io_no && g.line_no === rec.line_no && g.ag_no === rec.ag_no) || null;
  }

  // brAddIO / brAddLI / brAddAG / brAddAD defaults
  const addIO = async () => {
    const r = await store.addRow('brief_ios', {
      io_no: Math.max(0, ...I.map((x) => num(x.io_no))) + 1,
      channel: 'YouTube', io_type: 'Video', io_format: 'VRC',
      io_objective: ['Consideration', 'Action'].includes(b.objective) ? 'Drive_online_action_or_visits' : 'Raise_awareness_of_my_brand_or_product',
      kpi_model: 'CPM', pacing: 'Even', start_date: b.launch_date, end_date: b.end_date,
    });
    setSel({ lvl: 'IO', id: r.id });
  };
  const addLI = async (io) => {
    const yt = io.channel === 'YouTube';
    const fmts = yt ? OPT.ytFormats : OPT.otherFormats;
    const r = await store.addRow('brief_lines', {
      io_no: io.io_no,
      line_no: Math.max(0, ...L.filter((x) => x.io_no === io.io_no).map((x) => num(x.line_no))) + 1,
      // The Power App showed the IO format here but saved it blank; save what is shown.
      format: fmts.includes(io.io_format) ? io.io_format : fmts[0],
      yt_li_type: yt ? ytTypeForFormat(coalesce(io.io_format, 'VRC')) : null,
      deal_type: yt ? 'Youtube' : 'OpenEx',
      gender: 'M-W', language: 'Thai', device: 'All', environment: 'All', sustainability: 'No optimisation', service_disc: 'NO',
      start_date: io.start_date, end_date: io.end_date,
    });
    setSel({ lvl: 'LI', id: r.id });
  };
  const addAG = async (li) => {
    const r = await store.addRow('brief_ad_groups', {
      io_no: li.io_no, line_no: li.line_no,
      ag_no: Math.max(0, ...G.filter((x) => x.io_no === li.io_no && x.line_no === li.line_no).map((x) => num(x.ag_no))) + 1,
      aud_targeting: li.aud_targeting, aud_tactic: li.aud_tactic, gender: li.gender, age_min: li.age_min, age_max: li.age_max,
      language: li.language, video_ad_format: li.yt_li_type,
    });
    setSel({ lvl: 'AG', id: r.id });
  };
  const addAD = async (io, li, ag) => {
    const yt = io.channel === 'YouTube';
    const agNo = yt ? ag.ag_no : 0;
    const r = await store.addRow('brief_ads', {
      io_no: io.io_no, line_no: li.line_no, ag_no: agNo,
      ad_no: Math.max(0, ...A.filter((x) => x.io_no === io.io_no && x.line_no === li.line_no && x.ag_no === agNo).map((x) => num(x.ad_no))) + 1,
      ad_format: yt ? li.yt_li_type : null,
      skippable: ['Non-skip', 'Bumper'].includes(li.format) ? 'unskip' : ['Display', 'Native'].includes(li.format) ? 'display' : 'skip',
      cta_code: 'SHOP-NOW', ad_buying_type: 'Programmatic', rotation: 'optimized', redirect: "L'Oréal D2C",
    });
    setSel({ lvl: 'AD', id: r.id });
  };

  const node = (lvl, r, label, amt, issues, depth) => html`<div
      class=${`tree-node${sel && sel.lvl === lvl && sel.id === r.id ? ' sel' : ''}`} style=${`padding-left:${12 + depth * 18}px`}
      role="treeitem" tabindex="0" onClick=${() => setSel({ lvl, id: r.id })}
      onKeyDown=${(e) => { if (e.key === 'Enter') setSel({ lvl, id: r.id }); }}>
      <span class=${`lvl ${lvl === 'AD' && num(r.ag_no) === 0 ? 'CR' : lvl}`}>${lvl === 'AD' && num(r.ag_no) === 0 ? 'CR' : lvl}</span>
      <span class="t">${label}</span>
      ${issues.length ? html`<span class="warn" title=${issues.join('; ')}>✗</span>` : amt && html`<span class="amt">${amt}</span>`}
    </div>`;
  const add = (label, fn, depth) => !disabled && html`<button class="tree-add" style=${`padding-left:${16 + depth * 18}px`} onClick=${fn}>+ ${label}</button>`;

  return html`<div class="split-tree">
    <div class="tree-pane">
      <div class="tree-head"><strong>Structure</strong><span class="spacer"></span>
        <span class="small muted">IOs THB ${fmtInt(coalesce(sum(I, 'budget'), 0))} of ${fmtInt(coalesce(b.total_budget, 0))}</span></div>
      <div role="tree" class="tree">
        ${ios.map((io) => html`
          ${node('IO', io, `IO ${txt(io.io_no)} · ${txt(io.io_type)}${io.io_format ? ' · ' + io.io_format : ''}`, `THB ${fmtInt(io.budget)}`, ioIssues(io, b, L), 0)}
          ${path.io && path.io.id === io.id && html`
            ${sortBy(L.filter((l) => l.io_no === io.io_no), 'line_no').map((li) => html`
              ${node('LI', li, `${txt(io.io_no)}.${txt(li.line_no)} · ${txt(li.format)}`, `THB ${fmtInt(li.budget)}`, lineIssues(li, io, G, A), 1)}
              ${path.li && path.li.id === li.id && (io.channel === 'YouTube'
                ? html`${sortBy(G.filter((g) => g.io_no === io.io_no && g.line_no === li.line_no), 'ag_no').map((ag) => html`
                    ${node('AG', ag, `${txt(io.io_no)}.${txt(li.line_no)}.${txt(ag.ag_no)} · ${coalesce(ag.audience, 'no audience')}`, null, agIssues(ag, A), 2)}
                    ${path.ag && path.ag.id === ag.id && html`
                      ${sortBy(A.filter((a) => a.io_no === io.io_no && a.line_no === li.line_no && a.ag_no === ag.ag_no), 'ad_no').map((a) =>
                        node('AD', a, `#${txt(a.ad_no)}${a.ad_format ? ' · ' + a.ad_format : ''}${num(a.video_length) > 0 ? ` · ${txt(a.video_length)}s` : ''}`, null, adIssues(a, io, li), 3))}
                      ${add('Add ad', () => addAD(io, li, ag), 3)}`}`)}
                    ${add('Add ad group', () => addAG(li), 2)}`
                : html`${sortBy(A.filter((a) => a.io_no === io.io_no && a.line_no === li.line_no && num(a.ag_no) === 0), 'ad_no').map((a) =>
                    node('AD', a, `#${txt(a.ad_no)}${a.creative_size ? ' · ' + a.creative_size : a.ad_format ? ' · ' + a.ad_format : ''}`, null, adIssues(a, io, li), 2))}
                    ${add('Add creative', () => addAD(io, li, null), 2)}`)}`)}
            ${add('Add line item', () => addLI(io), 1)}`}`)}
        ${add('Add insertion order', addIO, 0)}
        ${ios.length === 0 && disabled && html`<div class="empty small">No insertion orders.</div>`}
      </div>
    </div>
    <div class="editor">
      ${!rec ? html`<div class="empty">
          <div class="big">${ios.length ? 'Select an item to edit it' : 'Start with an insertion order'}</div>
          <div>IO → line items → ${'ad groups (YouTube) → ads, or creatives for other channels'}.</div>
          ${!disabled && ios.length === 0 && html`<div style="margin-top:16px"><button class="btn btn-dark" onClick=${addIO}>+ Add insertion order</button></div>`}
        </div>`
      : sel.lvl === 'IO' ? html`<${IOEditor} key=${rec.id} st=${st} store=${store} io=${rec} disabled=${disabled} onDeleted=${() => setSel(null)} />`
      : sel.lvl === 'LI' ? html`<${LIEditor} key=${rec.id} st=${st} store=${store} li=${rec} io=${path.io} disabled=${disabled} onDeleted=${() => setSel({ lvl: 'IO', id: path.io.id })} />`
      : sel.lvl === 'AG' ? html`<${AGEditor} key=${rec.id} st=${st} store=${store} ag=${rec} li=${path.li} io=${path.io} disabled=${disabled} onDeleted=${() => setSel({ lvl: 'LI', id: path.li.id })} />`
      : html`<${ADEditor} key=${rec.id} st=${st} store=${store} ad=${rec} li=${path.li} io=${path.io} disabled=${disabled}
          onDeleted=${() => setSel(path.ag ? { lvl: 'AG', id: path.ag.id } : { lvl: 'LI', id: path.li.id })} />`}
    </div>
  </div>`;
}

const EditorHead = ({ lvl, title, sub, onDelete, disabled, deleteLabel }) => html`<div class="editor-head">
  <span class=${`lvl ${lvl}`}>${lvl}</span>
  <div style="flex:1;min-width:0"><h2>${title}</h2>${sub && html`<div class="muted small" style="margin-top:4px">${sub}</div>`}</div>
  ${!disabled && html`<${ConfirmButton} cls="btn btn-sm btn-danger" label=${html`<${Icon} name="trash" /> ${deleteLabel}`} onConfirm=${onDelete} />`}
</div>`;

const NamePreview = ({ label, name }) => html`<div class="name-preview"><div class="label">${label}</div><div class="code-chip" style="margin-top:6px">${name}</div></div>`;
const Issues = ({ list }) => list.length > 0 && html`<ul class="issues">${list.map((x) => html`<li>${x}</li>`)}</ul>`;

function IOEditor({ st, store, io, disabled, onDeleted }) {
  const { brands } = useStore(app);
  const { b, L, G, A } = st;
  const yt = io.channel === 'YouTube';
  const save = (f) => (v) => store.patchRow('brief_ios', io.id, { [f]: v });
  const P = { disabled };
  const lines = L.filter((l) => l.io_no === io.io_no);
  const n = io.io_no;

  // brIOChannel: switching channel resets formats and removes ads that no longer fit.
  const setChannel = async (v) => {
    const toYt = v === 'YouTube';
    const lose = toYt
      ? A.filter((a) => a.io_no === n && num(a.ag_no) === 0).length
      : A.filter((a) => a.io_no === n && num(a.ag_no) !== 0).length + G.filter((g) => g.io_no === n).length;
    if (lose > 0 && !window.confirm(`Switching to ${v} removes ${lose} ${toYt ? 'creatives' : 'ad groups and ads'} under this IO. Continue?`)) return;
    await store.patchRow('brief_ios', io.id, { channel: v, io_type: toYt ? 'Video' : 'Display', io_format: toYt ? 'VRC' : 'Display' });
    await store.updateWhere('brief_lines', (l) => l.io_no === n, { format: toYt ? 'VRC' : 'Display' });
    if (toYt) await store.removeWhere('brief_ads', (a) => a.io_no === n && num(a.ag_no) === 0);
    else {
      await store.removeWhere('brief_ads', (a) => a.io_no === n && num(a.ag_no) !== 0);
      await store.removeWhere('brief_ad_groups', (g) => g.io_no === n);
    }
  };
  // brIOFormat: on YouTube the line items follow the IO format.
  const setFormat = async (f) => {
    await store.patchRow('brief_ios', io.id, { io_format: f });
    if (yt) await store.updateWhere('brief_lines', (l) => l.io_no === n, { format: f, yt_li_type: ytTypeForFormat(f) });
  };
  const del = async () => {
    await store.removeWhere('brief_ads', (a) => a.io_no === n);
    await store.removeWhere('brief_ad_groups', (g) => g.io_no === n);
    await store.removeWhere('brief_lines', (l) => l.io_no === n);
    await store.removeRow('brief_ios', io.id);
    onDeleted();
  };
  const fmtOpts = yt ? OPT.ytFormats : OPT.otherFormats;
  const fmtVal = fmtOpts.includes(io.io_format) ? io.io_format : yt ? 'VRC' : 'Display';
  const typeVal = OPT.ioType.includes(io.io_type) ? io.io_type : yt ? 'Video' : 'Display';

  return html`<div>
    <${EditorHead} lvl="IO" title=${`Insertion order ${txt(n)}`} disabled=${disabled} deleteLabel="Delete IO" onDelete=${del}
      sub=${`${lines.length} line items  ·  THB ${fmtInt(coalesce(sum(lines, 'budget'), 0))} of THB ${fmtInt(io.budget)}`} />
    <${Issues} list=${ioIssues(io, b, L)} />
    <div class="grid g4" style="margin-top:14px">
      <${Select} label="Channel" value=${io.channel} options=${OPT.channel} onSave=${setChannel} ...${P} />
      <${Select} label="IO type" value=${typeVal} options=${OPT.ioType} onSave=${save('io_type')} ...${P} />
      <${Select} label="Ad format (for naming)" value=${fmtVal} options=${fmtOpts} onSave=${setFormat} ...${P} />
      <${Select} label="Pacing" value=${io.pacing} options=${OPT.pacing} onSave=${save('pacing')} ...${P} />
      <${NumberInput} label="Budget incl. fee (THB)" money value=${io.budget} onSave=${save('budget')} ...${P} />
      <${DateInput} label="Start" value=${io.start_date} onSave=${save('start_date')} ...${P} />
      <${DateInput} label="End" value=${io.end_date} onSave=${save('end_date')} ...${P} />
      <${Select} label="Buying type" value=${io.buying_type} options=${OPT.buyingType} onSave=${save('buying_type')} ...${P} />
      <${TextInput} label="Deal ID (PG / PMP)" value=${io.deal_id} onSave=${save('deal_id')} ...${P} />
      <${Select} label="KPI model" value=${io.kpi_model} options=${OPT.ioKpi} onSave=${save('kpi_model')} ...${P} />
      <${NumberInput} label="KPI target" value=${io.kpi_target} onSave=${save('kpi_target')} ...${P} />
      <${TextInput} label="Verification (IAS / DV)" value=${io.verification} onSave=${save('verification')} ...${P} />
    </div>
    <h3 class="section-title" style="margin-top:24px">Frequency & budget segment</h3>
    <div class="grid g4">
      <${NumberInput} label="Freq cap: exposures" value=${io.freq_exposures} onSave=${save('freq_exposures')} ...${P} />
      <${Select} label="Per" value=${io.freq_period} options=${OPT.freqPeriod} onSave=${save('freq_period')} ...${P} />
      <${TextInput} label="Frequency cap (notes)" cls="span2" value=${io.freq_cap} onSave=${save('freq_cap')} ...${P} />
      <${DateInput} label="This brief: segment start" value=${io.segment_start} onSave=${save('segment_start')} ...${P} />
      <${DateInput} label="Segment end" value=${io.segment_end} onSave=${save('segment_end')} ...${P} />
      <${NumberInput} label="Already booked before (THB)" money value=${io.prior_budget} onSave=${save('prior_budget')} ...${P} />
      <${Field} label="IO lifetime"><div class="input" style="display:flex;align-items:center;background:var(--surface-2)">THB ${fmtMoney2(num(io.prior_budget) + num(io.budget))}</div><//>
    </div>
    <h3 class="section-title" style="margin-top:24px">Naming</h3>
    <div class="grid g2">
      <${Select} label="Campaign objective (naming)" value=${coalesce(io.io_objective, 'Raise_awareness_of_my_brand_or_product')} options=${OBJS.map((o) => o.name)} onSave=${save('io_objective')} ...${P} />
      <${TextInput} label="Other / PO including (optional)" value=${io.io_other} onSave=${save('io_other')} ...${P} />
    </div>
    <${NamePreview} label="IO name from the naming convention" name=${ioName(b, io, brands)} />
  </div>`;
}

function LIEditor({ st, store, li, io, disabled, onDeleted }) {
  const { G, A } = st;
  const yt = io.channel === 'YouTube';
  const save = (f) => (v) => store.patchRow('brief_lines', li.id, { [f]: v });
  const P = { disabled };
  const fmtOpts = yt ? OPT.ytFormats : OPT.otherFormats;
  const fmtVal = fmtOpts.includes(li.format) ? li.format : yt ? 'VRC' : 'Display';
  const del = async () => {
    await store.removeWhere('brief_ads', (a) => a.io_no === io.io_no && a.line_no === li.line_no);
    await store.removeWhere('brief_ad_groups', (g) => g.io_no === io.io_no && g.line_no === li.line_no);
    await store.removeRow('brief_lines', li.id);
    onDeleted();
  };
  const nG = G.filter((g) => g.io_no === io.io_no && g.line_no === li.line_no).length;
  const nA = A.filter((a) => a.io_no === io.io_no && a.line_no === li.line_no).length;

  return html`<div>
    <${EditorHead} lvl="LI" title=${`Line item ${txt(io.io_no)}.${txt(li.line_no)}`} disabled=${disabled} deleteLabel="Delete line" onDelete=${del}
      sub=${yt ? `${nG} ad groups  ·  ${nA} ads` : `${nA} creatives`} />
    <${Issues} list=${lineIssues(li, io, G, A)} />
    <div class="grid g4" style="margin-top:14px">
      <${Select} label="Format" value=${fmtVal} options=${fmtOpts} ...${P}
        onSave=${(v) => store.patchRow('brief_lines', li.id, { format: v, yt_li_type: yt ? ytTypeForFormat(v) : li.yt_li_type })} />
      <${TextInput} label="Inventory / exchange" value=${li.inventory} onSave=${save('inventory')} ...${P} />
      <${NumberInput} label="Budget incl. fee (THB)" money value=${li.budget} onSave=${save('budget')} ...${P} />
      <${Select} label="Bid strategy" value=${li.bid_strategy} options=${OPT.bidStrategy} onSave=${save('bid_strategy')} ...${P} />
      <${DateInput} label="Start" value=${li.start_date} onSave=${save('start_date')} ...${P} />
      <${DateInput} label="End" value=${li.end_date} onSave=${save('end_date')} ...${P} />
      <${NumberInput} label="Bid / target (THB)" value=${li.bid_target} onSave=${save('bid_target')} ...${P} />
    </div>
    ${yt
      ? html`<div class="callout" style="margin-top:16px">YouTube: audience descriptions are set per ad group.</div>`
      : html`<div class="grid g2" style="margin-top:16px">
          <${TextInput} label="Targeting: audience, demographics, geo" multiline rows=${2} value=${li.audience} onSave=${save('audience')} ...${P} />
          <${TextInput} label="Exclusions" multiline rows=${2} value=${li.exclusions} onSave=${save('exclusions')} ...${P} />
        </div>`}
    <h3 class="section-title" style="margin-top:24px">Naming</h3>
    <div class="grid g4">
      <${Select} label="Deal type" value=${li.deal_type} options=${OPT.dealType} onSave=${save('deal_type')} ...${P} />
      ${yt && html`<${Select} label="YouTube LI type" value=${li.yt_li_type} options=${OPT.ytLiType} onSave=${save('yt_li_type')} ...${P} />`}
      <${Select} label="Audience targeting" cls="span2" value=${li.aud_targeting} options=${AUDS.map((x) => x.name)} onSave=${save('aud_targeting')} ...${P} />
      <${TextInput} label="Tactic / similar aud. details" value=${li.aud_tactic} onSave=${save('aud_tactic')} ...${P} />
      <${Select} label="Gender" value=${li.gender} options=${OPT.gender} onSave=${save('gender')} ...${P} />
      <${NumberInput} label="Age min" value=${li.age_min} onSave=${save('age_min')} ...${P} />
      <${NumberInput} label="Age max" value=${li.age_max} onSave=${save('age_max')} ...${P} />
      <${Select} label="Language" value=${li.language} options=${LANGS.map((x) => x.name)} onSave=${save('language')} ...${P} />
      <${Select} label="Device" value=${li.device} options=${DEVICES.map((x) => x.name)} onSave=${save('device')} ...${P} />
      <${Select} label="Environment" value=${li.environment} options=${OPT.environment} onSave=${save('environment')} ...${P} />
      <${TextInput} label="Dimensions / other (opt.)" value=${li.dims} onSave=${save('dims')} ...${P} />
      <${Select} label="Sustainability" cls="span2" value=${li.sustainability} options=${SUST.map((x) => x.name)} onSave=${save('sustainability')} ...${P} />
      <${Select} label="Service discov." value=${li.service_disc} options=${OPT.serviceDisc} onSave=${save('service_disc')} ...${P} />
      <${TextInput} label="Publisher name" value=${li.publisher_name} onSave=${save('publisher_name')} ...${P} />
    </div>
    <${NamePreview} label="Line item name from the naming convention" name=${lineItemName(li)} />
  </div>`;
}

function AGEditor({ st, store, ag, li, io, disabled, onDeleted }) {
  const { A } = st;
  const save = (f) => (v) => store.patchRow('brief_ad_groups', ag.id, { [f]: v });
  const P = { disabled };
  const del = async () => {
    await store.removeWhere('brief_ads', (a) => a.io_no === io.io_no && a.line_no === li.line_no && a.ag_no === ag.ag_no);
    await store.removeRow('brief_ad_groups', ag.id);
    onDeleted();
  };
  const n = A.filter((a) => a.io_no === io.io_no && a.line_no === li.line_no && a.ag_no === ag.ag_no).length;
  return html`<div>
    <${EditorHead} lvl="AG" title=${`Ad group ${txt(io.io_no)}.${txt(li.line_no)}.${txt(ag.ag_no)}`} disabled=${disabled} deleteLabel="Delete ad group" onDelete=${del}
      sub=${`Line item ${txt(io.io_no)}.${txt(li.line_no)} · ${txt(li.format)} · THB ${fmtInt(coalesce(li.budget, 0))}  ·  ${n} ads`} />
    <${Issues} list=${agIssues(ag, A)} />
    <div class="grid g3" style="margin-top:14px">
      <${TextInput} label="5 · Audience (affinity / in-market / 1P / custom)" multiline rows=${3} value=${ag.audience} onSave=${save('audience')} ...${P} />
      <${TextInput} label="Demographics (gender, age, parental)" multiline rows=${3} value=${ag.demographics} onSave=${save('demographics')} ...${P} />
      <${TextInput} label="Notes" multiline rows=${3} value=${ag.notes} onSave=${save('notes')} ...${P} />
    </div>
    <h3 class="section-title" style="margin-top:24px">Naming</h3>
    <div class="grid g4">
      <${Select} label="Audience targeting" cls="span2" value=${ag.aud_targeting} options=${AUDS.map((x) => x.name)} onSave=${save('aud_targeting')} ...${P} />
      <${TextInput} label="Tactic" value=${ag.aud_tactic} onSave=${save('aud_tactic')} ...${P} />
      <${Select} label="Gender" value=${ag.gender} options=${OPT.gender} onSave=${save('gender')} ...${P} />
      <${NumberInput} label="Age min" value=${ag.age_min} onSave=${save('age_min')} ...${P} />
      <${NumberInput} label="Age max" value=${ag.age_max} onSave=${save('age_max')} ...${P} />
      <${Select} label="Language" value=${ag.language} options=${LANGS.map((x) => x.name)} onSave=${save('language')} ...${P} />
      <${Select} label="Video ad format" value=${ag.video_ad_format} options=${OPT.ytLiType} onSave=${save('video_ad_format')} ...${P} />
      <${TextInput} label="Other" value=${ag.ag_other} onSave=${save('ag_other')} ...${P} />
    </div>
    <${NamePreview} label="Ad group name from the naming convention" name=${adGroupName(ag)} />
  </div>`;
}

function ADEditor({ store, ad, li, io, disabled, onDeleted }) {
  const yt = io.channel === 'YouTube';
  const save = (f) => (v) => store.patchRow('brief_ads', ad.id, { [f]: v });
  const P = { disabled };
  const isCr = num(ad.ag_no) === 0;
  const del = async () => { await store.removeRow('brief_ads', ad.id); onDeleted(); };
  return html`<div>
    <${EditorHead} lvl=${isCr ? 'CR' : 'AD'} disabled=${disabled} deleteLabel=${isCr ? 'Delete creative' : 'Delete ad'} onDelete=${del}
      title=${isCr ? `Creative ${txt(io.io_no)}.${txt(li.line_no)} #${txt(ad.ad_no)}` : `Ad ${txt(io.io_no)}.${txt(li.line_no)}.${txt(ad.ag_no)} #${txt(ad.ad_no)}`}
      sub=${`Line item ${txt(io.io_no)}.${txt(li.line_no)} · ${txt(li.format)}`} />
    <${Issues} list=${adIssues(ad, io, li)} />
    <div class="grid g4" style="margin-top:14px">
      <${TextInput} label="Ad / creative name" cls="span2" mono value=${ad.ad_name} onSave=${save('ad_name')} ...${P} />
      ${yt
        ? html`<${NumberInput} label="Length (sec)" value=${ad.video_length} onSave=${save('video_length')} ...${P} />`
        : html`<${TextInput} label="Size / format" value=${ad.creative_size} onSave=${save('creative_size')} ...${P} />`}
      <div></div>
      <${TextInput} label=${yt ? 'YouTube video URL' : 'Creative file / asset link'} cls="span2" value=${ad.asset_url} onSave=${save('asset_url')} ...${P} />
      <${TextInput} label="7 · Landing URL (https://)" cls="span2" value=${ad.landing_url} onSave=${save('landing_url')} ...${P} />
      ${yt ? html`
        <${TextInput} label="Display URL" value=${ad.display_url} onSave=${save('display_url')} ...${P} />
        <${TextInput} label="CTA (max 10)" value=${ad.cta} onSave=${save('cta')} ...${P} />
        <${TextInput} label="Headline (max 15)" value=${ad.headline} onSave=${save('headline')} ...${P} />
        <${TextInput} label="Description" value=${ad.description} onSave=${save('description')} ...${P} />`
      : html`<${TextInput} label="Notes / 3P tag" cls="span-all" multiline rows=${2} value=${ad.description} onSave=${save('description')} ...${P} />`}
    </div>
    <h3 class="section-title" style="margin-top:24px">Naming</h3>
    <div class="grid g4">
      <${TextInput} label="Asset description" value=${ad.asset_desc} onSave=${save('asset_desc')} ...${P} />
      <${Select} label="Asset source" value=${ad.asset_source} options=${OPT.assetSource} onSave=${save('asset_source')} ...${P} />
      <${Select} label="Format" value=${ad.ad_format} options=${adFormatOptions(io.channel, io.io_type)} onSave=${save('ad_format')} ...${P} />
      <${Select} label="CTA" value=${ad.cta_code} options=${OPT.ctaCode} onSave=${save('cta_code')} ...${P} />
      <${Select} label="Skippable" value=${ad.skippable} options=${OPT.skippable} onSave=${save('skippable')} ...${P} />
      <${Select} label="Buying type" value=${ad.ad_buying_type} options=${OPT.adBuyingType} onSave=${save('ad_buying_type')} ...${P} />
      <${Select} label="Rotation" value=${ad.rotation} options=${OPT.rotation} onSave=${save('rotation')} ...${P} />
      <${Select} label="Redirection to" value=${ad.redirect} options=${OPT.redirect} onSave=${save('redirect')} ...${P} />
      <${TextInput} label="E-retailer / other name" value=${ad.retailer} onSave=${save('retailer')} ...${P} />
      <${TextInput} label="Other (opt.)" value=${ad.ad_other} onSave=${save('ad_other')} ...${P} />
    </div>
    <${NamePreview} label="Ad name from the naming convention" name=${adName(ad)} />
  </div>`;
}
