// The Home tabs (scrHome.hmGal Items), sorted newest first like Sort(..., ID, Descending).
import { lower } from './util.js';

export const QUEUES = [
  { key: 'Mine', label: 'My briefs', icon: 'home', test: (b, me) => lower(b.planner_email) === me.email && b.status !== 'Cancelled' },
  { key: 'AO', label: 'Ad Ops queue', icon: 'inbox', test: (b) => b.status === 'With Ad Ops' },
  { key: 'Gate', label: 'Gate queue', icon: 'gate', test: (b) => b.status === 'With Gatekeeper' },
  { key: 'Setup', label: 'Set-up queue', icon: 'wrench', test: (b, me) => b.status === 'Locked' || (b.status === 'In set-up' && lower(b.buyer_email) === me.email) },
  { key: 'Locked', label: 'Locked / set up', icon: 'lock', test: (b) => ['Locked', 'In set-up', 'Set up'].includes(b.status) },
  { key: 'All', label: 'All briefs', icon: 'list', test: () => true },
];

export const queueRows = (briefs, key, me) => {
  const q = QUEUES.find((x) => x.key === key) || QUEUES[0];
  return briefs.filter((b) => q.test(b, me)).sort((a, b) => Number(b.id) - Number(a.id));
};
