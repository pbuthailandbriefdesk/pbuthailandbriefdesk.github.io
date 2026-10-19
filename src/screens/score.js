// Scorecards: Planners, Ad Ops and Buyers side by side, filtered by year, month,
// advertiser and planner team. Planner and Ad Ops measures count briefs by submit
// date (as in the Power App); Buyer measures count briefs by the date they were locked.
import { useEffect, useState } from 'preact/hooks';
import { app, useCrumbs, useStore } from '../data/store.js';
import { AO_TURNAROUND_HOURS, BUYER_PICKUP_HOURS, BUYER_SETUP_HOURS } from '../lib/constants.js';
import { bkkParts, isBlank, num, todayBkk, tsToBkkDate } from '../lib/util.js';
import { html, Loading, PageHead } from '../ui/ui.js';
import { loadBriefs } from './home.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const hours = (a, b) => (isBlank(a) || isBlank(b) ? null : (new Date(b) - new Date(a)) / 36e5);
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const share = (n, d) => (d === 0 ? null : n / d);
const pct = (v) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const hrs = (v) => (v === null ? '–' : v < 10 ? `${v.toFixed(1)} h` : `${Math.round(v)} h`);
const goLive = (b) => (['Extension', 'Update'].includes(b.brief_type) && !isBlank(b.effective_date) ? b.effective_date : b.launch_date);

