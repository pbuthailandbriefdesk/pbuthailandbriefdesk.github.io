// scrAdOps: taxonomy, actions and DV360 IDs, then hand over to the Gate.
import { useState } from 'preact/hooks';
import { adOpsDone, doneToast } from '../data/actions.js';
import { app, toast, useBrief, useCrumbs, useStore } from '../data/store.js';
import { AO_TURNAROUND_HOURS, OPT } from '../lib/constants.js';
import { actionCounts, adOpsDoneError, fillBlankNames, matchPastedIds } from '../lib/adops.js';
import { campaignName } from '../lib/naming.js';
import { needsFix } from '../lib/tree.js';
import { coalesce, fmtDate, fmtTs, isBlank, num, singleLine, txt } from '../lib/util.js';
import { briefPath, go } from '../router.js';
import { ActionButton, ErrorBox, Field, html, Loading, PageHead, Select, TextInput } from '../ui/ui.js';
import { BriefSummary, briefCrumbs, useDerived } from './common.js';
import { loadBriefs } from './home.js';

export function AdOps({ route }) {
  const [st, store] = useBrief(route.briefId);
  const { brands, me } = useStore(app);
  const d = useDerived(st);
  const [todo, setTodo] = useState(false);
  const [paste, setPaste] = useState('');
  useCrumbs(briefCrumbs(st.b, 'Ad Ops taxonomy'));

  if (st.loading) return html`<${Loading} />`;
  if (st.error) return html`<${ErrorBox} msg=${st.error} />`;
  const { b, I, L, G, A } = st;
  const ext = ['Extension', 'Update'].includes(b.brief_type);
  const sugCamp = campaignName(b, brands);
  const rows = todo ? d.rows.filter(needsFix) : d.rows;
  const c = actionCounts(I, L, G, A);
  const hours = isBlank(b.sent_to_ao_at) ? null : Math.floor(((Date.now() - new Date(b.sent_to_ao_at)) / 36e5) * 10) / 10;
  const canWork = b.status === 'With Ad Ops' && me.isAdOps;

  const patch = (r, p) => store.patchRow(r.table, r.rec.id, p);

  const fill = async () => {
    const { ups, taxonomy } = fillBlankNames(b, I, L, G, A, brands);
    await store.patchRows(ups);
    if (taxonomy) await store.patchBrief({ campaign_taxonomy: taxonomy });
    toast('Blank names filled from the naming convention. Check any part shown as x.', 'success');
  };
  const match = async () => {
    const m = matchPastedIds(paste, b, I, L, G, A);
    await store.patchRows(m.ups);
    if (m.campaignId) await store.patchBrief({ dv360_campaign_id: m.campaignId });
    const n = m.ups.length + (m.campaignId ? 1 : 0);
    toast(`${m.pastedCount} pasted lines matched a name here. Filled ${n} DV360 IDs (IO ${m.counts.io} · LI ${m.counts.li} · AG ${m.counts.ag} · ad ${m.counts.ad}${m.campaignId ? ' · campaign' : ''}). Rows that already had an ID were left alone.`, n > 0 ? 'success' : 'warning');
    setPaste('');
  };
  const done = async () => {
    // aoCamp shows Coalesce(CampaignTaxonomy, CampaignName); the hand-over saves what it shows.
    const campaignText = coalesce(b.campaign_taxonomy, b.campaign_name);
    const err = adOpsDoneError(b, campaignText, I, L, G, A);
    if (err) { if (err.todo) setTodo(true); toast(err.msg, 'error'); return; }
    const mail = await adOpsDone(store, campaignText);
    doneToast('Sent to the Gate', mail);
    await loadBriefs();
    go('#/');
  };

  return html`<div class="page">
    <${PageHead} eyebrow=${b.brief_id} title="Ad Ops taxonomy"
      sub="Every level needs a name, an action, and a DV360 ID for anything that already exists.">
      <a class="btn" href=${briefPath(b.brief_id)}>Brief summary</a>
    <//>
    ${!canWork && html`<div class="callout warn" style="margin-bottom:18px">This brief is <strong>${b.status}</strong>${me.isAdOps ? '' : ' and you are not in Ad Ops'}. You can look, but hand-over is only for briefs with Ad Ops.</div>`}

    <div class="split aside-first">
      <div class="stack">
        <${BriefSummary} st=${st} />

        <div class="card"><div class="card-body">
          <h2 class="section-title">Campaign name (L'Oréal taxonomy)</h2>
          <${TextInput} mono value=${coalesce(b.campaign_taxonomy, b.campaign_name)} onSave=${(v) => store.patchBrief({ campaign_taxonomy: v })} />
          <div class="sug">Suggested: <code class="code-chip">${sugCamp}</code>
            ${sugCamp !== b.campaign_taxonomy && html`<button class="btn btn-sm" onClick=${() => store.patchBrief({ campaign_taxonomy: sugCamp })}>Use</button>`}</div>
        </div></div>

        <div class="card">
          <div class="card-head">
            <h3>Names, actions & DV360 IDs</h3>
            <div class="right">
              <span class="small muted">${rows.length} of ${d.rows.length} rows</span>
              <button class="btn btn-sm" onClick=${() => setTodo(!todo)}>${todo ? 'Show all rows' : 'Show only rows to fix'}</button>
            </div>
          </div>
          ${rows.length === 0 ? html`<div class="empty">${todo ? 'Nothing left to fix.' : 'No structure in this brief.'}</div>` : html`
          <div class="ao-list">${rows.map((r) => html`<div class=${`ao-item ${r.lvl}${needsFix(r) ? ' fix' : ''}`} key=${r.table + r.rec.id}
              style=${`padding-left:${16 + r.indent * 20}px`}>
            <div class="ao-label">
              <span class=${`lvl ${r.lvl === 'AD' && num(r.ag_no) === 0 ? 'CR' : r.lvl}`}>${r.lvl === 'AD' && num(r.ag_no) === 0 ? 'CR' : r.lvl}</span>
              <span>${singleLine(r.label)}</span>
            </div>
            <div class="ao-controls">
              <div class="field"><label>Name</label>
                <${TextInput} mono value=${r.nm} onSave=${(v) => patch(r, { [r.nameField]: v })} />
                ${r.sug !== r.nm && html`<div class="sug"><span class="faint">Suggested</span> <code>${r.sug}</code>
                  <button class="btn btn-sm" onClick=${() => patch(r, { [r.nameField]: r.sug })}>Use</button></div>`}
              </div>
              <div class="field"><label>Action</label><${Select} value=${r.act} options=${OPT.action} onSave=${(v) => patch(r, { action: v })} /></div>
              <div class="field"><label>DV360 ID</label><${TextInput} mono value=${r.dvId}
                placeholder=${['Update', 'Pause', 'No change'].includes(r.act) ? 'Required' : ''} onSave=${(v) => patch(r, { dv360_id: v })} /></div>
            </div>
          </div>`)}</div>`}
        </div>
      </div>

      <aside>
        <div class="card">
          <div class="card-head"><h3>Hand over to the Gate</h3></div>
          <div class="card-body stack" style="gap:14px">
            <div class="small">
              <div>Sent to Ad Ops <strong>${fmtTs(b.sent_to_ao_at)}</strong></div>
              ${hours !== null && html`<div class=${hours > AO_TURNAROUND_HOURS ? 'strong' : 'muted'} style=${hours > AO_TURNAROUND_HOURS ? 'color:var(--danger)' : ''}>${hours} h ago (target ${AO_TURNAROUND_HOURS} h)</div>`}
              ${num(b.taxonomy_fixes) > 0 && html`<div class="callout err" style="margin-top:8px">Returned by the Gate ${txt(b.taxonomy_fixes)}×: ${txt(b.gate_gaps)}</div>`}
            </div>
            <div class="small">Brief type: <strong>${coalesce(b.brief_type, 'New')}</strong>${ext ? `  ·  changes start ${fmtDate(b.effective_date)}` : ''}${b.brand_lift === 'Yes' ? '  ·  Brand lift ON' : ''}</div>
            <${TextInput} label=${`DV360 campaign ID${ext ? ' (required: existing campaign)' : ' (after you create it)'}`} mono
              value=${b.dv360_campaign_id} onSave=${(v) => store.patchBrief({ dv360_campaign_id: v })} />
            <div class="small">
              <div class="label" style="margin-bottom:6px">Actions</div>
              ${c.New} new  ·  ${c.Update} update  ·  ${c.Pause} pause  ·
              <span class=${c.notSet ? 'strong' : ''} style=${c.notSet ? 'color:var(--danger)' : ''}>${c.notSet} not set</span>  ·
              <span class=${c.missingId ? 'strong' : ''} style=${c.missingId ? 'color:var(--danger)' : ''}>${c.missingId} missing DV360 ID</span>
            </div>
            <${ActionButton} cls="btn" onClick=${fill}>Fill blank names with suggestions<//>
            <div class="small muted">Names come from the planner inputs (x = missing). On a new brief, blank actions become New.</div>
            <${ActionButton} cls="btn btn-primary btn-lg btn-arrow" disabled=${!canWork} onClick=${done}>Taxonomy done → Gate<//>
            <div class="small muted">Needs names, an action on every row, and DV360 IDs for anything that already exists.</div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Paste DV360 IDs</h3></div>
          <div class="card-body stack" style="gap:10px">
            <${Field} hint="One entity per line, name and ID (copy the table from DV360 or an SDF export).">
              <textarea class="textarea mono" rows="6" value=${paste} onInput=${(e) => setPaste(e.currentTarget.value)}
                placeholder=${'name<TAB>1234567\nname 1234567'}></textarea>
            <//>
            <${ActionButton} cls="btn btn-dark" disabled=${!paste.trim()} onClick=${match}>Match IDs by name<//>
          </div>
        </div>
      </aside>
    </div>
  </div>`;
}
