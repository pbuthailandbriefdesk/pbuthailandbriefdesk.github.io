// Workflow actions. Each one makes the same record changes, history event and
// notification as the matching button in the Power App (reference/powerapp-src).
import { addDays, diffDays, isBlank, newBriefId, nowIso } from '../lib/util.js';
import { app, db, notify, teamEmails, toast } from './store.js';

const me = () => app.get().me;

// scrHome.hmNew
export async function createBrief() {
  const m = me();
  const deskRow = app.get().team.find((t) => t.email.toLowerCase() === m.email);
  const b = await db().insert('briefs', {
    brief_id: newBriefId(),
    brief_version: 1,
    status: 'Draft',
    planner_email: m.email,
    planner_name: m.name,
    team: ['CPD', 'Non-CPD'].includes(deskRow?.team) ? deskRow.team : 'Non-CPD',
    brand_safety: 'Standard',
    reporting: 'Standard',
    is_test: 'No',
    handover_needed: 'No',
    is_exception: 'No',
    gate_attempts: 0,
    revisions_major: 0,
    revisions_minor: 0,
    taxonomy_fixes: 0,
    post_launch_naming_fixes: 0,
  });
  await db().insert('brief_events', { brief_id: b.brief_id, event: 'Created', by_email: m.email, at: nowIso(), detail: '' });
  return b;
}

// Duplicate brief (new, not in the Power App): copy the campaign set-up and the whole
// IO → line → ad group → ad structure into a new Draft owned by the current user.
// Workflow, PO, DV360 IDs and Ad Ops actions are not copied. With a new launch date every
// date moves by the same number of days; without one the dates are left blank.
const BRIEF_SKIP = new Set([
  'id', 'brief_id', 'brief_version', 'status', 'planner_email', 'planner_name', 'created_at', 'modified_at', 'sp_legacy',
  'po_number', 'po_amount', 'po_link', 'lead_time_wd', 'is_exception', 'exception_approver', 'campaign_taxonomy', 'dv360_campaign_id',
  'ad_ops_email', 'buyer_email', 'buyer_name', 'gatekeeper_email', 'gate_result', 'gate_gaps', 'gate_attempts', 'passed_first_time',
  'revisions_major', 'revisions_minor', 'taxonomy_fixes', 'post_launch_naming_fixes', 'resubmits', 'submitted_at', 'sent_to_ao_at',
  'taxonomy_done_at', 'gate_replied_at', 'locked_at', 'buyer_accepted_at', 'setup_done_at',
  'qa_result', 'qa_requested_at', 'qa_done_at', 'qa_email', 'qa_attempts', 'qa_passed_first_time',
]);
const CHILD_SKIP = new Set(['id', 'brief_id', 'created_at', 'modified_at', 'sp_legacy', 'dv360_id', 'action']);
const DATE_FIELDS = ['launch_date', 'end_date', 'effective_date', 'start_date', 'segment_start', 'segment_end'];

export async function duplicateBrief(src, newLaunch) {
  const m = me();
  const shift = !isBlank(newLaunch) && !isBlank(src.b.launch_date) ? diffDays(src.b.launch_date, newLaunch) : null;
  const moveDates = (row) => {
    const out = { ...row };
    for (const f of DATE_FIELDS) {
      if (!(f in out) || isBlank(out[f])) continue;
      out[f] = shift === null ? null : addDays(out[f], shift);
    }
    return out;
  };
  const copy = (row, skip) => moveDates(Object.fromEntries(Object.entries(row).filter(([k]) => !skip.has(k))));

  const b = await db().insert('briefs', {
    ...copy(src.b, BRIEF_SKIP),
    ...(shift === null && !isBlank(newLaunch) ? { launch_date: newLaunch } : {}),
    brief_id: newBriefId(),
    brief_version: 1,
    status: 'Draft',
    planner_email: m.email,
    planner_name: m.name,
    is_exception: 'No',
    gate_attempts: 0, revisions_major: 0, revisions_minor: 0, taxonomy_fixes: 0, post_launch_naming_fixes: 0,
  });
  for (const [table, rows] of [['brief_ios', src.I], ['brief_lines', src.L], ['brief_ad_groups', src.G], ['brief_ads', src.A]]) {
    for (const r of rows) await db().insert(table, { ...copy(r, CHILD_SKIP), brief_id: b.brief_id });
  }
  await db().insert('brief_events', {
    brief_id: b.brief_id, event: 'Created', by_email: m.email, at: nowIso(),
    detail: `Duplicated from ${src.b.brief_id}${shift === null ? ' (dates left blank)' : `, dates moved ${shift >= 0 ? '+' : ''}${shift} days`}`,
  });
  return b;
}

