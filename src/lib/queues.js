// The Home tabs (scrHome.hmGal Items), sorted newest first like Sort(..., ID, Descending).
// `allow` decides which roles see each queue (see profileFor in data/store.js).
import { lower } from './util.js';

export const QUEUES = [
  { key: 'Mine', label: 'My briefs', icon: 'home', allow: (me) => me.canPlan,
    test: (b, me) => lower(b.planner_email) === me.email && b.status !== 'Cancelled' },
  { key: 'AO', label: 'Ad Ops queue', icon: 'inbox', allow: (me) => me.isAdOps, test: (b) => b.status === 'With Ad Ops' },
  { key: 'Gate', label: 'Gate queue', icon: 'gate', allow: (me) => me.isGate, test: (b) => b.status === 'With Gatekeeper' },
  { key: 'Setup', label: 'Set-up queue', icon: 'wrench', allow: (me) => me.isBuyer,
    test: (b, me) => b.status === 'Locked' || (b.status === 'In set-up' && lower(b.buyer_email) === me.email) },
  { key: 'Locked', label: 'Locked / set up', icon: 'lock', allow: (me) => me.isBuyer,
    test: (b) => ['Locked', 'In set-up', 'Set up'].includes(b.status) },
  { key: 'All', label: 'All briefs', icon: 'list', allow: (me) => me.isSuper, test: () => true },
];

export const queuesFor = (me) => QUEUES.filter((q) => q.allow(me));

// The queue each role lands on.
export const homeQueue = (me) => (me.canPlan ? 'Mine' : me.isAdOps ? 'AO' : me.isBuyer ? 'Setup' : 'Mine');

export const queueRows = (briefs, key, me) => {
  const q = QUEUES.find((x) => x.key === key) || QUEUES[0];
  return briefs.filter((b) => q.test(b, me)).sort((a, b) => Number(b.id) - Number(a.id));
};
