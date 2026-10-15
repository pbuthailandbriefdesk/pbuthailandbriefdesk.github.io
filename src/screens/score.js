// scrScore: monthly planner and Ad Ops scorecards (by submit date).
import { useEffect, useState } from 'preact/hooks';
import { app, useCrumbs, useStore } from '../data/store.js';
import { AO_TURNAROUND_HOURS } from '../lib/constants.js';
import { bkkParts, isBlank, num, tsToBkkDate } from '../lib/util.js';
import { html, Loading, PageHead } from '../ui/ui.js';
import { loadBriefs } from './home.js';

const months = () => {
  const p = bkkParts();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(p.y, p.m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};
const pct = (a, b) => (b === 0 ? null : a / b);
const fmtPct = (v) => (v === null ? '–' : `${Math.round(v * 100)}%`);

function Card({ title, value, target, met, note }) {
  const cls = value === '–' ? 'none' : met ? 'met' : 'missed';
  return html`<div class=${`score-card ${cls}`}>
    <div class="t">${title}</div>
    <div class="v">${value}</div>
    <div class="target">${value === '–' ? 'No data this month' : met ? '✓ On target' : '✗ Off target'}  ·  ${target}</div>
    ${note && html`<div class="small muted">${note}</div>`}
  </div>`;
}

export function Score() {
  const { briefs } = useStore(app);
  const [month, setMonth] = useState(months()[0]);
  const [team, setTeam] = useState('All');
  useCrumbs([{ label: 'Insights' }, { label: 'Scorecards' }]);
  useEffect(() => { loadBriefs(); }, []);
  if (!briefs) return html`<${Loading} />`;

  const inMonth = briefs.filter((b) => !isBlank(b.submitted_at) && tsToBkkDate(b.submitted_at).slice(0, 7) === month && b.status !== 'Cancelled');
  const rows = inMonth.filter((b) => team === 'All' || b.team === team);

  const pf = rows.filter((b) => !isBlank(b.passed_first_time));
  const passFirst = pct(pf.filter((b) => b.passed_first_time === 'Yes').length, pf.length);
  const avgRev = rows.length ? rows.reduce((s, b) => s + num(b.revisions_major), 0) / rows.length : null;
  const under1 = pct(rows.filter((b) => num(b.lead_time_wd) < 1).length, rows.length);
  const resub = rows.reduce((s, b) => s + num(b.resubmits), 0);
  const noPo = rows.filter((b) => isBlank(b.po_number)).length;
  const tx = rows.filter((b) => !isBlank(b.taxonomy_done_at));
  const onTime = pct(tx.filter((b) => (new Date(b.taxonomy_done_at) - new Date(b.sent_to_ao_at)) / 60000 <= AO_TURNAROUND_HOURS * 60).length, tx.length);
  const rightFirst = pct(tx.filter((b) => num(b.taxonomy_fixes) === 0).length, tx.length);
  const namingFixes = rows.reduce((s, b) => s + num(b.post_launch_naming_fixes), 0);
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return html`<div class="page">
    <${PageHead} eyebrow="Scorecards" title=${`${rows.length} briefs submitted in ${label}`}
      sub="Measured to track trends together, not to single anyone out.">
      <div class="row">
        <div class="field"><label for="m">Month (by submit date)</label>
          <select id="m" class="select" value=${month} onChange=${(e) => setMonth(e.currentTarget.value)}>
            ${months().map((m) => html`<option value=${m}>${m}</option>`)}</select></div>
        <div class="field"><label>Planner team</label>
          <div class="seg">${['All', 'CPD', 'Non-CPD'].map((t) => html`<button class=${team === t ? 'on' : ''} onClick=${() => setTeam(t)}>${t}</button>`)}</div></div>
      </div>
    <//>

    <h2 class="subheading">Planners</h2>
    <div class="grid g3" style="margin-bottom:28px">
      <${Card} title="Pass the Gate first time" value=${fmtPct(passFirst)} target="Target ≥ 80%" met=${passFirst !== null && passFirst >= 0.8} />
      <${Card} title="Average revisions after Lock" value=${avgRev === null ? '–' : avgRev.toFixed(1)} target="Target ≤ 1" met=${avgRev !== null && avgRev <= 1} />
      <${Card} title="Briefed under 1 working day" value=${fmtPct(under1)} target="Target ≤ 2%" met=${under1 !== null && under1 <= 0.02} />
      <${Card} title="Resubmitted after submit" value=${String(resub)} target="Target 0" met=${resub === 0} />
      <${Card} title="Briefs without a PO" value=${String(noPo)} target="Target 0" met=${noPo === 0} />
    </div>

    <h2 class="subheading">Ad Ops</h2>
    <div class="grid g3">
      <${Card} title="Taxonomy on time" value=${fmtPct(onTime)} target="Target ≥ 95%" met=${onTime !== null && onTime >= 0.95}
        note=${`On time = done within ${AO_TURNAROUND_HOURS} hours of reaching Ad Ops.`} />
      <${Card} title="Taxonomy right first time" value=${fmtPct(rightFirst)} target="Target ≥ 95%" met=${rightFirst !== null && rightFirst >= 0.95} />
      <${Card} title="Naming fixes after launch" value=${String(namingFixes)} target="Target 0" met=${namingFixes === 0} />
    </div>
  </div>`;
}
