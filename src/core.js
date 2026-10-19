'use strict';
/* ===== Colony Manager: core (data, dates, strains, saving) ===== */
const APP_VERSION = '2.0';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ');
const lc = s => norm(s).toLowerCase();
const natCmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });

/* ---------- Dates (stored as ISO YYYY-MM-DD; shown as M-D-YYYY like mLIMS) ---------- */
const pad = n => String(n).padStart(2, '0');
function isoFromParts(y, m, d) {
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
/** '' for empty, null for unreadable, else ISO. Two-digit years are 20xx. */
function parseDate(v) {
  if (v == null) return '';
  if (v instanceof Date) return isNaN(v) ? null : isoFromParts(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const s = String(v).trim();
  if (!s) return '';
  let m;
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T ].*)?$/))) return isoFromParts(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/))) { let y = +m[3]; if (m[3].length === 2) y += 2000; return isoFromParts(y, +m[1], +m[2]); }
  if ((m = s.match(/^(\d{2})(\d{2})(\d{2})$/))) return isoFromParts(2000 + +m[3], +m[1], +m[2]);
  if ((m = s.match(/^(\d{2})(\d{2})(\d{4})$/))) return isoFromParts(+m[3], +m[1], +m[2]);
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = parseFloat(s); if (n > 30000 && n < 60000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5); return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); } }
  return null;
}
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+m}-${+d}-${y}`; }
function mmddyy(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return m + d + y.slice(2); }
function todayISO() { const d = new Date(); return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function dayNum(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; }
function daysBetween(a, b) { return Math.round(dayNum(b) - dayNum(a)); }
function addDays(iso, n) { const d = new Date((dayNum(iso) + n) * 864e5); return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
function ageText(iso, ref) {
  if (!iso) return '';
  const d = daysBetween(iso, ref || todayISO());
  if (d < 0) return 'future!';
  if (d < 28) return d + ' d';
  return Math.floor(d / 7) + ' wk';
}
function stamp() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; }
function nowText() { return new Date().toLocaleString(); }

/* ---------- Default data ---------- */
const PURPOSES = ['Breeding', 'Holding', 'Experimental', 'Stock', 'Other'];
const MOUSE_STATUSES = ['Live', 'Dead', 'Sacrificed', 'Transferred', 'Missing'];
const LITTER_STATUSES = ['Active', 'Weaned', 'Dead', 'Past'];

/* Data files from v1 copies are marked 'zou-colony'; both are accepted. */
const isColonyData = j => !!j && (j.app === 'colony-manager' || j.app === 'zou-colony');

function emptyDB() {
  return {
    app: 'colony-manager', version: 1,
    meta: { created: new Date().toISOString(), savedAt: null, saveCount: 0 },
    settings: {
      pi: '', protocol: '', owner: '', weanDays: 21,
      building: '', room: '',
      racks: [{ name: '1', rows: 7, cols: 10 }, { name: '2', rows: 7, cols: 10 }],
      sides: ['A', 'B'],
      series: [],
    },
    strains: [],
    cages: [], mice: [], litters: [], log: [],
  };
}
let DB = emptyDB();

/* ---------- Indexes (rebuilt lazily after each change) ---------- */
let _ix = null;
function ix() {
  if (_ix) return _ix;
  const cageById = new Map(), cageByName = new Map(), miceByCage = new Map(), littersByCage = new Map(), mouseByName = new Map(), childrenOf = new Map();
  for (const c of DB.cages) { cageById.set(c.id, c); cageByName.set(lc(c.name), c); }
  for (const m of DB.mice) {
    if (!miceByCage.has(m.cageId)) miceByCage.set(m.cageId, []);
    miceByCage.get(m.cageId).push(m);
    mouseByName.set(lc(m.name), m);
  }
  for (const l of DB.litters) { if (!littersByCage.has(l.cageId)) littersByCage.set(l.cageId, []); littersByCage.get(l.cageId).push(l); }
  for (const arr of littersByCage.values()) arr.sort((a, b) => (a.born || a.paired || '').localeCompare(b.born || b.paired || ''));
  for (const c of DB.cages) if (c.wfbr && c.wfbr.cageId) { if (!childrenOf.has(c.wfbr.cageId)) childrenOf.set(c.wfbr.cageId, []); childrenOf.get(c.wfbr.cageId).push(c); }
  _ix = { cageById, cageByName, miceByCage, littersByCage, mouseByName, childrenOf };
  return _ix;
}
let dataVersion = 0;
const invalidate = () => { _ix = null; dataVersion++; };
const cageOf = id => ix().cageById.get(id);
const cageNamed = n => ix().cageByName.get(lc(n));
const miceIn = (cid, all) => (ix().miceByCage.get(cid) || []).filter(m => all || m.status === 'Live');
const littersOf = cid => ix().littersByCage.get(cid) || [];
const weanDue = l => l.born ? addDays(l.born, +DB.settings.weanDays || 21) : '';
const isOpenLitter = l => l.status === 'Active';
function cageLocation(c) {
  const p = [];
  if (c.rack) p.push('Rack ' + c.rack);
  if (c.side) p.push('Side ' + c.side);
  if (c.row || c.col) p.push(c.row && c.col ? rowLabel(c.row) + c.col : c.row ? 'Row ' + rowLabel(c.row) : 'Col ' + c.col);
  return p.join(' · ');
}
/* Rack rows are stored as numbers (1, 2, …) and shown as letters (A, B, …). */
function rowLabel(n) { n = +n; if (!(n >= 1)) return String(n || ''); let s = ''; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; }
/** '' for empty, null for unreadable, else the row number as a string. Accepts A, b, AA or 3. */
function parseRow(v) {
  const s = norm(v).toUpperCase(); if (!s) return '';
  if (/^\d+$/.test(s)) return String(+s);
  if (/^[A-Z]{1,2}$/.test(s)) return String([...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0));
  return null;
}
/* Cage title: the cross for breeders ("strain ♀ × strain ♂"), strains with sex counts for other cages. */
function cageTitleParts(c) {
  const ms = miceIn(c.id);
  const strainsOf = sex => [...new Set(ms.filter(m => m.sex === sex).map(m => m.strain || '?'))];
  if (c.purpose === 'Breeding') {
    const f = strainsOf('F'), m = strainsOf('M');
    if (!f.length && !m.length) return null;
    return { cross: true, f: f.join(' / ') || 'none', m: m.join(' / ') || 'none' };
  }
  const by = new Map();
  for (const m of ms) { const k = m.strain || '?'; if (!by.has(k)) by.set(k, { F: 0, M: 0, U: 0 }); by.get(k)[m.sex === 'F' || m.sex === 'M' ? m.sex : 'U']++; }
  if (!by.size) return null;
  return { cross: false, groups: [...by].map(([s, n]) => ({ s, ...n })) };
}
function cageTitleText(c) {
  const t = cageTitleParts(c);
  if (!t) return c.line || 'Cage ' + c.name;
  if (t.cross) return `${t.f} ♀ × ${t.m} ♂`;
  return t.groups.map(g => `${g.s} ${g.F ? '♀' + g.F : ''}${g.F && g.M ? ' ' : ''}${g.M ? '♂' + g.M : ''}${g.U ? ' ?' + g.U : ''}`.trim()).join(' · ');
}
function cageTitleHTML(c) {
  const t = cageTitleParts(c);
  if (!t) return esc(c.line) || `<span class="muted">Cage ${esc(c.name)} (empty)</span>`;
  if (t.cross) return `${esc(t.f)} <span class="sex-F">♀</span> <span class="x">×</span> ${esc(t.m)} <span class="sex-M">♂</span>`;
  return t.groups.map(g => `${esc(g.s)} ${g.F ? `<span class="sex-F">♀${g.F > 1 ? g.F : ''}</span>` : ''}${g.M ? ` <span class="sex-M">♂${g.M > 1 ? g.M : ''}</span>` : ''}${g.U ? ` ?${g.U}` : ''}`).join('<span class="muted"> · </span>');
}
/** Compact title for rack tiles: one line per parent / strain group. */
function cageTitleTileHTML(c) {
  const t = cageTitleParts(c);
  if (!t) return `<div class="tl">${esc(c.line) || '<span class="muted">empty</span>'}</div>`;
  if (t.cross) return `<div class="tl">${esc(t.f)} <span class="sex-F">♀</span></div><div class="tl"><span class="x">×</span> ${esc(t.m)} <span class="sex-M">♂</span></div>`;
  return t.groups.map(g => `<div class="tl">${esc(g.s)} ${g.F ? `<span class="sex-F">♀${g.F > 1 ? g.F : ''}</span>` : ''}${g.M ? ` <span class="sex-M">♂${g.M > 1 ? g.M : ''}</span>` : ''}${g.U ? ` ?${g.U}` : ''}</div>`).join('');
}
function cageCounts(c) {
  const ms = miceIn(c.id);
  return { F: ms.filter(m => m.sex === 'F').length, M: ms.filter(m => m.sex === 'M').length, U: ms.filter(m => m.sex !== 'F' && m.sex !== 'M').length, all: ms.length };
}
/** Most urgent open litter in a cage (earliest wean-due). */
function currentLitter(c) {
  const open = littersOf(c.id).filter(isOpenLitter);
  open.sort((a, b) => (weanDue(a) || '9999').localeCompare(weanDue(b) || '9999'));
  return open[0] || null;
}
function weanState(l) {
  if (!l || !l.born) return null;
  const left = daysBetween(todayISO(), weanDue(l));
  return { left, cls: left < 0 ? 'over' : left <= 3 ? 'due' : '', text: left < 0 ? `wean overdue ${-left} d` : left === 0 ? 'wean today' : `wean in ${left} d` };
}

/* ---------- Strains ---------- */
const STRAIN_RULES = [
  [/\bR26 G\/G\b/gi, 'Rosa G/G'], [/(^|\s)R G\/G\b/gi, '$1Rosa G/G'], [/\bRosa26 G\/G\b/gi, 'Rosa G/G'],
  [/\bGLT-?1? F\//gi, 'GLT1 F/'], [/\bRag1-\/-/gi, 'Rag-/-'], [/\bRag1 KO\b/gi, 'Rag-/-'],
  [/\bCr2[ -]GFP/gi, 'Cr2-GFP'], [/\bCr2[ -]Cre/gi, 'Cr2-Cre'], [/\bItgb4\b/g, 'ITGB4'],
  [/\s*\((jax|JAX|Jax)\)/g, ''],
];
function strainKey(s) { return lc(s).replace(/\s+/g, ''); }
function strainIndex() {
  const m = new Map();
  for (const s of DB.strains) { m.set(strainKey(s.name), s.name); for (const a of s.aliases || []) if (a) m.set(strainKey(a), s.name); }
  return m;
}
/** Returns {name, known, changed}. Never invents spellings beyond the lab rules. */
function canonStrain(raw) {
  const r = norm(raw);
  if (!r) return { name: '', known: true, changed: false };
  const idx = strainIndex();
  if (idx.has(strainKey(r))) { const n = idx.get(strainKey(r)); return { name: n, known: true, changed: n !== r }; }
  let t = r; for (const [re, rep] of STRAIN_RULES) t = t.replace(re, rep); t = norm(t);
  if (idx.has(strainKey(t))) { const n = idx.get(strainKey(t)); return { name: n, known: true, changed: n !== r }; }
  return { name: t, known: false, changed: t !== r };
}
function strainNames() { return DB.strains.map(s => s.name).sort(natCmp); }

/* ---------- Naming ---------- */
function mouseBaseName(strain, dob, cageName) {
  const p = [norm(strain) || 'Unknown'];
  if (dob) p.push(mmddyy(dob));
  if (cageName) p.push('#' + norm(cageName));
  return p.join(' ');
}
/** Give a batch of base names unique final names (-1, -2 … when names would clash). */
function uniqueNames(bases, taken) {
  const counts = {}; bases.forEach(b => counts[lc(b)] = (counts[lc(b)] || 0) + 1);
  const used = new Set([...taken].map(lc));
  return bases.map(b => {
    if (counts[lc(b)] === 1 && !used.has(lc(b))) { used.add(lc(b)); return b; }
    let n = 1; while (used.has(lc(`${b}-${n}`))) n++;
    const nm = `${b}-${n}`; used.add(lc(nm)); return nm;
  });
}
function takenMouseNames() { return new Set(DB.mice.map(m => m.name)); }

/** PI · Protocol line for printouts and exports, leaving out blanks. */
const piLine = () => [DB.settings.pi && 'PI ' + DB.settings.pi, DB.settings.protocol && 'Protocol ' + DB.settings.protocol].filter(Boolean).join(' · ');

/* Barcode check: G-C-0000XXXXXXX = series base + cage number. */
function checkBarcode(barcode, cageName) {
  const digits = String(barcode || '').replace(/\D/g, '');
  if (!digits || !(DB.settings.series || []).length) return null;
  const num = parseInt(digits, 10), cnum = parseInt(String(cageName).match(/\d+/)?.[0] || 'NaN', 10);
  const sfx = (String(cageName).match(/-(YZ|B)$/i) || [])[0] || '';
  for (const s of DB.settings.series) {
    if (num - s.base === cnum) {
      if ((s.suffix || '').toUpperCase() !== sfx.toUpperCase()) return { ok: false, msg: `Barcode fits "${s.label}", which uses suffix "${s.suffix || 'none'}" but cage is "${cageName}"` };
      return { ok: true, msg: `Barcode fits ${s.label}` };
    }
  }
  const fits = DB.settings.series.map(s => ({ s, n: num - s.base })).filter(x => x.n > 0 && x.n < 1000);
  return { ok: false, msg: `Barcode doesn't match cage ${cageName} in any known series` + (fits.length ? ` (would be #${fits.map(x => x.n + (x.s.suffix || '')).join(' or #')})` : '') };
}