export function Score() {
  const { briefs } = useStore(app);
  const now = bkkParts();
  const [year, setYear] = useState(String(now.y));
  const [month, setMonth] = useState('all');
  const [adv, setAdv] = useState('all');
  const [team, setTeam] = useState('All');
  useCrumbs([{ label: 'Insights' }, { label: 'Scorecards' }]);
  useEffect(() => { loadBriefs(); }, []);
  if (!briefs) return html`<${Loading} />`;

  const live = briefs.filter((b) => b.status !== 'Cancelled');
  const years = [...new Set([String(now.y), ...live.flatMap((b) => [b.submitted_at, b.locked_at]).filter(Boolean).map((t) => tsToBkkDate(t).slice(0, 4))])].sort().reverse();
  const brands = [...new Set(live.map((b) => b.brand).filter(Boolean))].sort();

  const inPeriod = (ts) => {
    if (isBlank(ts)) return false;
    const d = tsToBkkDate(ts);
    return d.slice(0, 4) === year && (month === 'all' || Number(d.slice(5, 7)) === Number(month));
  };
  const scoped = live.filter((b) => (adv === 'all' || b.brand === adv) && (team === 'All' || b.team === team));
  const submitted = scoped.filter((b) => inPeriod(b.submitted_at));
  const locked = scoped.filter((b) => inPeriod(b.locked_at));

  // ---- Planners
  const pf = submitted.filter((b) => !isBlank(b.passed_first_time));
  const planners = [
    { t: 'Pass the Gate first time', v: share(pf.filter((b) => b.passed_first_time === 'Yes').length, pf.length), fmt: pct, target: '≥ 80%', ok: (v) => v >= 0.8 },
    { t: 'Average revisions after Lock', v: submitted.length ? avg(submitted.map((b) => num(b.revisions_major))) : null, fmt: (v) => (v === null ? '–' : v.toFixed(1)), target: '≤ 1', ok: (v) => v <= 1 },
    { t: 'Briefed under 1 working day', v: share(submitted.filter((b) => num(b.lead_time_wd) < 1).length, submitted.length), fmt: pct, target: '≤ 2%', ok: (v) => v <= 0.02 },
    { t: 'Resubmitted after submit', v: submitted.length ? submitted.reduce((s, b) => s + num(b.resubmits), 0) : null, fmt: (v) => (v === null ? '–' : String(v)), target: '0', ok: (v) => v === 0 },
    { t: 'Briefs without a PO', v: submitted.length ? submitted.filter((b) => isBlank(b.po_number)).length : null, fmt: (v) => (v === null ? '–' : String(v)), target: '0', ok: (v) => v === 0 },
  ];

  // ---- Ad Ops
  const tx = submitted.filter((b) => !isBlank(b.taxonomy_done_at));
  const txHours = tx.map((b) => hours(b.sent_to_ao_at, b.taxonomy_done_at)).filter((x) => x !== null);
  const adops = [
    { t: 'Taxonomy on time', v: share(txHours.filter((h) => h <= AO_TURNAROUND_HOURS).length, txHours.length), fmt: pct, target: `≥ 95% within ${AO_TURNAROUND_HOURS} h`, ok: (v) => v >= 0.95 },
    { t: 'Taxonomy right first time', v: share(tx.filter((b) => num(b.taxonomy_fixes) === 0).length, tx.length), fmt: pct, target: '≥ 95%', ok: (v) => v >= 0.95 },
    { t: 'Average taxonomy time', v: avg(txHours), fmt: hrs, target: `≤ ${AO_TURNAROUND_HOURS} h`, ok: (v) => v <= AO_TURNAROUND_HOURS },
    { t: 'Naming fixes after launch', v: submitted.length ? submitted.reduce((s, b) => s + num(b.post_launch_naming_fixes), 0) : null, fmt: (v) => (v === null ? '–' : String(v)), target: '0', ok: (v) => v === 0 },
  ];

  // ---- Buyers
  const accepted = locked.filter((b) => !isBlank(b.buyer_accepted_at));
  const pickup = accepted.map((b) => hours(b.locked_at, b.buyer_accepted_at)).filter((x) => x !== null);
  const setUp = locked.filter((b) => !isBlank(b.setup_done_at));
  const setupHours = setUp.map((b) => hours(b.locked_at, b.setup_done_at)).filter((x) => x !== null);
  const onTime = setUp.filter((b) => !isBlank(goLive(b)) && tsToBkkDate(b.setup_done_at) <= goLive(b));
  const today = todayBkk();
  const overdue = scoped.filter((b) => ['Locked', 'In set-up'].includes(b.status) && !isBlank(goLive(b)) && goLive(b) < today);
  const buyers = [
    { t: `Picked up within ${BUYER_PICKUP_HOURS} h of Lock`, v: share(pickup.filter((h) => h <= BUYER_PICKUP_HOURS).length, pickup.length), fmt: pct, target: '≥ 90%', ok: (v) => v >= 0.9 },
    { t: 'Set up on or before go-live', v: share(onTime.length, setUp.length), fmt: pct, target: '≥ 95%', ok: (v) => v >= 0.95,
      note: setUp.length ? `${setUp.length - onTime.length} set up late` : null },
    { t: 'Average Lock → set up', v: avg(setupHours), fmt: hrs, target: `≤ ${BUYER_SETUP_HOURS} h`, ok: (v) => v <= BUYER_SETUP_HOURS },
    { t: 'Overdue now (past go-live, not set up)', v: overdue.length, fmt: (v) => String(v), target: '0', ok: (v) => v === 0, live: true,
      note: overdue.length ? overdue.map((b) => b.brief_id).slice(0, 3).join(', ') + (overdue.length > 3 ? '…' : '') : null },
  ];

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const groups = [
    { key: 'Planners', base: `${plural(submitted.length, 'brief', 'briefs')} submitted`, items: planners },
    { key: 'Ad Ops', base: `${plural(tx.length, 'taxonomy', 'taxonomies')} done`, items: adops },
    { key: 'Buyers', base: `${plural(locked.length, 'brief', 'briefs')} locked · ${setUp.length} set up`, items: buyers },
  ].map((g) => {
    const scored = g.items.filter((i) => i.v !== null);
    const met = scored.filter((i) => i.ok(i.v)).length;
    return { ...g, met, scored: scored.length, score: scored.length ? met / scored.length : null };
  });

  // Average hours per stage, for briefs that got that far in the period.
  const stage = (rows, a, b) => avg(rows.map((r) => hours(r[a], r[b])).filter((x) => x !== null && x >= 0));
  const stages = [
    { k: 'With Ad Ops', who: 'Ad Ops', v: stage(submitted, 'sent_to_ao_at', 'taxonomy_done_at') },
    { k: 'At the Gate', who: 'Gate', v: stage(submitted, 'taxonomy_done_at', 'gate_replied_at') },
    { k: 'Waiting for a buyer', who: 'Buyers', v: stage(locked, 'locked_at', 'buyer_accepted_at') },
    { k: 'In set-up', who: 'Buyers', v: stage(locked, 'buyer_accepted_at', 'setup_done_at') },
  ];
  const maxStage = Math.max(1, ...stages.map((s) => s.v || 0));
  const period = `${month === 'all' ? '' : MONTHS[Number(month) - 1] + ' '}${year}`;

  return html`<div class="page">
    <${PageHead} eyebrow="Scorecards" title=${`How the desk did in ${period}`}
      sub="Measured to track trends together, not to single anyone out." />

    <div class="card filters" style="margin-bottom:22px"><div class="card-body">
      <div class="grid g4">
        <div class="field"><label for="f-year">Year</label>
          <select id="f-year" class="select" value=${year} onChange=${(e) => setYear(e.currentTarget.value)}>
            ${years.map((y) => html`<option value=${y}>${y}</option>`)}</select></div>
        <div class="field"><label for="f-month">Month</label>
          <select id="f-month" class="select" value=${month} onChange=${(e) => setMonth(e.currentTarget.value)}>
            <option value="all">Whole year</option>
            ${MONTHS.map((m, i) => html`<option value=${i + 1}>${m}</option>`)}</select></div>
        <div class="field"><label for="f-adv">Advertiser</label>
          <select id="f-adv" class="select" value=${adv} onChange=${(e) => setAdv(e.currentTarget.value)}>
            <option value="all">All advertisers</option>
            ${brands.map((b) => html`<option value=${b}>${b}</option>`)}</select></div>
        <div class="field"><label>Planner team</label>
          <div class="seg">${[['All', 'All (CPD + Non-CPD)'], ['CPD', 'CPD'], ['Non-CPD', 'Non-CPD']].map(([v, l]) =>
            html`<button class=${team === v ? 'on' : ''} onClick=${() => setTeam(v)}>${l}</button>`)}</div></div>
      </div>
    </div></div>

    <div class="grid g3 score-summary" style="margin-bottom:22px">
      ${groups.map((g) => html`<div class=${`role-score ${g.score === null ? 'none' : g.score >= 0.75 ? 'good' : g.score >= 0.5 ? 'mid' : 'bad'}`}>
        <div class="k">${g.key}</div>
        <div class="v">${g.score === null ? '–' : `${g.met}/${g.scored}`}<span>${g.score === null ? 'no data' : 'on target'}</span></div>
        <div class="bar"><i style=${`width:${g.score === null ? 0 : Math.round(g.score * 100)}%`}></i></div>
        <div class="n">${g.base}</div>
      </div>`)}
    </div>

    <div class="grid g3 score-cols" style="margin-bottom:22px;align-items:start">
      ${groups.map((g) => html`<section class="card">
        <div class="card-head"><h3>${g.key}</h3><span class="right muted small">${g.base}</span></div>
        <ul class="metrics">
          ${g.items.map((i) => {
            const st = i.v === null ? 'none' : i.ok(i.v) ? 'met' : 'missed';
            return html`<li class=${st}>
              <div class="mt">${i.t}${i.live && html` <span class="live-tag">now</span>`}</div>
              <div class="mv">${i.fmt(i.v)}</div>
              <div class="mtarget">${st === 'none' ? 'No data' : st === 'met' ? '✓ On target' : '✗ Off target'} · Target ${i.target}</div>
              ${i.note && html`<div class="mnote">${i.note}</div>`}
            </li>`;
          })}
        </ul>
      </section>`)}
    </div>

    <section class="card">
      <div class="card-head"><h3>Where the time goes</h3><span class="right muted small">Average hours a brief spends at each stage</span></div>
      <div class="card-body stack" style="gap:12px">
        ${stages.map((s) => html`<div class="stage-row">
          <div class="sk">${s.k}<span class="muted small"> · ${s.who}</span></div>
          <div class="sbar"><i class=${s.who === 'Buyers' ? 'b' : s.who === 'Gate' ? 'g' : 'a'} style=${`width:${s.v === null ? 0 : Math.max(2, (s.v / maxStage) * 100)}%`}></i></div>
          <div class="sv">${hrs(s.v)}</div>
        </div>`)}
        <div class="small muted">Planner time is not shown here: lead time is scored in working days above.</div>
      </div>
    </section>
  </div>`;
}
