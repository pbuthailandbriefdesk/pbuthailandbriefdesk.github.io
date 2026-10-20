// P2P QA: upload the DV360 SDF export, compare it with the brief, then Pass (→ Set up) or Fail (→ Buyer).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { doneToast, qaDecision } from '../data/actions.js';
import { app, db, toast, useBrief, useCrumbs, useStore } from '../data/store.js';
import { decide, runQa } from '../lib/qa.js';
import { readSdfFiles } from '../lib/sdfparse.js';
import { fmtTs } from '../lib/util.js';
import { briefPath, go } from '../router.js';
import { ActionButton, ErrorBox, html, Icon, Loading, PageHead } from '../ui/ui.js';
import { BriefSummary, briefCrumbs } from './common.js';
import { loadBriefs } from './home.js';

const ICON = { PASS: '🟢', FAIL: '🔴', REVIEW: '🟡', REMINDER: 'ℹ️' };
const RISK_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function Qa({ route }) {
  const [st, store] = useBrief(route.briefId);
  const { me } = useStore(app);
  const [sdf, setSdf] = useState(null);
  const [accepted, setAccepted] = useState(new Set());
  const [ticked, setTicked] = useState(new Set());
  const [filter, setFilter] = useState('issues');
  const [note, setNote] = useState('');
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  useCrumbs(briefCrumbs(st.b, 'P2P QA'));

  useEffect(() => {
    db().list('qa_runs', { eq: { brief_id: route.briefId }, order: ['id', 'desc'] }).then(setRuns).catch(() => setRuns([]));
  }, [route.briefId, st.b?.qa_done_at]);

  const result = useMemo(() => (st.b && sdf ? runQa(st.b, st.I, st.L, st.G, st.A, sdf) : null), [st, sdf]);

  if (st.loading) return html`<${Loading} />`;
  if (st.error) return html`<${ErrorBox} msg=${st.error} />`;
  const { b } = st;
  const canWork = b.status === 'In QA' && me.isQA;

  const upload = async (e) => {
    const input = e.currentTarget; // currentTarget is gone after the first await
    const files = [...input.files];
    if (!files.length) return;
    setBusy(true);
    try {
      const s = await readSdfFiles(files);
      if (!s.files.length) { toast('No SDF files found. Upload the CSV files (or a zip) downloaded from DV360.', 'error'); return; }
      setSdf(s); setAccepted(new Set()); setTicked(new Set()); setFilter('issues');
      if (s.skipped.length) toast(`Skipped (not SDF): ${s.skipped.join(', ')}`, 'warning');
    } catch (ex) { toast(ex.message, 'error'); } finally { setBusy(false); input.value = ''; }
  };

  const decision = result ? decide(result.findings, accepted, ticked, result.manual) : null;
  const overall = !result ? null : result.counts.fail ? 'FAIL' : decision === 'READY TO LAUNCH' ? 'PASS' : 'REVIEW';
  const toggle = (set, setter, k) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); setter(n); };
  const indexed = result ? result.findings.map((f, i) => ({ ...f, i })) : [];
  const shown = indexed
    .filter((f) => filter === 'all' || (filter === 'issues' ? f.status !== 'PASS' : f.status === filter))
    .sort((x, y) => (x.status === 'FAIL' ? 0 : 1) - (y.status === 'FAIL' ? 0 : 1) || RISK_ORDER[x.risk] - RISK_ORDER[y.risk]);
  const blockers = indexed.filter((f) => f.status === 'FAIL' && ['Critical', 'High'].includes(f.risk));

  const save = async (pass) => {
    const run = {
      decision, counts: result.counts, findings: result.findings,
      manual: result.manual.map((m) => ({ ...m, ticked: ticked.has(m.key) })),
      files: sdf.files.map((f) => f.name).join(', '), note: note.trim() || null,
    };
    const mail = await qaDecision(store, pass, run);
    doneToast(pass ? 'QA passed. The campaign is marked set up.' : 'QA failed. Sent back to the Buyer with the findings.', mail);
    await loadBriefs();
    go(briefPath(b.brief_id, 'detail'));
  };

  return html`<div class="page">
    <${PageHead} eyebrow=${b.brief_id} title="P2P QA" sub="Compare the DV360 set-up with the brief before launch. The brief is the source of truth; nothing is changed in DV360.">
      <a class="btn" href=${briefPath(b.brief_id)}>Brief summary</a>
    <//>
    ${!canWork && html`<div class="callout warn" style="margin-bottom:18px">This brief is <strong>${b.status}</strong>${me.isQA ? '' : ' and your role is not QA'}. You can run the comparison, but Pass / Fail is only for briefs in P2P QA.</div>`}

    <div class="split">
      <div class="stack">
        <${BriefSummary} st=${st} />

        <div class="card"><div class="card-body stack" style="gap:12px">
          <h2 class="section-title">1 · Upload the DV360 export</h2>
          <div class="small muted">In DV360: advertiser ${b.advertiser_name || ''} → Campaign → select the campaign → Download → Structured data file (SDF), all file types. Upload the CSV files or the zip as it is.</div>
          <label class="btn btn-dark" style="align-self:flex-start;cursor:pointer">
            <${Icon} name="file" />${busy ? 'Reading…' : sdf ? 'Upload a different export' : 'Choose SDF files (.csv or .zip)'}
            <input type="file" multiple accept=".csv,.zip" style="display:none" onChange=${upload} />
          </label>
          ${sdf && html`<div class="small">${sdf.files.map((f) => html`<span class="code-chip" style="margin:0 6px 6px 0">${f.name} · ${f.kind} · ${f.rows} rows</span>`)}</div>`}
        </div></div>

        ${result && html`
        <div class="card"><div class="card-body">
          <h2 class="section-title">2 · Executive QA summary</h2>
          <div class="qa-summary">
            <div class=${`qa-overall ${overall}`}><span>${ICON[overall]}</span><div><div class="label">Overall</div><strong>${overall}</strong></div></div>
            <div><div class="label">Decision</div><strong class=${`qa-decision ${decision === 'READY TO LAUNCH' ? 'ok' : decision === 'NOT READY TO LAUNCH' ? 'bad' : 'mid'}`}>${decision}</strong></div>
            <div><div class="label">Campaign type</div>${result.type}</div>
            <div><div class="label">Checks</div>🟢 ${result.counts.pass} · 🔴 ${result.counts.fail} · 🟡 ${result.counts.review} · ℹ️ ${result.counts.reminder}</div>
            <div><div class="label">Critical / high fails</div>${result.counts.critical} / ${result.counts.high}</div>
          </div>
          ${blockers.length > 0 && html`<div class="callout err" style="margin-top:14px"><strong>Priority blockers before go-live</strong>
            <ul style="margin:6px 0 0;padding-left:18px">${blockers.map((f) => html`<li>${f.risk} · ${f.scope} · ${f.entity}: ${f.parameter}. ${f.reason}</li>`)}</ul></div>`}
        </div></div>

        <div class="card">
          <div class="card-head"><h3>3 · QA results</h3>
            <div class="right seg">${[['issues', 'Issues'], ['FAIL', 'Fail'], ['REVIEW', 'Review'], ['REMINDER', 'Manual'], ['PASS', 'Pass'], ['all', 'All']].map(([k, l]) =>
              html`<button class=${filter === k ? 'on' : ''} onClick=${() => setFilter(k)}>${l}</button>`)}</div></div>
          <div class="table-wrap" style="border:none"><table class="table qa-table">
            <thead><tr><th style="width:90px">Status</th><th>Item</th><th>Brief</th><th>DV360</th><th style="width:80px">Risk</th><th style="width:96px">Confirm</th></tr></thead>
            <tbody>
              ${shown.length === 0 && html`<tr><td colspan="6" class="empty">Nothing in this view.</td></tr>`}
              ${shown.map((f) => html`<tr class=${`qa-${f.status}`}>
                <td class="nowrap strong q-status">${ICON[f.status]} ${f.status}</td>
                <td class="q-item"><div class="strong">${f.parameter}</div><div class="sub">${f.scope} · <span class="mono">${f.entity}</span></div>
                  <div class="sub">${f.reason}${f.action ? ` → ${f.action}` : ''}</div></td>
                <td class="mono small qa-val q-brief" data-label="Brief">${String(f.planned ?? '–')}</td>
                <td class="mono small qa-val q-dv" data-label="DV360">${String(f.actual ?? '–')}</td>
                <td class="small q-risk">${f.risk}</td>
                <td class="q-confirm">${(f.status === 'REVIEW' || f.status === 'REMINDER') && html`<label class="small row" style="gap:6px">
                  <input type="checkbox" disabled=${!canWork} checked=${accepted.has(f.i)} onChange=${() => toggle(accepted, setAccepted, f.i)} />Checked</label>`}</td>
              </tr>`)}
            </tbody>
          </table></div>
        </div>

        <div class="card"><div class="card-body">
          <h2 class="section-title">4 · Manual QA in DV360</h2>
          <div class="small muted" style="margin-bottom:10px">Not in the SDF export. Check each in DV360 and tick it.</div>
          <ul class="checks">${result.manual.map((m) => html`<li class=${ticked.has(m.key) ? 'ok' : 'bad'} style="grid-template-columns:24px 1fr">
            <input type="checkbox" disabled=${!canWork} checked=${ticked.has(m.key)} onChange=${() => toggle(ticked, setTicked, m.key)} style="width:18px;height:18px;margin-top:2px" />
            <div><div class="item">${m.item}</div><div class="small muted">Where: ${m.where}</div></div>
          </li>`)}</ul>
        </div></div>`}

        ${runs.length > 0 && html`<div class="card">
          <div class="card-head"><h3>Previous QA runs</h3></div>
          <div class="card-body"><ul class="timeline">${runs.map((r) => html`<li>
            <div class="when">${fmtTs(r.at, 'dd mmm yy hh:mm')} · ${r.by_email}</div>
            <div class="what">${r.result === 'Pass' ? '🟢 Pass' : '🔴 Fail'} · ${r.decision || ''}</div>
            <div class="detail">${r.counts ? `${r.counts.fail} fail · ${r.counts.review} review · ${r.counts.reminder} manual` : ''}${r.files ? `  ·  ${r.files}` : ''}${r.note ? `\n${r.note}` : ''}</div>
          </li>`)}</ul></div>
        </div>`}
      </div>

      <aside>
        <div class="card">
          <div class="card-head"><h3>Final decision</h3></div>
          <div class="card-body stack" style="gap:12px">
            ${!result ? html`<div class="small muted">Upload the DV360 export to run the comparison.</div>` : html`
              <div class=${`callout ${decision === 'READY TO LAUNCH' ? 'ok' : decision === 'NOT READY TO LAUNCH' ? 'err' : 'warn'}`}>
                <strong>${decision}</strong><br />
                ${decision === 'NOT READY TO LAUNCH' ? `${result.counts.fail} checks failed. Fail it back to the Buyer.`
                  : decision === 'READY WITH REVIEW' ? 'No failures. Confirm every Review / Manual item to pass.' : 'Everything matches or is confirmed.'}
              </div>`}
            <div class="field"><label for="qa-note">Note for the Buyer (optional)</label>
              <textarea id="qa-note" class="textarea" rows="3" disabled=${!canWork} value=${note} onInput=${(e) => setNote(e.currentTarget.value)}></textarea></div>
            <${ActionButton} cls="btn btn-primary btn-lg btn-arrow" disabled=${!canWork || !result || decision !== 'READY TO LAUNCH'} onClick=${() => save(true)}>Pass · mark set up<//>
            <${ActionButton} cls="btn btn-danger" disabled=${!canWork || !result} onClick=${() => save(false)}>Fail · back to Buyer<//>
            <div class="small muted">Pass is only possible with no failures and every Review / Manual item confirmed.</div>
          </div>
        </div>
      </aside>
    </div>
  </div>`;
}
