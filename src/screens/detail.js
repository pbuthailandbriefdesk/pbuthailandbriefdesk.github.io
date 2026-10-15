// scrDetail: history and set-up actions (accept, set up, take over, change requests, cancel).
import { useState } from 'preact/hooks';
import {
  acceptSetup, deleteOrCancel, doneToast, logChange, logNamingFix, markSetUp, takeOver,
} from '../data/actions.js';
import { app, useBrief, useCrumbs, useStore } from '../data/store.js';
import { LOCKED_STATUSES, OPT } from '../lib/constants.js';
import { coalesce, fmtTs, isBlank, num } from '../lib/util.js';
import { briefPath, go } from '../router.js';
import { ActionButton, ConfirmButton, ErrorBox, html, Loading, PageHead, Select } from '../ui/ui.js';
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
    accept: b.status === 'Locked' && me.isGate,
    setUp: b.status === 'In set-up' && (b.buyer_email?.toLowerCase() === me.email || me.role === 'Admin'),
    takeOver: b.status === 'In set-up' && me.isGate && b.buyer_email?.toLowerCase() !== me.email && me.role !== 'Admin',
    change: locked && mine,
    namingFix: b.status === 'Set up' && (me.isGate || me.isAdOps),
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
            ${show.setUp && html`<${ActionButton} cls="btn btn-primary btn-lg btn-arrow" onClick=${() => markSetUp(store)}>Mark as set up in DV360<//>`}
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

            ${show.cancel && html`<div style="border-top:1px solid var(--rule);padding-top:14px">
              <${ConfirmButton} label=${isBlank(b.submitted_at) ? 'Delete draft' : 'Cancel brief'}
                onConfirm=${async () => { await deleteOrCancel(store); await loadBriefs(); go('#/'); }} />
            </div>`}
          </div>
        </div>
      </aside>
    </div>
  </div>`;
}
