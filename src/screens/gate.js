// scrGate: the Brief Gate review.
import { useState } from 'preact/hooks';
import { doneToast, gatePass, gateReturnAdOps, gateReturnPlanner } from '../data/actions.js';
import { app, useBrief, useCrumbs, useStore } from '../data/store.js';
import { coalesce, isBlank, num, singleLine, txt } from '../lib/util.js';
import { briefPath, go } from '../router.js';
import { ActionButton, ChecksList, CheckSummary, ErrorBox, html, Loading, PageHead } from '../ui/ui.js';
import { BriefSummary, briefCrumbs, useDerived } from './common.js';
import { loadBriefs } from './home.js';

export function Gate({ route }) {
  const [st, store] = useBrief(route.briefId);
  const { me } = useStore(app);
  const d = useDerived(st);
  const [gaps, setGaps] = useState('');
  useCrumbs(briefCrumbs(st.b, 'Gate review'));

  if (st.loading) return html`<${Loading} />`;
  if (st.error) return html`<${ErrorBox} msg=${st.error} />`;
  const { b } = st;
  const canWork = b.status === 'With Gatekeeper' && me.isGate;

  const finish = async (fn, msg) => {
    const mail = await fn();
    doneToast(msg, mail);
    await loadBriefs();
    go('#/');
  };

  return html`<div class="page">
    <${PageHead} eyebrow=${b.brief_id} title="Brief Gate"
      sub="Check the structure against the 14 items, then lock the brief or send it back.">
      <a class="btn" href=${briefPath(b.brief_id)}>Brief summary</a>
    <//>
    ${!canWork && html`<div class="callout warn" style="margin-bottom:18px">This brief is <strong>${b.status}</strong>${me.isGate ? '' : ' and your role cannot run the Gate'}. The Gate decisions are switched off.</div>`}

    <div class="split aside-first">
      <div class="stack">
        <${BriefSummary} st=${st} extra=${html`<div class="small" style="margin-top:12px">
          <span class="label">Taxonomy </span><span class="mono">${coalesce(b.campaign_taxonomy, '–')}</span>
          <span class="muted">  ·  Lead time ${txt(b.lead_time_wd)} working days${b.is_exception === 'Yes' ? ` (exception: ${txt(b.exception_approver)})` : ''}</span></div>`} />

        <div class="card">
          <div class="card-head"><h3>Structure</h3><span class="muted small">${d.rows.length} rows</span></div>
          ${d.rows.length === 0 ? html`<div class="empty">No structure.</div>` : html`<div class="otree" style="border:none">
            ${d.rows.map((r) => {
              const badge = r.lvl === 'AD' && num(r.ag_no) === 0 ? 'CR' : r.lvl;
              return html`<div class=${`orow l${r.indent} ${r.lvl}`} style="grid-template-columns:34px minmax(0,1fr)">
                <span class=${`lvl ${badge}`}>${badge}</span>
                <div style="min-width:0">
                  <div class="lbl">${singleLine(r.label)}</div>
                  <div class="meta"><span class="label">Name </span><span class="mono">${coalesce(r.nm, '–')}</span>${isBlank(r.dvId) ? '' : html`   ·   DV360 ID <span class="mono">${r.dvId}</span>`}   ·   ${singleLine(r.detail)}</div>
                </div>
              </div>`;
            })}
          </div>`}
        </div>
      </div>

      <aside>
        <div class="card">
          <div class="card-head"><h3>14-item check</h3></div>
          <div class="card-body stack" style="gap:12px">
            <${CheckSummary} checks=${d.checks} />
            <${ChecksList} checks=${d.checks} />
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Decision</h3></div>
          <div class="card-body stack" style="gap:12px">
            <div class="field"><label for="gaps">Gaps (for a return)</label>
              <textarea id="gaps" class="textarea" rows="4" value=${gaps} disabled=${!canWork}
                placeholder="What is missing or wrong?" onInput=${(e) => setGaps(e.currentTarget.value)}></textarea></div>
            <${ActionButton} cls="btn btn-primary btn-lg btn-arrow" disabled=${!canWork}
              onClick=${() => finish(() => gatePass(store), 'Locked. SLA clock started.')}>Pass and lock<//>
            <div class="row">
              <${ActionButton} cls="btn" disabled=${!canWork}
                onClick=${() => finish(() => gateReturnPlanner(store, gaps), 'Returned to the planner')}>Return to planner<//>
              <${ActionButton} cls="btn" disabled=${!canWork}
                onClick=${() => finish(() => gateReturnAdOps(store, gaps), 'Returned to Ad Ops')}>Return to Ad Ops<//>
            </div>
            ${d.open > 0 && html`<div class="callout warn small">${d.open} checks are open. You can still pass if you have confirmed them yourself.</div>`}
          </div>
        </div>
      </aside>
    </div>
  </div>`;
}