/* ---------- Change log + undo ---------- */
const undoStack = [];
function logEntry(msg, details) { DB.log.push({ ts: new Date().toISOString(), msg, details: details || '' }); }
/** All data changes go through here: snapshot for undo, log, save, re-render. */
const snapshot = () => JSON.stringify(Object.assign({}, DB, { log: [] }));
function restoreSnapshot(s) { const log = DB.log; DB = JSON.parse(s); DB.log = log; invalidate(); }
function mutate(label, fn, details) {
  const before = snapshot();
  let res;
  try { res = fn(); }
  catch (e) { restoreSnapshot(before); alert('Change not saved: ' + e.message); console.error(e); return; }
  if (res === false) { restoreSnapshot(before); return false; }
  undoStack.push({ label, before }); if (undoStack.length > 40) undoStack.shift();
  logEntry(label, typeof details === 'function' ? details() : details);
  invalidate(); Store.schedule(); render();
  return res;
}
function undo() {
  const u = undoStack.pop();
  if (!u) { toast('Nothing to undo'); return; }
  restoreSnapshot(u.before); // keeps the full change log, including the undo itself
  logEntry('Undo: ' + u.label);
  invalidate(); Store.schedule(); render(); toast('Undid: ' + u.label);
}

/* ---------- Storage: data folder on disk (+ timestamped backups), cached in IndexedDB ---------- */
const DATA_FILE = 'colony-data.json';
// Browser storage is scoped to this copy of the app (this build + where the file sits), so every new
// download starts with a clean slate instead of picking up data left in the browser by another copy.
const COPY_KEY = (() => { const s = '__BUILD_ID__|' + decodeURIComponent(location.pathname); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return 'copy-' + (h >>> 0).toString(36) + ':'; })();
const idb = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('zou-colony', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this._db = r.result; res(r.result); };
      r.onerror = () => rej(r.error);
    });
  },
  // If IndexedDB is unavailable (some Safari setups for local files), fall back to localStorage for plain data.
  lsGet(k) { try { const v = localStorage.getItem('zou-colony:' + COPY_KEY + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } },
  lsSet(k, v) { try { if (v instanceof Object && typeof v.kind === 'string' && v.name && !Array.isArray(v) && typeof v.queryPermission === 'function') return; localStorage.setItem('zou-colony:' + COPY_KEY + k, JSON.stringify(v)); } catch (e) { console.warn(e); Store.lastError = 'Browser storage is full or blocked: ' + e.message; } },
  async get(k) { try { const db = await this.open(); const v = await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(COPY_KEY + k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); return v === undefined ? this.lsGet(k) : v; } catch (e) { console.warn(e); return this.lsGet(k); } },
  async set(k, v) { try { const db = await this.open(); return await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, COPY_KEY + k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); } catch (e) { console.warn(e); this.lsSet(k, v); } },
  async del(k) { try { localStorage.removeItem('zou-colony:' + COPY_KEY + k); } catch (e) { } try { const db = await this.open(); await new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(COPY_KEY + k); t.oncomplete = res; t.onerror = res; }); } catch (e) { } },
};