// AI fill (new): write the normalised plan from lib/aibrief.js into the open brief.
// mode 'replace' removes the current structure first; 'add' appends the new IOs after it.
export async function applyAiPlan(store, plan, mode) {
  const { I } = store.get();
  if (Object.keys(plan.brief).length) await store.patchBrief(plan.brief);
  let offset = 0;
  if (mode === 'replace') {
    await store.removeWhere('brief_ads', () => true);
    await store.removeWhere('brief_ad_groups', () => true);
    await store.removeWhere('brief_lines', () => true);
    await store.removeWhere('brief_ios', () => true);
  } else {
    offset = Math.max(0, ...I.map((x) => Number(x.io_no) || 0));
  }
  const shift = (r) => ({ ...r, io_no: r.io_no + offset });
  for (const r of plan.ios) await store.addRow('brief_ios', shift(r));
  for (const r of plan.lines) await store.addRow('brief_lines', shift(r));
  for (const r of plan.groups) await store.addRow('brief_ad_groups', shift(r));
  for (const r of plan.ads) await store.addRow('brief_ads', shift(r));
  await store.event('Filled with AI', `${Object.keys(plan.brief).length} campaign fields · ${plan.ios.length} IO · ${plan.lines.length} line items · ${plan.groups.length} ad groups · ${plan.ads.length} ads${mode === 'replace' ? ' (structure replaced)' : ''}`);
}

// scrDetail.dtCancel / scrBrief.brDelete: delete a never-submitted draft, otherwise cancel.
export async function deleteOrCancel(store) {
  const { b } = store.get();
  if (isBlank(b.submitted_at)) {
    await db().removeWhere('briefs', { brief_id: b.brief_id }); // children cascade
    toast('Draft deleted', 'success');
  } else {
    await store.patchBrief({ status: 'Cancelled' });
    await store.event('Brief cancelled');
    toast('Brief cancelled', 'success');
  }
}

// scrReview.rvSubmit
export async function submitBrief(store, leadWD, testMode, openCount) {
  const { b } = store.get();
  const wasResubmit = b.status === 'Draft' && !isBlank(b.submitted_at);
  const nb = await store.patchBrief({
    status: 'With Ad Ops',
    submitted_at: nowIso(),
    sent_to_ao_at: nowIso(),
    lead_time_wd: leadWD,
    gate_gaps: '',
    resubmits: Number(b.resubmits || 0) + (wasResubmit ? 1 : 0),
  });
  await store.event(
    (Number(nb.gate_attempts) > 0 || Number(nb.resubmits) > 0 ? 'Resubmitted' : 'Submitted') + (testMode ? ' (test mode)' : ''),
    `Lead time ${leadWD} working days` + (testMode ? `  ·  open checks: ${openCount}` : '')
  );
  return notify(teamEmails('Ad Ops'), `Brief for taxonomy: ${nb.brief_id} · ${nb.brand || ''}`,
    `A brief is waiting for taxonomy in the L'Oréal Brief Desk: ${nb.campaign_name || nb.brief_id}`, nb.brief_id);
}

