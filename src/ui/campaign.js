// DV360 Campaign ID picker: candidates come from the advertiser's DV360 campaign list
// (Admin → DV360 campaigns) and from campaigns earlier briefs for the same advertiser used.
import { useEffect, useRef } from 'preact/hooks';
import { app, toast, useStore } from '../data/store.js';
import { isBlank, lower } from '../lib/util.js';
import { html, TextInput } from './ui.js';

export function campaignOptions(b, dv360, briefs) {
  if (isBlank(b.advertiser)) return [];
  const out = [];
  for (const c of dv360.filter((x) => String(x.advertiser_id) === String(b.advertiser))) {
    out.push({ id: String(c.campaign_id), name: c.campaign_name || '', source: 'DV360 list' });
  }
  for (const o of (briefs || []).filter((x) => x.brief_id !== b.brief_id && String(x.advertiser) === String(b.advertiser) && !isBlank(x.dv360_campaign_id))) {
    if (!out.some((c) => c.id === String(o.dv360_campaign_id))) {
      out.push({ id: String(o.dv360_campaign_id), name: o.campaign_taxonomy || o.campaign_name || '', source: `used by ${o.brief_id}` });
    }
  }
  return out;
}

// Which candidate to pick without asking: an exact name match with the brief's taxonomy,
// otherwise the only candidate for an Extension / Update brief (those run on an existing campaign).
export function autoCampaign(b, options) {
  if (!isBlank(b.dv360_campaign_id) || options.length === 0) return null;
  const tax = lower(b.campaign_taxonomy || b.campaign_name);
  const byName = tax ? options.filter((o) => lower(o.name) === tax) : [];
  if (byName.length === 1) return byName[0];
  if (['Extension', 'Update'].includes(b.brief_type) && options.length === 1) return options[0];
  return null;
}

export function CampaignIdField({ b, onSave, disabled, label = 'DV360 Campaign ID' }) {
  const { dv360, briefs } = useStore(app);
  const options = campaignOptions(b, dv360, briefs);
  const tried = useRef(false);
  useEffect(() => {
    if (disabled || tried.current || !briefs) return;
    tried.current = true;
    const pick = autoCampaign(b, options);
    if (pick) {
      onSave(pick.id).then(() => toast(`DV360 Campaign ID ${pick.id} picked automatically from ${b.advertiser_name || 'the advertiser'}${pick.name ? ` (${pick.name})` : ''}. Change it if it's wrong.`, 'success'));
    }
  }, [briefs, dv360.length]);

  const current = String(b.dv360_campaign_id || '');
  return html`<div class="field">
    <label>${label}</label>
    ${options.length > 0 && html`<select class="select" disabled=${disabled} value=${options.some((o) => o.id === current) ? current : ''}
      onChange=${(e) => { const v = e.currentTarget.value; if (v) onSave(v); }}>
      <option value="">Pick from ${b.advertiser_name || 'this advertiser'} (${options.length})</option>
      ${options.map((o) => html`<option value=${o.id}>${o.name ? `${o.name} · ` : ''}${o.id}${o.source === 'DV360 list' ? '' : ` (${o.source})`}</option>`)}
    </select>`}
    <${TextInput} mono value=${b.dv360_campaign_id} disabled=${disabled} onSave=${onSave}
      placeholder=${options.length ? 'or type the Campaign ID' : 'Campaign ID from DV360'} />
    <div class="hint">${options.length === 0
      ? html`No DV360 campaigns listed for ${b.advertiser_name || 'this advertiser'} yet. An Admin can add them in User management → DV360 campaigns.`
      : 'New campaigns get their ID when the Buyer creates them in DV360.'}</div>
  </div>`;
}
