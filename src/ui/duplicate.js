// "Duplicate brief": copy a brief into a new Draft, optionally moving every date.
import { useState } from 'preact/hooks';
import { duplicateBrief } from '../data/actions.js';
import { toast } from '../data/store.js';
import { diffDays, fmtDate, isBlank } from '../lib/util.js';
import { briefPath, go } from '../router.js';
import { loadBriefs } from '../screens/home.js';
import { ActionButton, html, Icon, Modal } from './ui.js';

export function DuplicateButton({ st }) {
  const [open, setOpen] = useState(false);
  const [launch, setLaunch] = useState('');
  const { b, I, L, G, A } = st;
  const shift = !isBlank(launch) && !isBlank(b.launch_date) ? diffDays(b.launch_date, launch) : null;

  const run = async () => {
    const nb = await duplicateBrief(st, launch || null);
    await loadBriefs();
    setOpen(false);
    toast(`${nb.brief_id} created from ${b.brief_id}. Check the dates, budget, PO and creatives.`, 'success');
    go(briefPath(nb.brief_id, 'edit'));
  };

  return html`
    <button class="btn" onClick=${() => setOpen(true)}><${Icon} name="copy" /> Duplicate</button>
    ${open && html`<${Modal} title="Duplicate this brief" onClose=${() => setOpen(false)}>
      <p class="small muted" style="margin-top:0">
        Copies the campaign set-up and the full structure (${I.length} IO · ${L.length} line items · ${G.length} ad groups · ${A.length} ads)
        into a new Draft in your name. PO, workflow history, DV360 IDs and Ad Ops actions are not copied.</p>
      <div class="field"><label for="dup-launch">New launch date (optional)</label>
        <input id="dup-launch" class="input" type="date" value=${launch} onInput=${(e) => setLaunch(e.currentTarget.value)} /></div>
      <div class="small muted" style="margin:8px 0 16px">${isBlank(launch)
        ? 'No date: all dates are left blank for you to fill in.'
        : shift === null
          ? 'The source brief has no launch date, so only the launch date is set.'
          : `Every date moves ${shift >= 0 ? '+' : ''}${shift} days (flight ${fmtDate(b.launch_date)} → ${fmtDate(launch)}).`}</div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="btn" onClick=${() => setOpen(false)}>Cancel</button>
        <${ActionButton} cls="btn btn-primary" onClick=${run}>Create the copy<//>
      </div>
    <//>`}`;
}