// scrReview.rvBackEdit (pull back while with Ad Ops / Gatekeeper)
export async function pullBack(store) {
  const nb = await store.patchBrief({ status: 'Draft' });
  await store.event('Pulled back by planner to edit', 'Resubmitting will count as a resubmission');
  return notify(teamEmails('Ad Ops', 'Gatekeeper'), `Brief pulled back for edits: ${nb.brief_id}`,
    'The planner is editing this brief. Please pause work on it until it is submitted again.', nb.brief_id);
}

// scrAdOps.aoDone
export async function adOpsDone(store, campaignText) {
  const nb = await store.patchBrief({
    status: 'With Gatekeeper', campaign_taxonomy: campaignText, taxonomy_done_at: nowIso(), ad_ops_email: me().email,
  });
  await store.event('Taxonomy done');
  return notify(teamEmails('Gatekeeper'), `Brief ready for the Gate: ${nb.brief_id} · ${nb.brand || ''}`,
    `Taxonomy is done. Please run the Brief Gate check: ${nb.campaign_taxonomy}`, nb.brief_id);
}

// scrGate.gtPass
export async function gatePass(store) {
  const { b } = store.get();
  const nb = await store.patchBrief({
    status: 'Locked', gate_result: 'Pass', gate_replied_at: nowIso(), locked_at: nowIso(), gatekeeper_email: me().email,
    gate_attempts: Number(b.gate_attempts || 0) + 1,
    passed_first_time: isBlank(b.passed_first_time) ? 'Yes' : b.passed_first_time,
  });
  await store.event('Gate passed · locked', 'SLA clock starts');
  return notify([nb.planner_email, ...teamEmails('Buyer')], `Ready for set-up: ${nb.brief_id} · ${nb.brand || ''}`,
    `The brief passed the Gate and is locked. A buyer can accept it from the Set-up queue in the Brief Desk: ${nb.campaign_taxonomy || ''}`, nb.brief_id);
}

// scrGate.gtReturnPlanner
export async function gateReturnPlanner(store, gaps) {
  const { b } = store.get();
  const nb = await store.patchBrief({
    status: 'Returned', gate_result: 'Fail', gate_gaps: gaps, gate_replied_at: nowIso(), gatekeeper_email: me().email,
    gate_attempts: Number(b.gate_attempts || 0) + 1,
    passed_first_time: isBlank(b.passed_first_time) ? 'No' : b.passed_first_time,
  });
  await store.event('Gate returned to planner', gaps);
  return notify(nb.planner_email, `Brief returned: ${nb.brief_id} · ${nb.brand || ''}`,
    `The Brief Gate returned your brief. Gaps: ${gaps}`, nb.brief_id);
}

// scrGate.gtReturnAO
export async function gateReturnAdOps(store, gaps) {
  const { b } = store.get();
  const nb = await store.patchBrief({
    status: 'With Ad Ops', gate_gaps: gaps, sent_to_ao_at: nowIso(), taxonomy_fixes: Number(b.taxonomy_fixes || 0) + 1,
  });
  await store.event('Gate returned to Ad Ops (taxonomy)', gaps);
  return notify(nb.ad_ops_email, `Taxonomy fix needed: ${nb.brief_id}`, `The Brief Gate returned the taxonomy. Fix: ${gaps}`, nb.brief_id);
}

// scrDetail.dtAccept
export async function acceptSetup(store) {
  const prev = store.get().b.buyer_email;
  await store.patchBrief({ status: 'In set-up', buyer_email: me().email, buyer_name: me().name, buyer_accepted_at: nowIso() });
  await store.event('Buyer accepted the set-up', !isBlank(prev) && prev !== me().email ? `Taken over from ${prev}` : '');
  toast('You have this set-up now', 'success');
}

// scrDetail.dtSetUp
export async function markSetUp(store) {
  await store.patchBrief({ status: 'Set up', setup_done_at: nowIso() });
  await store.event('Set up in DV360');
  toast('Marked as set up', 'success');
}

