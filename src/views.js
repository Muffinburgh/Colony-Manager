/* ===== Views ===== */
let UI = { cages: { q: '', purpose: '', status: 'Active', sort: 'name' }, mice: { q: '', status: 'Live', sex: '', strain: '' }, rack: { rack: '', side: '' }, breeding: { q: '', sort: 'wean' }, hist: { q: '' }, cageShowGone: false };
try { const s = JSON.parse(localStorage.getItem('zou-ui:' + COPY_KEY) || 'null'); if (s) UI = Object.assign(UI, s); } catch (e) { }
function saveUI() { try { localStorage.setItem('zou-ui:' + COPY_KEY, JSON.stringify(UI)); } catch (e) { } }

const NAV = [
  ['home', 'Home', '⌂'], ['racks', 'Rack view', '▦'], ['cages', 'Cages', '▤'], ['mice', 'Mice', '◉'], ['breeding', 'Breeding', '♥'],
  ['-'], ['import', 'Import', '⤓'], ['export', 'Export & print', '⎙'], ['-'], ['strains', 'Strains', '≡'], ['history', 'Change log', '↺'], ['settings', 'Settings & data', '⚙'],
];
function route() { const h = location.hash.replace(/^#\/?/, '') || 'home'; const [page, ...rest] = h.split('/'); return { page, arg: decodeURIComponent(rest.join('/')) }; }
function go(path) { location.hash = '#/' + path; }

function render() {
  const { page, arg } = route();
  $('#nav').innerHTML = NAV.map(n => n[0] === '-' ? '<div class="sep"></div>' : `<a href="#/${n[0]}" class="${page === n[0] || (page === 'cage' && n[0] === 'cages') ? 'active' : ''}"><span class="ico">${n[2]}</span>${n[1]}</a>`).join('');
  const main = $('#view');
  const fn = { home: viewHome, racks: viewRacks, cages: viewCages, cage: viewCage, mice: viewMice, breeding: viewBreeding, import: viewImport, export: viewExport, strains: viewStrains, history: viewHistory, settings: viewSettings }[page] || viewHome;
  const scroll = main.scrollTop;
  main.innerHTML = storageBanner() + fn(arg);
  if (fn.after) fn.after(arg);
  if (render._samePage === location.hash) main.scrollTop = scroll;
  render._samePage = location.hash;
  refreshDatalists(); updateSavePill();
}
function storageBanner() {
  const s = Store.state;
  if (s === 'ok') return '';
  if (s === 'needs-permission') return `<div class="banner warn"><b>Reconnect your data folder.</b> The browser needs your OK each time the app is opened. Changes are kept in this browser until then.<span class="spacer"></span><button class="btn primary" data-act="reconnect">Reconnect folder</button></div>`;
  if (s === 'browser') { const n = DB.meta.changesSinceFile || 0; return n ? `<div class="banner warn"><b>${n} change${n > 1 ? 's are' : ' is'} only saved in this browser.</b> Save a data file to keep a copy on your computer.<span class="spacer"></span><button class="btn primary" data-act="save-file">Save data file</button></div>` : ''; }
  if (s === 'error') return `<div class="banner err"><b>Last save to the folder failed:</b> ${esc(Store.lastError)}<span class="spacer"></span><button class="btn" data-act="save-now">Try again</button></div>`;
  return `<div class="banner info"><b>Choose a data folder</b> so the colony is saved as a file on your computer (with a backup copy on every save). Until then it's kept in this browser only.<span class="spacer"></span><button class="btn primary" data-act="pick-folder">Choose data folder…</button></div>`;
}
function refreshDatalists() {
  const box = $('#datalists'); if (!box || box._v === dataVersion) return; // only rebuild after data changes
  box._v = dataVersion;
  box.innerHTML = `<datalist id="dl-strains">${strainNames().map(s => `<option value="${esc(s)}">`).join('')}</datalist>
  <datalist id="dl-cages">${DB.cages.filter(c => c.status === 'Active').map(c => c.name).sort(natCmp).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  <datalist id="dl-mice">${DB.mice.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
  <datalist id="dl-lines">${[...new Set(DB.cages.map(c => c.line).filter(Boolean))].sort(natCmp).map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
}
const purposeBadge = p => `<span class="badge b-${esc(p)}">${esc(p || '?')}</span>`;
const sexSpan = s => `<span class="sex-${s}">${s === 'F' ? '♀' : s === 'M' ? '♂' : '?'}</span>`;
const cageLink = c => c ? `<a data-act="open-cage" data-id="${c.id}">${esc(c.name)}</a>` : '';
const issuesHtml = iss => iss.map(i => `<span class="issue ${i.level}">${i.level === 'err' ? '✖' : i.level === 'warn' ? '⚠' : 'ℹ'} ${esc(i.msg)}</span>`).join('');

/* ---------- Home ---------- */
function viewHome() {
  const today = todayISO();
  const active = DB.cages.filter(c => c.status === 'Active');
  const live = DB.mice.filter(m => m.status === 'Live');
  const openL = DB.litters.filter(l => isOpenLitter(l) && cageOf(l.cageId)?.status === 'Active');
  const wean = openL.filter(l => l.born).map(l => ({ l, c: cageOf(l.cageId), w: weanState(l) })).filter(x => x.w.left <= 7).sort((a, b) => a.w.left - b.w.left);
  const checks = dataChecks();
  if (!DB.cages.length && !DB.mice.length) {
    return `<h1>Welcome</h1><div class="panel"><p>No colony data yet. Two ways to start:</p>
      <ol><li><b>Import</b> the breeder-card JSON or an mLIMS animal file (CSV, TSV or Excel). You'll see a preview with any problems before anything is added. <a href="#/import">Go to Import</a></li>
      <li>Or add cages by hand from the <a href="#/racks">Rack view</a> (click an empty slot) or <a href="#/cages">Cages</a>.</li></ol>
      <p class="muted">${Store.state === 'browser' ? 'Tip: click "Save data file" (top right) at the end of each session to keep a copy on your computer.' : 'Tip: choose a data folder first so everything is saved to a file on your computer with automatic backups.'}</p></div>`;
  }
  return `<h1>Colony overview</h1>
  <div class="tiles">
    <div class="tile"><div class="n">${active.length}</div><div class="l">Active cages</div></div>
    <div class="tile"><div class="n">${active.filter(c => c.purpose === 'Breeding').length}</div><div class="l">Breeding cages</div></div>
    <div class="tile"><div class="n">${live.length}</div><div class="l">Live mice (${live.filter(m => m.sex === 'F').length} ♀ · ${live.filter(m => m.sex === 'M').length} ♂)</div></div>
    <div class="tile"><div class="n">${openL.length}</div><div class="l">Litters not weaned</div></div>
    <div class="tile"><div class="n" style="color:${wean.some(x => x.w.left < 0) ? 'var(--err)' : 'var(--warn)'}">${wean.length}</div><div class="l">To wean within 7 days</div></div>
  </div>
  <div class="grid2">
    <div class="panel"><h2 style="margin-top:0">Wean list (next 7 days and overdue)</h2>
      ${wean.length ? `<table class="t nw"><tr><th>Cage</th><th>Location</th><th>Born</th><th>Pups</th><th>Wean by</th><th></th></tr>
      ${wean.map(({ l, c, w }) => `<tr><td>${cageLink(c)}</td><td class="small">${esc(cageLocation(c))}</td><td>${fmtDate(l.born)} <span class="muted small">(${daysBetween(l.born, today)} d)</span></td><td>${esc(l.pups)}</td><td><span class="badge ${w.left < 0 ? 'b-err' : 'b-warn'}">${fmtDate(weanDue(l))} · ${esc(w.text)}</span></td><td><button class="btn sm" data-act="litter-wean" data-id="${l.id}">Wean…</button></td></tr>`).join('')}</table>` : '<div class="muted">Nothing to wean in the next 7 days.</div>'}
    </div>
    <div class="panel"><h2 style="margin-top:0">Things to check (${checks.length})</h2>
      ${checks.length ? `<div style="max-height:340px;overflow:auto">${checks.slice(0, 200).map(x => `<div class="issue ${x.level}">${x.level === 'err' ? '✖' : x.level === 'warn' ? '⚠' : 'ℹ'} ${x.html}</div>`).join('')}</div>` : '<div class="muted">No problems found.</div>'}
    </div>
  </div>
  <div class="panel"><h2 style="margin-top:0">Recent changes</h2>
    ${DB.log.slice(-8).reverse().map(e => `<div class="small"><span class="muted">${new Date(e.ts).toLocaleString()}</span> · ${esc(e.msg)}</div>`).join('') || '<span class="muted">None yet</span>'}
    <div style="margin-top:6px"><a href="#/history">Full change log</a></div></div>`;
}
function dataChecks() {
  const out = [], today = todayISO();
  const names = new Map();
  for (const m of DB.mice) { const k = lc(m.name); names.set(k, (names.get(k) || 0) + 1); }
  for (const [k, n] of names) if (n > 1) out.push({ level: 'err', html: `Mouse name used ${n} times: <b>${esc(DB.mice.find(m => lc(m.name) === k).name)}</b>` });
  for (const m of DB.mice.filter(m => m.status === 'Live')) {
    const c = cageOf(m.cageId);
    if (!c) out.push({ level: 'warn', html: `Live mouse with no cage: <a data-act="mouse-edit" data-id="${m.id}">${esc(m.name)}</a>` });
    else if (c.status !== 'Active') out.push({ level: 'warn', html: `Live mouse in closed cage ${cageLink(c)}: ${esc(m.name)}` });
    if (!m.dob) out.push({ level: 'info', html: `No DOB: <a data-act="mouse-edit" data-id="${m.id}">${esc(m.name)}</a>` });
    else if (m.dob > today) out.push({ level: 'err', html: `DOB in the future: <a data-act="mouse-edit" data-id="${m.id}">${esc(m.name)}</a>` });
    if (!m.strain) out.push({ level: 'info', html: `No strain: <a data-act="mouse-edit" data-id="${m.id}">${esc(m.name)}</a>` });
  }
  for (const c of DB.cages.filter(c => c.status === 'Active')) {
    const n = cageCounts(c);
    if (n.all === 0) out.push({ level: 'warn', html: `Active cage with no live mice: ${cageLink(c)} (close it?)` });
    if (c.purpose === 'Breeding' && n.all && (!n.F || !n.M)) out.push({ level: 'info', html: `Breeding cage ${cageLink(c)} has ${n.F} ♀ and ${n.M} ♂` });
    if (!c.rack || !c.row || !c.col) out.push({ level: 'info', html: `No rack position: ${cageLink(c)}` });
    for (const l of littersOf(c.id)) if (isOpenLitter(l) && l.born && daysBetween(l.born, today) > 35) out.push({ level: 'warn', html: `Litter born ${fmtDate(l.born)} in ${cageLink(c)} is still open (${daysBetween(l.born, today)} d old): wean it or mark it past` });
  }
  const pos = new Map();
  for (const c of DB.cages.filter(c => c.status === 'Active' && c.rack && c.row && c.col)) { const k = [c.rack, c.side, c.row, c.col].join('|'); if (pos.has(k)) out.push({ level: 'err', html: `Two cages in the same slot: ${cageLink(pos.get(k))} and ${cageLink(c)} (${esc(cageLocation(c))})` }); else pos.set(k, c); }
  const order = { err: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/* ---------- Rack view ---------- */
function rackNames() {
  const s = new Set(DB.settings.racks.map(r => String(r.name)));
  DB.cages.forEach(c => { if (c.rack && c.status === 'Active') s.add(String(c.rack)); });
  return [...s].sort(natCmp);
}
function viewRacks() {
  const racks = rackNames();
  if (!UI.rack.rack || !racks.includes(UI.rack.rack)) UI.rack.rack = racks[0] || '1';
  const sides = DB.settings.sides || [];
  if (sides.length && !sides.includes(UI.rack.side)) UI.rack.side = sides[0];
  const rk = UI.rack.rack, sd = sides.length ? UI.rack.side : '';
  const conf = DB.settings.racks.find(r => String(r.name) === rk) || { rows: 7, cols: 10 };
  const active = DB.cages.filter(c => c.status === 'Active');
  const here = active.filter(c => String(c.rack) === rk && (!sides.length || c.side === sd) && /^\d+$/.test(c.row) && /^\d+$/.test(c.col));
  const rows = Math.max(+conf.rows || 1, ...here.map(c => +c.row)), cols = Math.max(+conf.cols || 1, ...here.map(c => +c.col));
  const at = new Map(); const clash = [];
  for (const c of here) { const k = c.row + '|' + c.col; if (at.has(k)) clash.push(c); else at.set(k, c); }
  const placed = new Set(active.filter(c => c.rack && (!sides.length || c.side) && /^\d+$/.test(c.row) && /^\d+$/.test(c.col)).map(c => c.id));
  const unplaced = active.filter(c => !placed.has(c.id) || clash.includes(c)).sort((a, b) => natCmp(a.name, b.name));
  let grid = `<div class="rack" style="grid-template-columns:24px repeat(${cols},minmax(92px,1fr))"><div></div>`;
  for (let j = 1; j <= cols; j++) grid += `<div class="hdr">${j}</div>`;
  for (let i = 1; i <= rows; i++) {
    grid += `<div class="rhdr">${rowLabel(i)}</div>`;
    for (let j = 1; j <= cols; j++) {
      const c = at.get(i + '|' + j);
      grid += `<div class="slot ${c ? '' : 'empty'}" data-slot="${i}|${j}" ${c ? '' : `data-act="slot-empty" data-row="${i}" data-col="${j}"`}>${c ? cageTile(c) : ''}</div>`;
    }
  }
  grid += '</div>';
  const counts = racks.map(r => ({ r, n: active.filter(c => String(c.rack) === r).length }));
  return `<div class="row"><h1 style="margin:0">Rack view</h1><span class="spacer"></span>
    <button class="btn" data-act="print-rack">Print this side</button><button class="btn" data-act="cage-new" data-rack="${esc(rk)}" data-side="${esc(sd)}">+ New cage</button></div>
  <div class="row" style="margin:12px 0">
    <div class="tabs" style="margin:0;border:0">${counts.map(({ r, n }) => `<a class="${r === rk ? 'active' : ''}" data-act="rack-pick" data-rack="${esc(r)}">Rack ${esc(r)} <span class="muted small">(${n})</span></a>`).join('')}</div>
    ${sides.length ? `<span class="muted">Side</span>${sides.map(s => `<button class="btn ${s === sd ? 'primary' : ''}" data-act="side-pick" data-side="${esc(s)}">${esc(s)}</button>`).join('')}` : ''}
    <span class="spacer"></span>
    <div class="legend"><span><i style="background:var(--breed)"></i>Breeding</span><span><i style="background:var(--hold)"></i>Holding</span><span><i style="background:var(--exp)"></i>Experimental</span><span><i style="background:var(--stock)"></i>Stock</span><span class="flag lit">litter</span><span class="flag due">wean ≤3 d</span><span class="flag over">overdue</span><span class="flag wfbr">WFBR = weaned from breeder</span></div>
  </div>
  <div class="panel rack-wrap">${grid}</div>
  <div class="panel"><h3 style="margin-top:0">Cages without a rack position (${unplaced.length}) <span class="muted small">Drag a cage onto a slot to place it, or drag a placed cage here to clear its position.</span></h3>
  <div class="unplaced" data-slot="none">${unplaced.map(c => cageTile(c, true)).join('') || '<span class="muted small">All active cages are placed.</span>'}</div></div>`;
}
viewRacks.after = () => {
  $$('.ctile[draggable]').forEach(t => t.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', t.dataset.id); e.dataTransfer.effectAllowed = 'move'; }));
  $$('[data-slot]').forEach(s => {
    s.addEventListener('dragover', e => { e.preventDefault(); s.classList.add('drop'); });
    s.addEventListener('dragleave', () => s.classList.remove('drop'));
    s.addEventListener('drop', e => { e.preventDefault(); s.classList.remove('drop'); moveCageToSlot(e.dataTransfer.getData('text/plain'), s.dataset.slot); });
  });
};
function cageTile(c, unplacedView) {
  const n = cageCounts(c), l = currentLitter(c), w = weanState(l);
  const strains = [...new Set(miceIn(c.id).map(m => m.strain).filter(Boolean))];
  const line = c.line || strains.join(', ');
  const parent = c.wfbr?.cageId ? cageOf(c.wfbr.cageId) : null;
  const age = (() => { const ds = miceIn(c.id).map(m => m.dob).filter(Boolean).sort(); return ds.length ? ageText(ds[0]) : ''; })();
  return `<div class="ctile p-${esc(c.purpose)}" draggable="true" data-id="${c.id}" data-act="open-cage" title="${esc(cageTitleText(c) + ' · cage ' + c.name + (c.line ? ' · ' + c.line : '') + (cageLocation(c) ? ' · ' + cageLocation(c) : ''))}">
    <div class="cno">#${esc(c.name)}</div>
    <div class="cn">${cageTitleTileHTML(c)}</div>
    <div class="ct">${n.F ? `<span class="sex-F">♀${n.F}</span> ` : ''}${n.M ? `<span class="sex-M">♂${n.M}</span> ` : ''}${n.U ? `?${n.U} ` : ''}${!n.all ? '<span class="muted">empty</span>' : ''}<span class="muted">${age ? ' · ' + age : ''}</span></div>
    ${l && l.born ? `<span class="flag ${w && w.cls ? w.cls : 'lit'}">L ${daysBetween(l.born, todayISO())}d${l.pups ? ' · ' + esc(l.pups) + 'p' : ''}${w && w.cls ? ' · ' + (w.left < 0 ? 'overdue' : 'wean ' + fmtDate(weanDue(l)).slice(0, -5)) : ''}</span>` : ''}
    ${parent ? `<span class="flag wfbr">WFBR ${esc(parent.name)}</span>` : ''}
    ${unplacedView && cageLocation(c) ? `<div class="muted small">${esc(cageLocation(c))}</div>` : ''}
  </div>`;
}
function moveCageToSlot(id, slot) {
  const c = cageOf(id); if (!c) return;
  if (slot === 'none') {
    if (!c.row && !c.col) return;
    mutate(`Cage ${c.name}: removed from rack position (${cageLocation(c)})`, () => { const x = DB.cages.find(z => z.id === id); x.row = ''; x.col = ''; });
    return;
  }
  const [row, col] = slot.split('|');
  const rk = UI.rack.rack, sd = (DB.settings.sides || []).length ? UI.rack.side : '';
  const other = DB.cages.find(z => z.status === 'Active' && z.id !== id && String(z.rack) === rk && (z.side || '') === sd && String(z.row) === row && String(z.col) === col);
  const from = cageLocation(c) || 'no position';
  if (other) {
    if (!confirm(`Slot is taken by cage ${other.name}. Swap the two cages?`)) return;
    mutate(`Swapped cages ${c.name} and ${other.name}`, () => {
      const a = DB.cages.find(z => z.id === id), b = DB.cages.find(z => z.id === other.id);
      const pa = { rack: a.rack, side: a.side, row: a.row, col: a.col };
      Object.assign(a, { rack: rk, side: sd, row, col }); Object.assign(b, pa);
    });
    return;
  }
  mutate(`Cage ${c.name}: moved from ${from} to Rack ${rk}${sd ? ' Side ' + sd : ''} R${row} C${col}`, () => { Object.assign(DB.cages.find(z => z.id === id), { rack: rk, side: sd, row, col }); });
}

/* ---------- Cages list ---------- */
function viewCages() {
  const u = UI.cages;
  return `<div class="row"><h1 style="margin:0">Cages</h1><span class="spacer"></span><button class="btn primary" data-act="cage-new">+ New cage</button></div>
  <div class="row" style="margin:12px 0">
    <input data-ui="cages.q" placeholder="Search cage, line, strain, barcode…" value="${esc(u.q)}" style="width:280px">
    <select data-ui="cages.purpose"><option value="">All purposes</option>${PURPOSES.map(p => `<option ${u.purpose === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    <select data-ui="cages.status"><option value="Active" ${u.status === 'Active' ? 'selected' : ''}>Active</option><option value="Inactive" ${u.status === 'Inactive' ? 'selected' : ''}>Closed</option><option value="" ${!u.status ? 'selected' : ''}>All</option></select>
    <select data-ui="cages.sort"><option value="name" ${u.sort === 'name' ? 'selected' : ''}>Sort by cage</option><option value="loc" ${u.sort === 'loc' ? 'selected' : ''}>Sort by location</option><option value="wean" ${u.sort === 'wean' ? 'selected' : ''}>Sort by wean date</option><option value="line" ${u.sort === 'line' ? 'selected' : ''}>Sort by line</option></select>
    <span class="muted small" id="cageCount"></span>
  </div>
  <div class="tablewrap" id="listBody">${cagesTable()}</div>`;
}
function filteredCages() {
  const u = UI.cages, q = lc(u.q);
  let cs = DB.cages.filter(c => (!u.purpose || c.purpose === u.purpose) && (!u.status || c.status === u.status));
  if (q) cs = cs.filter(c => [c.name, c.line, c.barcode, c.notes, cageLocation(c), ...miceIn(c.id, true).map(m => m.strain + ' ' + m.name + ' ' + m.earTag)].some(x => lc(x).includes(q)));
  const locKey = c => [c.rack, c.side, String(c.row).padStart(3, '0'), String(c.col).padStart(3, '0')].join('|');
  const sorts = { name: (a, b) => natCmp(a.name, b.name), loc: (a, b) => natCmp(locKey(a), locKey(b)), line: (a, b) => natCmp(a.line, b.line) || natCmp(a.name, b.name), wean: (a, b) => (weanDue(currentLitter(a) || {}) || '9999').localeCompare(weanDue(currentLitter(b) || {}) || '9999') || natCmp(a.name, b.name) };
  return cs.sort(sorts[u.sort] || sorts.name);
}
function cagesTable() {
  const cs = filteredCages();
  setTimeout(() => { const el = $('#cageCount'); if (el) el.textContent = cs.length + ' cages'; });
  if (!cs.length) return '<div class="empty">No cages match.</div>';
  return `<table class="t"><tr><th>Strains / cross</th><th>Cage</th><th>Purpose</th><th>Line</th><th>Location</th><th>♀</th><th>♂</th><th>Litter</th><th>Wean by</th><th>Weaned from</th><th>Status</th></tr>
  ${cs.map(c => {
    const n = cageCounts(c), l = currentLitter(c), w = weanState(l), p = c.wfbr?.cageId ? cageOf(c.wfbr.cageId) : null;
    const strains = [...new Set(miceIn(c.id).map(m => m.strain).filter(Boolean))].join(', ');
    return `<tr class="click ${c.status !== 'Active' ? 'dim' : ''}" data-act="open-cage" data-id="${c.id}"><td><b>${cageTitleHTML(c)}</b></td><td>${esc(c.name)}</td><td>${purposeBadge(c.purpose)}</td><td class="small muted">${esc(c.line)}</td><td class="small">${esc(cageLocation(c))}</td><td>${n.F || ''}</td><td>${n.M || ''}</td>
    <td class="small">${l && l.born ? `${fmtDate(l.born)} (${daysBetween(l.born, todayISO())} d)${l.pups ? ', ' + esc(l.pups) + ' pups' : ''}` : ''}</td>
    <td>${w ? `<span class="badge ${w.cls === 'over' ? 'b-err' : w.cls === 'due' ? 'b-warn' : ''}">${fmtDate(weanDue(l))}</span>` : ''}</td><td>${p ? esc(p.name) : ''}</td><td>${c.status === 'Active' ? '' : '<span class="badge">Closed</span>'}</td></tr>`;
  }).join('')}</table>`;
}

/* ---------- Cage detail ---------- */
function viewCage(id) {
  const c = cageOf(id);
  if (!c) return `<div class="empty">Cage not found. <a href="#/cages">Back to cages</a></div>`;
  const all = miceIn(c.id, true), live = all.filter(m => m.status === 'Live'), gone = all.filter(m => m.status !== 'Live');
  const lits = littersOf(c.id);
  const parent = c.wfbr?.cageId ? cageOf(c.wfbr.cageId) : null;
  const plit = parent && c.wfbr.litterId ? DB.litters.find(l => l.id === c.wfbr.litterId) : null;
  const kids = (ix().childrenOf.get(c.id) || []).sort((a, b) => natCmp(a.name, b.name));
  const n = cageCounts(c);
  const mouseRows = list => list.map(m => `<tr class="${m.status !== 'Live' ? 'dim' : ''}"><td><input type="checkbox" class="msel" value="${m.id}"></td><td><a data-act="mouse-edit" data-id="${m.id}">${esc(m.name)}</a></td><td>${sexSpan(m.sex)}</td><td>${fmtDate(m.dob)}</td><td>${m.status === 'Live' ? ageText(m.dob) : ''}</td><td>${esc(m.strain)}</td><td>${esc(m.earTag)}</td><td class="small">${esc([m.dam && 'Dam: ' + m.dam, m.sire && 'Sire: ' + m.sire].filter(Boolean).join(' · '))}</td><td>${m.status === 'Live' ? '' : `<span class="badge">${esc(m.status)}${m.endDate ? ' ' + fmtDate(m.endDate) : ''}</span>`}</td></tr>`).join('');
  return `<div class="row"><a href="#/cages" class="muted">← Cages</a></div>
  <div class="row" style="margin:6px 0 12px"><div><h1 style="margin:0">${cageTitleHTML(c)}</h1><div class="muted">Cage <b>${esc(c.name)}</b></div></div>${purposeBadge(c.purpose)}${c.status !== 'Active' ? '<span class="badge b-err">Closed</span>' : ''}
    <span class="muted">${esc(cageLocation(c))}</span><span class="spacer"></span>
    <button class="btn" data-act="cage-edit" data-id="${c.id}">Edit cage</button>
    <button class="btn" data-act="print-card" data-id="${c.id}">Print card</button>
    ${c.status === 'Active' ? `<button class="btn" data-act="cage-close" data-id="${c.id}">Close cage</button>` : `<button class="btn" data-act="cage-reopen" data-id="${c.id}">Reopen</button>`}
  </div>
  <div class="grid2">
    <div class="panel"><div class="kv">
      <b>Line</b><span>${esc(c.line) || '<span class="muted">—</span>'}</span>
      <b>Mice</b><span>${n.F} ♀ · ${n.M} ♂${n.U ? ' · ' + n.U + ' ?' : ''}</span>
      ${c.purpose === 'Breeding' ? `<b>Date paired</b><span>${fmtDate(c.paired) || '—'}${c.paired ? ` <span class="muted">(${daysBetween(c.paired, todayISO())} d ago)</span>` : ''}</span>` : ''}
      <b>Barcode</b><span>${esc(c.barcode) || '—'}${c.barcode ? (() => { const b = checkBarcode(c.barcode, c.name); return b ? ` <span class="badge ${b.ok ? 'b-ok' : ''}" title="${esc(b.ok ? b.msg : b.msg + BARCODE_HINT)}">${b.ok ? 'fits series' : 'no known series'}</span>` : ''; })() : ''}</span>
      <b>Location</b><span>${esc([c.building, c.room].filter(Boolean).join(' / '))} ${esc(cageLocation(c)) || '<span class="muted">not placed</span>'}</span>
      <b>Owner · protocol</b><span>${esc(c.owner)} · ${esc(c.protocol)}</span>
      ${c.notes ? `<b>Notes</b><span>${esc(c.notes)}</span>` : ''}
    </div></div>
    <div class="panel"><h3 style="margin-top:0">Breeder links (WFBR)</h3>
      ${parent ? `<div>Weaned from breeder ${cageLink(parent)}${plit ? `, litter born ${fmtDate(plit.born)}` : ''} <span class="muted small">(${esc(parent.line)})</span></div>` : '<div class="muted small">Not linked to a breeder cage. <a data-act="cage-edit" data-id="' + c.id + '">Set "Weaned from"</a></div>'}
      ${kids.length ? `<div style="margin-top:8px"><b>Cages weaned from this cage:</b> ${kids.map(k => `${cageLink(k)}${k.status !== 'Active' ? ' <span class="muted small">(closed)</span>' : ''}`).join(', ')}</div>` : (c.purpose === 'Breeding' ? '<div class="muted small" style="margin-top:8px">No weaned cages linked yet. Use "Wean…" on a litter to create them.</div>' : '')}
    </div>
  </div>
  <div class="panel"><div class="row"><h2 style="margin:0">Mice (${live.length} live)</h2><span class="spacer"></span>
    <button class="btn sm" data-act="mice-move" data-scope="cage">Move selected…</button><button class="btn sm" data-act="mice-status" data-scope="cage">Set status…</button><button class="btn sm primary" data-act="mouse-new" data-cage="${c.id}">+ Add mouse</button></div>
    ${live.length ? `<table class="t" style="margin-top:8px"><tr><th><input type="checkbox" data-act="sel-all"></th><th>Name</th><th>Sex</th><th>DOB</th><th>Age</th><th>Strain</th><th>Ear tag</th><th>Parents</th><th></th></tr>${mouseRows(live)}</table>` : '<div class="muted" style="margin-top:8px">No live mice in this cage.</div>'}
    ${gone.length ? `<details style="margin-top:8px" ${UI.cageShowGone ? 'open' : ''}><summary class="small muted" data-act="toggle-gone">Former mice (${gone.length})</summary><table class="t">${mouseRows(gone)}</table></details>` : ''}
  </div>
  <div class="panel"><div class="row"><h2 style="margin:0">Litters (${lits.length})</h2><span class="spacer"></span><button class="btn sm primary" data-act="litter-new" data-cage="${c.id}">+ Add litter</button></div>
    ${lits.length ? `<table class="t" style="margin-top:8px"><tr><th>Paired</th><th>Born</th><th>Age</th><th>Pups</th><th>♀</th><th>♂</th><th>Wean by</th><th>Weaned</th><th>Status</th><th>Comments</th><th>Weaned to</th><th></th></tr>
    ${lits.slice().reverse().map(l => {
      const w = isOpenLitter(l) ? weanState(l) : null;
      const to = kids.filter(k => k.wfbr?.litterId === l.id);
      return `<tr class="${isOpenLitter(l) ? '' : 'dim'}"><td>${fmtDate(l.paired)}</td><td>${fmtDate(l.born)}</td><td>${l.born && isOpenLitter(l) ? daysBetween(l.born, todayISO()) + ' d' : ''}</td><td>${esc(l.pups)}</td><td>${esc(l.females)}</td><td>${esc(l.males)}</td>
      <td>${w ? `<span class="badge ${w.cls === 'over' ? 'b-err' : w.cls === 'due' ? 'b-warn' : ''}">${fmtDate(weanDue(l))}</span>` : ''}</td><td>${fmtDate(l.weaned)}</td><td>${esc(l.status)}</td><td class="small">${esc(l.comments)}</td><td>${to.map(cageLink).join(', ')}</td>
      <td style="white-space:nowrap">${isOpenLitter(l) ? `<button class="btn sm primary" data-act="litter-wean" data-id="${l.id}">Wean…</button> ` : ''}<button class="btn sm" data-act="litter-edit" data-id="${l.id}">Edit</button></td></tr>`;
    }).join('')}</table>` : '<div class="muted" style="margin-top:8px">No litters recorded.</div>'}
  </div>`;
}

/* ---------- Mice ---------- */
function viewMice() {
  const u = UI.mice;
  return `<div class="row"><h1 style="margin:0">Mice</h1><span class="spacer"></span>
    <button class="btn" data-act="mice-move" data-scope="list">Move selected…</button><button class="btn" data-act="mice-status" data-scope="list">Set status…</button><button class="btn primary" data-act="mouse-new">+ Add mouse</button></div>
  <div class="row" style="margin:12px 0">
    <input data-ui="mice.q" placeholder="Search name, ear tag, cage, strain…" value="${esc(u.q)}" style="width:280px">
    <select data-ui="mice.status"><option value="">All statuses</option>${MOUSE_STATUSES.map(s => `<option ${u.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <select data-ui="mice.sex"><option value="">Both sexes</option><option value="F" ${u.sex === 'F' ? 'selected' : ''}>Females</option><option value="M" ${u.sex === 'M' ? 'selected' : ''}>Males</option></select>
    <select data-ui="mice.strain" style="max-width:240px"><option value="">All strains</option>${[...new Set(DB.mice.map(m => m.strain).filter(Boolean))].sort(natCmp).map(s => `<option ${u.strain === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <span class="muted small" id="mouseCount"></span>
  </div>
  <div class="tablewrap" id="listBody">${miceTable()}</div>`;
}
function filteredMice() {
  const u = UI.mice, q = lc(u.q);
  let ms = DB.mice.filter(m => (!u.status || m.status === u.status) && (!u.sex || m.sex === u.sex) && (!u.strain || m.strain === u.strain));
  if (q) ms = ms.filter(m => [m.name, m.earTag, m.strain, cageOf(m.cageId)?.name, m.notes, m.dam, m.sire].some(x => lc(x).includes(q)));
  return ms.sort((a, b) => natCmp(cageOf(a.cageId)?.name, cageOf(b.cageId)?.name) || natCmp(a.name, b.name));
}
function miceTable() {
  const ms = filteredMice();
  setTimeout(() => { const el = $('#mouseCount'); if (el) el.textContent = ms.length + ' mice'; });
  if (!ms.length) return '<div class="empty">No mice match.</div>';
  const shown = ms.slice(0, 1500);
  return `<table class="t"><tr><th><input type="checkbox" data-act="sel-all"></th><th>Name</th><th>Sex</th><th>DOB</th><th>Age</th><th>Strain</th><th>Ear tag</th><th>Cage</th><th>Location</th><th>Weaned from</th><th>Status</th></tr>
  ${shown.map(m => { const c = cageOf(m.cageId), w = m.wfbr ? cageOf(m.wfbr) : null; return `<tr class="${m.status !== 'Live' ? 'dim' : ''}"><td><input type="checkbox" class="msel" value="${m.id}"></td><td><a data-act="mouse-edit" data-id="${m.id}">${esc(m.name)}</a></td><td>${sexSpan(m.sex)}</td><td>${fmtDate(m.dob)}</td><td>${m.status === 'Live' ? ageText(m.dob) : ''}</td><td>${esc(m.strain)}</td><td>${esc(m.earTag)}</td><td>${cageLink(c)}</td><td class="small">${c ? esc(cageLocation(c)) : ''}</td><td>${w ? cageLink(w) : ''}</td><td>${m.status === 'Live' ? 'Live' : `<span class="badge">${esc(m.status)}</span>`}</td></tr>`; }).join('')}</table>
  ${ms.length > shown.length ? `<div class="muted small" style="padding:8px">Showing first ${shown.length} of ${ms.length}. Narrow the search to see the rest.</div>` : ''}`;
}

/* ---------- Breeding ---------- */
function viewBreeding() {
  const u = UI.breeding, q = lc(u.q), today = todayISO();
  let cs = DB.cages.filter(c => c.status === 'Active' && c.purpose === 'Breeding');
  if (q) cs = cs.filter(c => [c.name, c.line, ...miceIn(c.id).map(m => m.strain)].some(x => lc(x).includes(q)));
  const key = c => { const l = currentLitter(c); return l && l.born ? weanDue(l) : '9999'; };
  cs.sort(u.sort === 'name' ? (a, b) => natCmp(a.name, b.name) : u.sort === 'line' ? (a, b) => natCmp(a.line, b.line) || natCmp(a.name, b.name) : (a, b) => key(a).localeCompare(key(b)) || natCmp(a.name, b.name));
  return `<div class="row"><h1 style="margin:0">Breeding cages</h1><span class="spacer"></span><button class="btn" data-act="print-breeding">Print breeding list</button><button class="btn primary" data-act="cage-new" data-purpose="Breeding">+ New breeding cage</button></div>
  <div class="row" style="margin:12px 0"><input data-ui="breeding.q" placeholder="Search cage, line, strain…" value="${esc(u.q)}" style="width:260px">
    <select data-ui="breeding.sort"><option value="wean" ${u.sort === 'wean' ? 'selected' : ''}>Sort by wean date</option><option value="name" ${u.sort === 'name' ? 'selected' : ''}>Sort by cage</option><option value="line" ${u.sort === 'line' ? 'selected' : ''}>Sort by line</option></select>
    <span class="muted small">${cs.length} breeding cages</span></div>
  <div class="bcards">${cs.map(c => {
    const ms = miceIn(c.id), l = currentLitter(c), w = weanState(l);
    const past = littersOf(c.id).filter(x => !isOpenLitter(x));
    const kids = (ix().childrenOf.get(c.id) || []).filter(k => k.status === 'Active');
    return `<div class="bcard"><a class="nm" data-act="open-cage" data-id="${c.id}">${cageTitleHTML(c)}</a>
      <div class="ln"><b>#${esc(c.name)}</b> · ${esc(cageLocation(c)) || 'not placed'}${c.line ? ' · ' + esc(c.line) : ''}</div>
      ${ms.map(m => `<div class="par">${sexSpan(m.sex)} ${esc(m.strain || '?')} <span class="muted">· ${fmtDate(m.dob) || 'no DOB'}${m.dob ? ' · ' + ageText(m.dob) : ''}${m.earTag ? ' · #' + esc(m.earTag) : ''}</span></div>`).join('') || '<div class="par muted">No live mice</div>'}
      <div class="small muted" style="margin-top:4px">Paired ${fmtDate(c.paired) || '—'}${c.paired ? ` (${daysBetween(c.paired, today)} d)` : ''} · ${past.length} past litter${past.length === 1 ? '' : 's'}</div>
      ${l ? `<div class="lit ${w ? w.cls : ''}"><b>Litter</b> ${l.born ? `born ${fmtDate(l.born)} · ${daysBetween(l.born, today)} d` : 'no birth date'}${l.pups ? ' · ' + esc(l.pups) + ' pups' : ''}${w ? `<br>Wean by <b>${fmtDate(weanDue(l))}</b> (${esc(w.text)})` : ''}
        <div class="row" style="margin-top:4px"><button class="btn sm primary" data-act="litter-wean" data-id="${l.id}">Wean…</button><button class="btn sm" data-act="litter-edit" data-id="${l.id}">Edit</button></div></div>`
        : `<div class="lit"><span class="muted">No open litter.</span> <button class="btn sm" data-act="litter-new" data-cage="${c.id}">+ Litter</button></div>`}
      ${kids.length ? `<div class="small" style="margin-top:6px">Weaned to: ${kids.map(cageLink).join(', ')}</div>` : ''}
    </div>`;
  }).join('') || '<div class="empty">No active breeding cages.</div>'}</div>`;
}

/* ---------- Strains ---------- */
function viewStrains() {
  const used = new Map(); DB.mice.forEach(m => { if (m.strain) used.set(m.strain, (used.get(m.strain) || 0) + (m.status === 'Live' ? 1 : 0)); });
  const all = [...DB.strains].sort((a, b) => natCmp(a.name, b.name));
  const orphan = [...used.keys()].filter(s => !DB.strains.some(x => x.name === s));
  return `<div class="row"><h1 style="margin:0">Strains</h1><span class="spacer"></span><button class="btn" data-act="strain-import" title="Add strains from a CSV or Excel file with Strain and Alternate spellings columns">Import list…</button><button class="btn" data-act="strain-export" ${DB.strains.length ? '' : 'disabled'} title="Download this list as a CSV file another copy of the app can import">Export list</button><button class="btn primary" data-act="strain-new">+ Add strain</button></div>
  <p class="muted">One spelling per strain. Aliases are other spellings seen on cards or in files; imports convert them to the main name. To fix a typo, rename it to the correct strain and the two are merged.</p>
  ${orphan.length ? `<div class="banner warn">Mice use strains not in this list: ${orphan.map(esc).join(', ')} <button class="btn sm" data-act="strain-adopt">Add them</button></div>` : ''}
  <div class="tablewrap"><table class="t"><tr><th>Strain</th><th>Aliases (other spellings)</th><th>Live mice</th><th></th></tr>
  ${all.map(s => `<tr><td><b>${esc(s.name)}</b></td><td class="small">${esc((s.aliases || []).join(', '))}</td><td>${used.get(s.name) || ''}</td><td style="white-space:nowrap"><button class="btn sm" data-act="strain-edit" data-name="${esc(s.name)}">Edit / merge</button></td></tr>`).join('')}</table></div>`;
}

/* ---------- Change log ---------- */
function viewHistory() {
  const q = lc(UI.hist.q);
  const rows = DB.log.slice().reverse().filter(e => !q || lc(e.msg + ' ' + e.details).includes(q));
  return `<div class="row"><h1 style="margin:0">Change log</h1><span class="spacer"></span><button class="btn" data-act="export-log">Download as CSV</button></div>
  <p class="muted">Every change made in the app, newest first. Undo (top bar, or Ctrl+Z) reverses the last changes made in this session; older states are in the backups folder.</p>
  <div class="row" style="margin-bottom:10px"><input data-ui="hist.q" placeholder="Search the log…" value="${esc(UI.hist.q)}" style="width:300px"><span class="muted small">${rows.length} entries</span></div>
  <div class="tablewrap" id="listBody"><table class="t"><tr><th style="width:170px">When</th><th>Change</th></tr>${rows.slice(0, 1000).map(e => `<tr><td class="small muted">${new Date(e.ts).toLocaleString()}</td><td>${esc(e.msg)}${e.details ? `<div class="small muted">${esc(e.details)}</div>` : ''}</td></tr>`).join('')}</table></div>`;
}

/* ---------- Settings ---------- */
function viewSettings() {
  const s = DB.settings;
  return `<h1>Settings & data</h1>
  <div class="panel"><h2 style="margin-top:0">Data folder</h2>
    ${Store.state === 'browser' ? `<p>This browser (Safari or Firefox) can't save straight into a folder, so the colony is kept in the browser and you <b>save a data file</b> to keep a copy on your computer. Each data file is dated, so they also work as backups. ${DB.meta.fileSavedAt ? `Last data file: ${new Date(DB.meta.fileSavedAt).toLocaleString()}.` : 'No data file saved yet.'}</p>
    <div class="row"><button class="btn primary" data-act="save-file">Save data file</button><button class="btn" data-act="backup-restore">Open a data file…</button></div>
    <p class="small muted">Data files go to your Downloads folder; move them somewhere backed up (e.g. OneDrive). Safari can clear website data, so save a file at the end of each session. Chrome or Edge can save to a folder automatically instead.</p>`
    : `<p>${Store.state === 'ok' ? `Saving to folder <b>${esc(Store.dir.name)}</b>: <code>${DATA_FILE}</code> is the data, and a timestamped copy goes into <code>backups/</code> on every save. Last saved ${DB.meta.savedAt ? new Date(DB.meta.savedAt).toLocaleString() : '—'}.` : Store.dir ? `Data folder <b>${esc(Store.dir.name)}</b> needs reconnecting.` : 'No data folder chosen. Data is only in this browser.'}</p>
    <div class="row">${Store.dir ? `<button class="btn" data-act="move-folder">Move to another folder…</button><button class="btn" data-act="forget-folder">Reset (forget this folder)</button>` : `<button class="btn primary" data-act="pick-folder">Choose data folder…</button>`}
    ${Store.state === 'needs-permission' ? '<button class="btn primary" data-act="reconnect">Reconnect folder</button>' : ''}
    <button class="btn" data-act="save-now">Save now</button><button class="btn" data-act="backup-download">Download backup (.json)</button><button class="btn" data-act="backup-restore">Restore from a backup…</button></div>
    <p class="small muted"><b>Move</b> saves the current data into a new folder from now on and leaves the old folder untouched. <b>Reset</b> stops saving to the folder (nothing is deleted) and the app asks for a folder again next time it opens. Use a folder that is backed up (e.g. OneDrive). Don't have the app open in two windows at once; it warns you if the file changed elsewhere.</p>`}
  </div>
  <div class="panel"><h2 style="margin-top:0">Lab defaults</h2><div class="form" id="setForm">
    <label class="f"><span>PI</span><input name="pi" value="${esc(s.pi)}"></label>
    <label class="f"><span>Owner (default)</span><input name="owner" value="${esc(s.owner)}"></label>
    <label class="f"><span>Protocol</span><input name="protocol" value="${esc(s.protocol)}"></label>
    <label class="f"><span>Building</span><input name="building" value="${esc(s.building)}"></label>
    <label class="f"><span>Room</span><input name="room" value="${esc(s.room)}"></label>
    <label class="f"><span>Wean at (days old)</span><input name="weanDays" type="number" min="14" max="35" value="${esc(s.weanDays)}"></label>
    <label class="f"><span>Rack sides (comma separated; blank = none)</span><input name="sides" value="${esc((s.sides || []).join(', '))}"></label>
    <label class="f wide"><span>Racks: one per line as <code>name, rows, columns</code></span><textarea name="racks" rows="3">${esc(s.racks.map(r => `${r.name}, ${r.rows}, ${r.cols}`).join('\n'))}</textarea></label>
    <label class="f wide"><span>Barcode series (barcode = base + cage number; a hint only, since not every printing follows it): one per line as <code>label, base, suffix</code></span><textarea name="series" rows="5">${esc(s.series.map(x => `${x.label}, ${x.base}, ${x.suffix}`).join('\n'))}</textarea></label>
  </div><div class="row" style="margin-top:10px"><button class="btn primary" data-act="settings-save">Save settings</button></div></div>
  <div class="panel"><h2 style="margin-top:0">About</h2><p class="small muted">Colony Manager v${APP_VERSION}. Runs fully offline in this one file. ${DB.cages.length} cages, ${DB.mice.length} mice, ${DB.litters.length} litters, ${DB.log.length} log entries.</p></div>`;
}

/* ---------- Global search ---------- */
function searchAll(q) {
  q = lc(q); if (!q) return [];
  const res = [];
  for (const c of DB.cages) if (lc(c.name).includes(q) || lc(c.barcode).includes(q) || lc(c.line).includes(q)) res.push({ score: lc(c.name) === q ? 0 : lc(c.name).startsWith(q) ? 1 : 3, html: `<b>Cage ${esc(c.name)}</b> ${purposeBadge(c.purpose)} ${cageTitleHTML(c)} <span class="muted small">${esc(cageLocation(c))}${c.status !== 'Active' ? ' (closed)' : ''}</span>`, go: () => go('cage/' + c.id) });
  for (const m of DB.mice) if (lc(m.name).includes(q) || (m.earTag && lc(m.earTag) === q)) res.push({ score: 2, html: `${sexSpan(m.sex)} ${esc(m.name)} <span class="muted small">cage ${esc(cageOf(m.cageId)?.name || '—')}${m.status !== 'Live' ? ' · ' + m.status : ''}</span>`, go: () => openMouseForm(m.id) });
  return res.sort((a, b) => a.score - b.score).slice(0, 30);
}
