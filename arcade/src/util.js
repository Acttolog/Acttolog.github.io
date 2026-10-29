// Small shared helpers for the arcade. Everything persists locally only.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PREFIX = 'arcade:v1:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable in private modes — the game still plays */
  }
}

export function todayKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayNumber(d = new Date()) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Seed a daily selection. `group` keeps one photo per region so a day never
 *  stacks three Kathmandu squares into the same quiz. */
export function seededPick(arr, count, seed, group = () => '') {
  const rand = rng(hashStr(String(seed)));
  const pool = shuffle(arr, rand);
  const out = [];
  const usedGroups = new Set();
  for (const item of pool) {
    if (out.length >= count) break;
    const g = group(item);
    if (usedGroups.has(g)) continue;
    usedGroups.add(g);
    out.push(item);
  }
  for (const item of pool) {
    if (out.length >= count) break;
    if (!out.includes(item)) out.push(item);
  }
  return out.slice(0, count);
}

export const fmt = (n) => Number(n).toLocaleString('en-US');

export function toast(message) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => node.classList.remove('show'), 2200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
    return true;
  } catch {
    toast('Select the text above to copy it');
    return false;
  }
}

export function shareText(text) {
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
    return;
  }
  copyText(text);
}

export const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function best(key, value) {
  const prev = load(key, 0);
  if (typeof value === 'number' && value > prev) {
    save(key, value);
    return { value, isNew: true };
  }
  return { value: Math.max(prev, value || 0), isNew: false };
}
