// Ad Ops helpers ported from scrAdOps (aoFill, aoPasteGo, aoDone, aoActCount).
import { adGroupName, adName, campaignName, ioName, lineItemName } from './naming.js';
import { isBlank, lower } from './util.js';

const NEEDS_ID = ['Update', 'Pause', 'No change'];
export const missingId = (r) => NEEDS_ID.includes(r.action) && isBlank(r.dv360_id);

// Changes to apply for "Fill blank names with suggestions".
// Returns [{ table, id, patch }] plus an optional campaign taxonomy.
export function fillBlankNames(b, I, L, G, A, brands) {
  const ups = [];
  for (const r of I) if (isBlank(r.io_name)) ups.push({ table: 'brief_ios', id: r.id, patch: { io_name: ioName(b, r, brands) } });
  for (const r of L) if (isBlank(r.line_item_name)) ups.push({ table: 'brief_lines', id: r.id, patch: { line_item_name: lineItemName(r) } });
  for (const r of G) if (isBlank(r.ad_group_name)) ups.push({ table: 'brief_ad_groups', id: r.id, patch: { ad_group_name: adGroupName(r) } });
  for (const r of A) if (isBlank(r.ad_name)) ups.push({ table: 'brief_ads', id: r.id, patch: { ad_name: adName(r) } });
  // On a new brief, blank actions become New.
  if (!['Extension', 'Update'].includes(b.brief_type)) {
    for (const [table, rows] of [['brief_ios', I], ['brief_lines', L], ['brief_ad_groups', G], ['brief_ads', A]]) {
      for (const r of rows) {
        if (isBlank(r.action)) {
          const u = ups.find((x) => x.table === table && x.id === r.id);
          if (u) u.patch.action = 'New'; else ups.push({ table, id: r.id, patch: { action: 'New' } });
        }
      }
    }
  }
  const taxonomy = isBlank(b.campaign_taxonomy) ? campaignName(b, brands) : null;
  return { ups, taxonomy };
}

// "Match IDs by name": one entity per pasted line, name and ID separated by a tab
// (or spaces). An ID is a cell of 5+ digits; a name must match one in the brief.
// Rows that already have an ID are left alone.
export function matchPastedIds(text, b, I, L, G, A) {
  const names = new Set([
    ...I.map((x) => lower(x.io_name)), ...L.map((x) => lower(x.line_item_name)),
    ...G.map((x) => lower(x.ad_group_name)), ...A.map((x) => lower(x.ad_name)), lower(b.campaign_taxonomy),
  ]);
  const pasted = [];
  for (const ln of String(text || '').replace(/\r/g, '').split('\n')) {
    const sep = ln.includes('\t') ? '\t' : ' ';
    const cells = ln.trim().split(sep).map((c) => c.trim()).filter((c) => c !== '');
    const id = cells.find((c) => /^\d{5,}$/.test(c));
    const nm = cells.find((c) => names.has(c.toLowerCase()));
    if (id && nm) pasted.push({ id, nm: nm.toLowerCase() });
  }
  const idFor = (name) => (pasted.find((p) => p.nm === lower(name)) || {}).id;
  const pick = (rows, field, table) => rows
    .filter((r) => isBlank(r.dv360_id) && !isBlank(r[field]) && idFor(r[field]))
    .map((r) => ({ table, id: r.id, patch: { dv360_id: idFor(r[field]) } }));
  const mi = pick(I, 'io_name', 'brief_ios');
  const ml = pick(L, 'line_item_name', 'brief_lines');
  const mg = pick(G, 'ad_group_name', 'brief_ad_groups');
  const ma = pick(A, 'ad_name', 'brief_ads');
  const campaignId = !isBlank(b.campaign_taxonomy) && isBlank(b.dv360_campaign_id) ? idFor(b.campaign_taxonomy) || null : null;
  return { pastedCount: pasted.length, ups: [...mi, ...ml, ...mg, ...ma], counts: { io: mi.length, li: ml.length, ag: mg.length, ad: ma.length }, campaignId };
}

export function actionCounts(I, L, G, A) {
  const all = [...I, ...L, ...G, ...A];
  return {
    New: all.filter((r) => r.action === 'New').length,
    Update: all.filter((r) => r.action === 'Update').length,
    Pause: all.filter((r) => r.action === 'Pause').length,
    notSet: all.filter((r) => isBlank(r.action)).length,
    missingId: all.filter(missingId).length,
  };
}

// aoDone validation. Returns null when ready, or the error message.
export function adOpsDoneError(b, campaignText, I, L, G, A) {
  const unnamed = I.filter((r) => isBlank(r.io_name)).length + L.filter((r) => isBlank(r.line_item_name)).length +
    G.filter((r) => isBlank(r.ad_group_name)).length + A.filter((r) => isBlank(r.ad_name)).length;
  if (isBlank(campaignText) || unnamed > 0) {
    return { msg: 'Needs a campaign name and a name for every IO, line item, ad group and ad.', todo: false };
  }
  // DV360 IDs are not needed here: Ad Ops works before set-up, the Buyer adds them later.
  const c = actionCounts(I, L, G, A);
  if (c.notSet > 0) {
    return { msg: `Not ready for the Gate. Set an action on ${c.notSet} ${c.notSet === 1 ? 'row' : 'rows'}. Showing only the rows to fix.`, todo: true };
  }
  return null;
}
