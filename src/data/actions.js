// Workflow actions. Each one makes the same record changes, history event and
// notification as the matching button in the Power App (reference/powerapp-src).
import { isBlank, newBriefId, nowIso } from '../lib/util.js';
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
