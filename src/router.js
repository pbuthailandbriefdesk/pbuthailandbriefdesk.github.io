// Hash router: works on GitHub Pages without server rewrites.
import { useEffect, useState } from 'preact/hooks';

export function parseRoute(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'brief' && parts[1]) {
    return { name: parts[2] || 'review', briefId: parts[1], query };
  }
  if (parts[0] === 'score') return { name: 'score', query };
  if (parts[0] === 'admin') return { name: 'admin', query };
  return { name: 'home', query };
}

export function useRoute() {
  const [r, setR] = useState(parseRoute());
  useEffect(() => {
    const f = () => { setR(parseRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export const go = (path) => { window.location.hash = path; };
export const briefPath = (id, screen = '') => `#/brief/${encodeURIComponent(id)}${screen ? '/' + screen : ''}`;