// P2P QA (added 2026-10-19): the Buyer hands a finished set-up to QA instead of marking it set up.
export async function sendToQa(store) {
  const nb = await store.patchBrief({ status: 'In QA', qa_requested_at: nowIso() });
  await store.event('Sent to P2P QA', 'Buyer finished the DV360 set-up');
  return notify(teamEmails('QA'), `Ready for P2P QA: ${nb.brief_id} · ${nb.brand || ''}`,
    `The buyer finished the DV360 set-up. Please compare the DV360 export with the brief: ${nb.campaign_taxonomy || ''}`, nb.brief_id);
}

// QA decision. Pass → Set up (ready to launch). Fail → back to the Buyer (In set-up).
export async function qaDecision(store, pass, run) {
  const { b } = store.get();
  const first = isBlank(b.qa_passed_first_time);
  await db().insert('qa_runs', { brief_id: b.brief_id, by_email: me().email, at: nowIso(), result: pass ? 'Pass' : 'Fail', ...run });
  const nb = await store.patchBrief({
    status: pass ? 'Set up' : 'In set-up',
    qa_result: pass ? 'Pass' : 'Fail',
    qa_done_at: nowIso(),
    qa_email: me().email,
    qa_attempts: Number(b.qa_attempts || 0) + 1,
    qa_passed_first_time: first ? (pass ? 'Yes' : 'No') : b.qa_passed_first_time,
    ...(pass ? { setup_done_at: nowIso() } : {}),
  });
  const c = run.counts || {};
  await store.event(pass ? 'P2P QA passed · set up' : 'P2P QA failed · back to Buyer',
    `${run.decision || ''}  ·  ${c.fail || 0} fail · ${c.review || 0} review · ${c.reminder || 0} manual${run.note ? `  ·  ${run.note}` : ''}`);
  return notify(nb.buyer_email, pass ? `P2P QA passed: ${nb.brief_id}` : `P2P QA failed: ${nb.brief_id}`,
    pass ? 'The campaign passed P2P QA and is marked set up.' : `Fix the QA findings, then send it to QA again. ${c.fail || 0} checks failed.${run.note ? ` Note: ${run.note}` : ''}`, nb.brief_id);
}

// scrDetail.dtTakeOver
export async function takeOver(store) {
  await store.patchBrief({ buyer_email: me().email, buyer_name: me().name, buyer_accepted_at: nowIso() });
  await store.event('Buyer took over the set-up');
  toast('You have this set-up now', 'success');
}

// scrDetail.dtChange
export async function logChange(store, major, why) {
  const { b } = store.get();
  if (major) {
    const nb = await store.patchBrief({
      status: 'Draft', brief_version: Number(b.brief_version || 0) + 1, revisions_major: Number(b.revisions_major || 0) + 1,
      gate_attempts: 0, passed_first_time: null, gate_result: null, gate_gaps: '',
    });
    await store.event(`Major change: new brief version ${nb.brief_version}`, why);
    return notify([...teamEmails('Ad Ops', 'Gatekeeper'), nb.buyer_email], `Major change, brief reopened: ${nb.brief_id}`,
      `A locked brief was reopened as a new version. SLA restarts after the Gate. Reason: ${why}`, nb.brief_id);
  }
  const nb = await store.patchBrief({ revisions_minor: Number(b.revisions_minor || 0) + 1 });
  await store.event('Minor change', why);
  return notify(nb.buyer_email, `Minor change: ${nb.brief_id}`, `Minor change requested (no new brief): ${why}`, nb.brief_id);
}

// scrDetail.dtNamingFix
export async function logNamingFix(store, why) {
  const { b } = store.get();
  await store.patchBrief({ post_launch_naming_fixes: Number(b.post_launch_naming_fixes || 0) + 1 });
  await store.event('Naming fix after launch', why);
  toast('Naming fix logged against Ad Ops', 'success');
}

// Shows the result of an action that used to send an Outlook email.
export function doneToast(msg, mailto) {
  toast(msg, 'success', mailto ? { href: mailto, linkText: 'Open email draft' } : {});
}