const Store = {
  dir: null, state: 'none', // none | needs-permission | ok | error | browser (Safari/Firefox: browser storage + data files)
  timer: null, saving: false, pending: false, lastFileSavedAt: null, lastError: '',
  supported: typeof window.showDirectoryPicker === 'function',
  async init() {
    const cached = await idb.get('db');
    if (isColonyData(cached)) { DB = upgrade(cached); }
    this.lastFileSavedAt = (await idb.get('lastFileSavedAt')) || null;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    this.setupDone = !!(await idb.get('setupDone'));
    if (!this.supported) { this.state = 'browser'; return; }
    const h = await idb.get('dir');
    if (h) {
      this.dir = h;
      const p = await h.queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
      if (p === 'granted') { this.state = 'ok'; await this.loadFromFolder(true); }
      else this.state = 'needs-permission';
    }
  },
  async pickFolder() {
    try {
      const h = await window.showDirectoryPicker({ id: 'zou-colony', mode: 'readwrite' });
      this.dir = h; await idb.set('dir', h); this.state = 'ok'; this.setupDone = true; await idb.set('setupDone', true);
      const existing = await this.readFile();
      if (existing) {
        const hasLocal = DB.cages.length + DB.mice.length > 0;
        const msg = `This folder already has colony data (${existing.cages.length} cages, ${existing.mice.length} mice, saved ${existing.meta?.savedAt ? new Date(existing.meta.savedAt).toLocaleString() : '?'}).\n\nOK = open the data in the folder` + (hasLocal ? `\nCancel = keep the data open now (${DB.cages.length} cages, ${DB.mice.length} mice) and save it there (the folder's current file is backed up first)` : '');
        if (!hasLocal || confirm(msg)) { DB = upgrade(existing); undoStack.length = 0; this.lastFileSavedAt = existing.meta?.savedAt || null; await idb.set('lastFileSavedAt', this.lastFileSavedAt); invalidate(); await idb.set('db', DB); render(); toast('Opened data from folder'); return; }
        await this.backupExisting(existing, 'before-replace');
      }
      this.lastFileSavedAt = existing?.meta?.savedAt || null;
      await this.saveNow(true);
      render(); toast('Saving to folder: ' + h.name);
    } catch (e) { if (e.name !== 'AbortError') { alert('Could not use that folder: ' + e.message); } }
  },
  async reconnect() {
    if (!this.dir) return this.pickFolder();
    try {
      const p = await this.dir.requestPermission({ mode: 'readwrite' });
      if (p === 'granted') { this.state = 'ok'; await this.loadFromFolder(false); render(); }
    } catch (e) { alert('Could not reconnect: ' + e.message); }
  },
  /** Settings → "Move to another folder": keep the data open now and save it into a newly chosen folder. */
  async moveFolder() {
    const oldName = this.dir?.name;
    try {
      const h = await window.showDirectoryPicker({ id: 'zou-colony', mode: 'readwrite' });
      this.dir = h; await idb.set('dir', h); this.state = 'ok'; this.setupDone = true; await idb.set('setupDone', true);
      const existing = await this.readFile();
      if (existing) {
        if (!confirm(`That folder already has colony data (${existing.cages.length} cages, ${existing.mice.length} mice).\n\nOK = replace it with the data open now (the folder's file is backed up first)\nCancel = don't move`)) { toast('Not moved'); return; }
        await this.backupExisting(existing, 'before-move');
      }
      this.lastFileSavedAt = existing?.meta?.savedAt || null;
      logEntry(`Data folder moved${oldName ? ' from ' + oldName : ''} to ${h.name}`);
      await this.saveNow(true); render(); toast(`Now saving to ${h.name}. The old folder${oldName ? ' (' + oldName + ')' : ''} was left as it was.`, 5000);
    } catch (e) { if (e.name !== 'AbortError') alert('Could not use that folder: ' + e.message); }
  },
  /** Settings → "Forget folder": stop saving there; the app asks for a folder again on next start. */
  async forgetFolder() {
    await idb.del('dir'); await idb.del('setupDone');
    logEntry(`Stopped saving to data folder ${this.dir?.name || ''}`);
    this.dir = null; this.state = 'none'; this.setupDone = false; this.lastFileSavedAt = null;
    await this.saveNow(true); render(); toast('Folder forgotten. Data is kept in this browser until you choose a folder.', 4500);
  },
  /** Safari/Firefox: download the data as a file (each one is a dated backup). */
  saveToFile() {
    DB.meta.fileSavedAt = new Date().toISOString(); DB.meta.changesSinceFile = 0;
    download(`colony-data-${stamp()}.json`, JSON.stringify(DB, null, 1), 'application/json');
    this.saveNow(true); render();
  },
  async readFile() {
    try { const fh = await this.dir.getFileHandle(DATA_FILE); const f = await fh.getFile(); const txt = await f.text(); const j = JSON.parse(txt); return isColonyData(j) ? j : null; }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  },
  async loadFromFolder(silent) {
    try {
      const j = await this.readFile();
      if (!j) { if (DB.cages.length || DB.mice.length) await this.saveNow(true); return; }
      const local = DB.meta?.savedAt, file = j.meta?.savedAt;
      if (local && file && local > file && DB.meta.saveCount > (j.meta.saveCount || 0)) {
        // The browser copy is newer (e.g. folder was unavailable during the last save). Ask, never silently pick.
        const useLocal = confirm(`The copy in this browser (saved ${new Date(local).toLocaleString()}) is newer than ${DATA_FILE} in the folder (saved ${new Date(file).toLocaleString()}).\n\nOK = keep the newer browser copy and save it to the folder (the folder file is backed up first)\nCancel = open the folder file`);
        if (useLocal) { await this.backupExisting(j, 'older-file'); this.lastFileSavedAt = file; await this.saveNow(true); return; }
      }
      DB = upgrade(j); undoStack.length = 0; this.lastFileSavedAt = file || null; await idb.set('lastFileSavedAt', this.lastFileSavedAt); invalidate(); await idb.set('db', DB);
      if (!silent) toast('Loaded ' + DATA_FILE);
    } catch (e) { this.state = 'error'; this.lastError = e.message; console.error(e); }
  },
  dirty: false,
  schedule() { this.dirty = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.saveNow(), 1200); updateSavePill('saving'); },
  async backupExisting(j, tag) {
    const bdir = await this.dir.getDirectoryHandle('backups', { create: true });
    const fh = await bdir.getFileHandle(`colony-${stamp()}-${tag}.json`, { create: true });
    const w = await fh.createWritable(); await w.write(JSON.stringify(j)); await w.close();
  },
  async saveNow(force) {
    if (this.saving) { this.pending = true; return; }
    this.saving = true; clearTimeout(this.timer); this.dirty = false;
    try {
      DB.meta.savedAt = new Date().toISOString(); DB.meta.saveCount = (DB.meta.saveCount || 0) + 1;
      if (!force) DB.meta.changesSinceFile = (DB.meta.changesSinceFile || 0) + 1;
      await idb.set('db', DB);
      if (this.state === 'ok' && this.dir) {
        if (!force) {
          // Another window or computer may have changed the file since we loaded it.
          const cur = await this.readFile().catch(() => null);
          if (cur && cur.meta?.savedAt && this.lastFileSavedAt && cur.meta.savedAt !== this.lastFileSavedAt) {
            const ok = confirm(`${DATA_FILE} was changed somewhere else (saved ${new Date(cur.meta.savedAt).toLocaleString()}) since this window opened it.\n\nOK = save this window's data anyway (the other version is kept in backups)\nCancel = don't save now`);
            if (!ok) { this.state = 'error'; this.lastError = 'File changed elsewhere; not saved. Reload the page to see the other version.'; return; }
            await this.backupExisting(cur, 'overwritten');
          }
        }
        const txt = JSON.stringify(DB);
        const bdir = await this.dir.getDirectoryHandle('backups', { create: true });
        const bh = await bdir.getFileHandle(`colony-${stamp()}.json`, { create: true });
        let w = await bh.createWritable(); await w.write(txt); await w.close();
        const fh = await this.dir.getFileHandle(DATA_FILE, { create: true });
        w = await fh.createWritable(); await w.write(txt); await w.close();
        this.lastFileSavedAt = DB.meta.savedAt; await idb.set('lastFileSavedAt', this.lastFileSavedAt); DB.meta.changesSinceFile = 0;
        this.lastError = '';
      }
    } catch (e) {
      console.error(e); this.lastError = e.message;
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') this.state = 'needs-permission'; else this.state = 'error';
    } finally {
      this.saving = false; updateSavePill();
      if (this.pending) { this.pending = false; this.saveNow(); }
    }
  },
};
function upgrade(j) {
  const base = emptyDB();
  j.app = base.app;
  j.settings = Object.assign(base.settings, j.settings || {});
  for (const k of ['strains', 'cages', 'mice', 'litters', 'log']) if (!Array.isArray(j[k])) j[k] = k === 'strains' ? base.strains : [];
  j.meta = j.meta || base.meta;
  return j;
}
function updateSavePill(st) {
  const el = $('#savePill'); if (!el) return;
  el.className = 'save-pill';
  const s = Store.state;
  if (st === 'saving') { el.textContent = 'Saving…'; return; }
  if (s === 'ok') { el.textContent = `Saved to folder ${Store.dir?.name || ''} · ${DB.meta.savedAt ? new Date(DB.meta.savedAt).toLocaleTimeString() : ''}`; el.title = 'Data file: ' + DATA_FILE + ', with a timestamped copy in backups/ on every save'; }
  else if (s === 'needs-permission') { el.textContent = 'Click to reconnect data folder'; el.classList.add('warn'); el.title = 'The browser needs your OK to keep saving to the data folder'; }
  else if (s === 'browser') { const n = DB.meta.changesSinceFile || 0; el.textContent = n ? `${n} change${n > 1 ? 's' : ''} not in a data file · Save` : `Saved in this browser${DB.meta.fileSavedAt ? ' · data file ' + new Date(DB.meta.fileSavedAt).toLocaleDateString() : ''}`; if (n) el.classList.add('warn'); el.title = 'Click to save a data file (goes to your Downloads folder)'; }
  else if (s === 'error') { el.textContent = 'Not saved to folder!'; el.classList.add('err'); el.title = Store.lastError; }
  else { el.textContent = 'Choose a data folder'; el.classList.add('warn'); el.title = 'Data is only in this browser until you choose a folder'; }
}

/* ---------- Small UI helpers ---------- */
function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function toCSV(rows, cols) {
  const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.map(q).join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n');
}
