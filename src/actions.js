/* ===== Forms, actions, printing, start-up ===== */
function modal({ title, body, ok, okText = 'Save', wide, extraBtns = '' }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><div class="mh"><h3>${esc(title)}</h3><span class="spacer"></span><button class="btn sm" data-x>✕</button></div><div class="mb">${body}</div><div class="mf"><span class="merr"></span>${extraBtns}<button class="btn" data-x>Cancel</button>${ok ? `<button class="btn primary" data-ok>${esc(okText)}</button>` : ''}</div></div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.querySelectorAll('[data-x]').forEach(b => b.onclick = close);
  bg.addEventListener('mousedown', e => { if (e.target === bg) bg._downOnBg = true; });
  bg.addEventListener('click', e => { if (e.target === bg && bg._downOnBg) close(); bg._downOnBg = false; });
  const okBtn = bg.querySelector('[data-ok]');
  if (okBtn) okBtn.onclick = () => {
    let r; try { r = ok(bg); } catch (e) { r = e.message; console.error(e); }
    if (r === true || r === undefined) close(); else if (typeof r === 'string') bg.querySelector('.merr').textContent = r;
  };
  bg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && okBtn) { e.preventDefault(); okBtn.click(); } });
  setTimeout(() => { const f = bg.querySelector('input:not([type=checkbox]),select,textarea'); if (f) f.focus(); }, 30);
  return bg;
}
const fld = (label, name, value, o = {}) => {
  let input;
  if (o.options) input = `<select name="${name}">${o.options.map(op => { const [v, t] = Array.isArray(op) ? op : [op, op]; return `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select>`;
  else if (o.textarea) input = `<textarea name="${name}" rows="2">${esc(value)}</textarea>`;
  else input = `<input name="${name}" value="${esc(value)}" ${o.list ? `list="${o.list}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.type ? `type="${o.type}"` : ''} autocomplete="off">`;
  return `<label class="f ${o.wide ? 'wide' : ''}"><span>${esc(label)}</span>${input}${o.hint ? `<small class="muted">${o.hint}</small>` : ''}</label>`;
};
function readForm(el) { const o = {}; el.querySelectorAll('[name]').forEach(i => o[i.name] = i.type === 'checkbox' ? i.checked : norm(i.value)); return o; }
function dateOrErr(v, label, errs, opts = {}) {
  const d = parseDate(v);
  if (d === null) { errs.push(`${label}: "${v}" isn't a date (use e.g. 6-29-2026 or 062926)`); return ''; }
  if (d && !opts.allowFuture && d > todayISO()) errs.push(`${label} is in the future`);
  return d;
}
const dateHint = 'e.g. 6-29-2026 or 062926';

/* ---------- Cage form ---------- */
function openCageForm(id, preset = {}) {
  const c = id ? cageOf(id) : { name: '', purpose: preset.purpose || 'Holding', status: 'Active', line: '', barcode: '', building: DB.settings.building, room: DB.settings.room, rack: preset.rack || '', side: preset.side || '', row: preset.row || '', col: preset.col || '', owner: DB.settings.owner, protocol: DB.settings.protocol, paired: '', notes: '', wfbr: null };
  const breeders = DB.cages.filter(b => b.purpose === 'Breeding' && b.id !== id).sort((a, b) => natCmp(a.name, b.name));
  const litOpts = bid => [['', '— any / not sure —'], ...littersOf(bid).map(l => [l.id, `born ${fmtDate(l.born) || '?'}${l.pups ? ', ' + l.pups + ' pups' : ''} (${l.status})`])];
  const body = `<div class="form">
    ${fld('Cage name', 'name', c.name, { ph: 'e.g. 26, 28-B, 51-YZ' })}
    ${fld('Purpose', 'purpose', c.purpose, { options: PURPOSES })}
    ${fld('Status', 'status', c.status, { options: [['Active', 'Active'], ['Inactive', 'Closed']] })}
    ${fld('Line (card header)', 'line', c.line, { list: 'dl-lines' })}
    ${fld('Barcode', 'barcode', c.barcode, { ph: 'G-C-0000…' })}
    ${fld('Date paired', 'paired', fmtDate(c.paired), { hint: 'breeding cages' })}
    ${fld('Rack', 'rack', c.rack, { options: ['', ...rackNames(), ...(c.rack && !rackNames().includes(String(c.rack)) ? [c.rack] : [])] })}
    ${(DB.settings.sides || []).length ? fld('Side', 'side', c.side, { options: ['', ...DB.settings.sides] }) : ''}
    ${fld('Row (letter)', 'row', rowLabel(c.row), { ph: 'A, B, C…' })}${fld('Column', 'col', c.col)}
    ${fld('Building', 'building', c.building)}${fld('Room', 'room', c.room)}
    ${fld('Owner', 'owner', c.owner)}${fld('Protocol', 'protocol', c.protocol)}
    ${fld('Weaned from breeder (WFBR)', 'wfbrCage', c.wfbr?.cageId || '', { options: [['', '— none —'], ...breeders.map(b => [b.id, `${b.name}${b.line ? ' · ' + b.line : ''}${b.status !== 'Active' ? ' (closed)' : ''}`])] })}
    <label class="f"><span>…from litter</span><select name="wfbrLitter">${(c.wfbr?.cageId ? litOpts(c.wfbr.cageId) : [['', '—']]).map(([v, t]) => `<option value="${v}" ${v === (c.wfbr?.litterId || '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    ${fld('Notes', 'notes', c.notes, { textarea: true, wide: true })}
  </div>`;
  const m = modal({
    title: id ? `Edit cage ${c.name}` : 'New cage', body, wide: true, ok: el => {
      const f = readForm(el), errs = [];
      if (!f.name) errs.push('Cage name is required');
      const dup = cageNamed(f.name); if (dup && dup.id !== id) errs.push(`There is already a cage named ${dup.name}${dup.status !== 'Active' ? ' (closed)' : ''}`);
      const paired = dateOrErr(f.paired, 'Date paired', errs);
      const prow = parseRow(f.row); if (prow === null) errs.push('Row must be a letter (A, B, C…)'); else f.row = prow;
      if (f.col && !/^\d+$/.test(f.col)) errs.push('Column must be a number');
      const sd = (DB.settings.sides || []).length ? f.side : '';
      if (f.status === 'Active' && f.rack && f.row && f.col) {
        const other = DB.cages.find(z => z.id !== id && z.status === 'Active' && String(z.rack) === f.rack && (z.side || '') === sd && String(z.row) === f.row && String(z.col) === f.col);
        if (other) errs.push(`That rack position is taken by cage ${other.name}`);
      }
      if (errs.length) return errs.join(' · ');
      if (id && f.status === 'Inactive' && c.status === 'Active') {
        const n = miceIn(id).length, open = littersOf(id).filter(isOpenLitter).length;
        if ((n || open) && !confirm(`Close cage ${c.name}? It still has ${n} live mice${open ? ` and ${open} litter${open > 1 ? 's' : ''} not weaned` : ''}. They stay recorded in it.`)) return 'Not closed';
      }
      const data = { name: f.name, purpose: f.purpose, status: f.status, line: f.line, barcode: f.barcode, paired, rack: f.rack, side: sd, row: f.row, col: f.col, building: f.building, room: f.room, owner: f.owner, protocol: f.protocol, notes: f.notes, wfbr: f.wfbrCage ? { cageId: f.wfbrCage, litterId: f.wfbrLitter || '' } : null };
      if (!id) {
        let newId;
        mutate(`Created cage ${data.name}`, () => { newId = uid('c'); DB.cages.push({ id: newId, ...data, created: todayISO() }); });
        go('cage/' + newId); return true;
      }
      const changes = Object.keys(data).filter(k => JSON.stringify(data[k] ?? '') !== JSON.stringify(c[k] ?? '')).map(k => `${k}: "${k === 'wfbr' ? (c.wfbr ? cageOf(c.wfbr.cageId)?.name : '') : c[k] ?? ''}" → "${k === 'wfbr' ? (data.wfbr ? cageOf(data.wfbr.cageId)?.name : '') : data[k]}"`);
      if (!changes.length) return true;
      let renameMice = false;
      if (data.name !== c.name && miceIn(c.id, true).some(mm => mm.name.includes('#' + c.name))) renameMice = confirm(`Also rename the mice in this cage from "…#${c.name}" to "…#${data.name}"?`);
      mutate(`Edited cage ${c.name}${data.name !== c.name ? ' → ' + data.name : ''}`, () => {
        const x = DB.cages.find(z => z.id === id); Object.assign(x, data);
        if (renameMice) for (const mm of DB.mice.filter(mm => mm.cageId === id)) { const nn = mm.name.split('#' + c.name).join('#' + data.name); if (nn !== mm.name) renameMouseRefs(mm, nn); }
      }, changes.join('; '));
      return true;
    }
  });
  m.querySelector('[name=wfbrCage]').addEventListener('change', e => {
    m.querySelector('[name=wfbrLitter]').innerHTML = (e.target.value ? litOpts(e.target.value) : [['', '—']]).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('');
  });
}
function renameMouseRefs(mm, nn) {
  const old = mm.name; mm.name = nn;
  for (const o of DB.mice) { if (o.dam === old) o.dam = nn; if (o.sire === old) o.sire = nn; }
}

/* ---------- Mouse form ---------- */
function openMouseForm(id, cageId) {
  const c0 = cageId ? cageOf(cageId) : null;
  const m = id ? DB.mice.find(x => x.id === id) : { name: '', sex: 'F', status: 'Live', dob: '', strain: c0 ? (miceIn(c0.id)[0]?.strain || '') : '', earTag: '', color: '', cageId: cageId || '', dam: '', sire: '', protocol: DB.settings.protocol, owner: DB.settings.owner, notes: '', endDate: '', wfbr: '' };
  const cName = cageOf(m.cageId)?.name || '';
  const hist = (m.history || []).map(h => `<div class="small muted">${fmtDate(h.date)}: ${h.from ? esc(h.from) + ' → ' : ''}${esc(h.to || '')} ${h.note ? '(' + esc(h.note) + ')' : ''}</div>`).join('');
  const body = `<div class="form">
    <label class="f wide"><span>Name</span><div class="row"><input name="name" value="${esc(m.name)}" style="flex:1" autocomplete="off"><button class="btn sm" type="button" data-auto>Make name from strain, DOB, cage</button></div></label>
    ${fld('Sex', 'sex', m.sex, { options: [['F', '♀ Female'], ['M', '♂ Male'], ['U', 'Unknown']] })}
    ${fld('Date of birth', 'dob', fmtDate(m.dob), { hint: dateHint })}
    ${fld('Strain', 'strain', m.strain, { list: 'dl-strains' })}
    ${fld('Ear tag', 'earTag', m.earTag)}
    ${fld('Cage', 'cage', cName, { list: 'dl-cages' })}
    ${fld('Status', 'status', m.status, { options: MOUSE_STATUSES })}
    ${fld('Date of death / removal', 'endDate', fmtDate(m.endDate), { hint: 'if not Live' })}
    ${fld('Dam', 'dam', m.dam, { list: 'dl-mice' })}${fld('Sire', 'sire', m.sire, { list: 'dl-mice' })}
    ${fld('Body color', 'color', m.color)}${fld('Protocol', 'protocol', m.protocol)}${fld('Owner', 'owner', m.owner)}
    ${fld('Notes', 'notes', m.notes, { textarea: true, wide: true })}
    ${m.wfbr ? `<div class="wide small">Weaned from breeder ${cageLink(cageOf(m.wfbr))}</div>` : ''}
    ${hist ? `<div class="wide"><b class="small">Cage history</b>${hist}</div>` : ''}
  </div>`;
  const el = modal({
    title: id ? `Mouse ${m.name}` : 'Add mouse', body, wide: true,
    extraBtns: id ? `<button class="btn danger" data-del style="margin-right:auto">Delete record</button>` : '',
    ok: el => {
      const f = readForm(el), errs = [];
      const dob = dateOrErr(f.dob, 'DOB', errs), endDate = dateOrErr(f.endDate, 'Date of death', errs);
      if (!f.name) errs.push('Name is required');
      const dup = ix().mouseByName.get(lc(f.name)); if (dup && dup.id !== id) errs.push(`Another mouse is already named "${f.name}"`);
      let cage = null;
      if (f.cage) { cage = cageNamed(f.cage); if (!cage) errs.push(`No cage named "${f.cage}". Create it first.`); else if (cage.status !== 'Active' && f.status === 'Live' && cage.id !== m.cageId) errs.push(`Cage ${cage.name} is closed. Reopen it first.`); }
      if (dob && endDate && endDate < dob) errs.push('Death date is before DOB');
      if (errs.length) return errs.join(' · ');
      let strain = f.strain;
      if (strain) { const cs = canonStrain(strain); if (cs.known) strain = cs.name; else if (!confirm(`"${strain}" isn't in the strain list. Add it as a new strain?`)) return 'Pick a strain from the list or confirm the new one'; }
      const data = { name: f.name, sex: f.sex, dob, strain, earTag: f.earTag, status: f.status, endDate: f.status === 'Live' ? '' : (endDate || (m.status === 'Live' ? todayISO() : m.endDate || '')), dam: f.dam, sire: f.sire, color: f.color, protocol: f.protocol, owner: f.owner, notes: f.notes, cageId: cage ? cage.id : '' };
      if (!id) {
        mutate(`Added mouse ${data.name}${cage ? ' to cage ' + cage.name : ''}`, () => { if (strain && !DB.strains.some(s => s.name === strain)) DB.strains.push({ name: strain, aliases: [] }); DB.mice.push({ id: uid('m'), ...data, wfbr: '', history: [{ date: todayISO(), to: cage?.name || '', note: 'added' }] }); });
        return true;
      }
      const changes = Object.keys(data).filter(k => (data[k] ?? '') !== (m[k] ?? '')).map(k => k === 'cageId' ? `cage: ${cName || '—'} → ${cage?.name || '—'}` : `${k}: "${m[k] ?? ''}" → "${data[k]}"`);
      if (!changes.length) return true;
      mutate(`Edited mouse ${m.name}${data.name !== m.name ? ' → ' + data.name : ''}`, () => {
        if (strain && !DB.strains.some(s => s.name === strain)) DB.strains.push({ name: strain, aliases: [] });
        const x = DB.mice.find(z => z.id === id);
        if (data.cageId !== x.cageId) (x.history = x.history || []).push({ date: todayISO(), from: cName, to: cage?.name || '', note: 'edited' });
        if (data.name !== x.name) renameMouseRefs(x, data.name);
        Object.assign(x, data);
      }, changes.join('; '));
      return true;
    }
  });
  el.querySelector('[data-auto]').onclick = () => {
    const f = readForm(el); const dob = parseDate(f.dob) || '';
    const taken = new Set(DB.mice.filter(x => x.id !== id).map(x => x.name));
    el.querySelector('[name=name]').value = uniqueNames([mouseBaseName(canonStrain(f.strain).name, dob, f.cage)], taken)[0];
  };
  const del = el.querySelector('[data-del]');
  if (del) del.onclick = () => {
    if (!confirm(`Delete the record of ${m.name} completely?\n\nUsually you should set Status to Dead / Sacrificed instead, which keeps the history. Delete only records entered by mistake.`)) return;
    mutate(`Deleted mouse record ${m.name}`, () => { DB.mice = DB.mice.filter(z => z.id !== id); }, JSON.stringify(m)); el.remove();
  };
}

/* ---------- Bulk mouse actions ---------- */
function selectedMice() { return $$('.msel:checked').map(i => DB.mice.find(m => m.id === i.value)).filter(Boolean); }
function openMoveForm() {
  const ms = selectedMice();
  if (!ms.length) { toast('Tick the mice to move first'); return; }
  const body = `<p>${ms.length} mice: ${ms.map(m => esc(m.name)).join(', ')}</p><div class="form">
    ${fld('Move to cage', 'cage', '', { list: 'dl-cages', ph: 'cage name' })}${fld('Date', 'date', fmtDate(todayISO()))}
    <label class="f"><span>If the cage doesn't exist</span><select name="create"><option value="">Stop and tell me</option><option value="Holding">Create it (Holding)</option><option value="Breeding">Create it (Breeding)</option><option value="Experimental">Create it (Experimental)</option></select></label></div>`;
  modal({
    title: 'Move mice', body, okText: 'Move', ok: el => {
      const f = readForm(el), errs = []; const date = dateOrErr(f.date, 'Date', errs) || todayISO();
      if (!f.cage) errs.push('Enter a cage');
      let cage = cageNamed(f.cage);
      if (cage && cage.status !== 'Active') errs.push(`Cage ${cage.name} is closed. Reopen it first.`);
      if (!cage && f.cage && !f.create) errs.push(`No cage named "${f.cage}". Choose "Create it" or pick an existing cage.`);
      if (errs.length) return errs.join(' · ');
      mutate(`Moved ${ms.length} mice to cage ${f.cage}`, () => {
        if (!cage) { cage = { id: uid('c'), name: f.cage, purpose: f.create, status: 'Active', line: '', barcode: '', building: DB.settings.building, room: DB.settings.room, rack: '', side: '', row: '', col: '', owner: DB.settings.owner, protocol: DB.settings.protocol, paired: f.create === 'Breeding' ? date : '', notes: '', wfbr: null, created: todayISO() }; DB.cages.push(cage); }
        for (const m of ms) { const x = DB.mice.find(z => z.id === m.id); (x.history = x.history || []).push({ date, from: cageOf(x.cageId)?.name || '', to: cage.name, note: 'moved' }); x.cageId = cage.id; }
      }, () => ms.map(m => `${m.name} (from ${cageOf(m.cageId)?.name || '—'})`).join('; '));
      return true;
    }
  });
}
function openStatusForm() {
  const ms = selectedMice();
  if (!ms.length) { toast('Tick the mice first'); return; }
  const body = `<p>${ms.length} mice: ${ms.map(m => esc(m.name)).join(', ')}</p><div class="form">${fld('New status', 'status', 'Sacrificed', { options: MOUSE_STATUSES })}${fld('Date', 'date', fmtDate(todayISO()))}${fld('Note', 'note', '', { wide: true })}</div>`;
  modal({
    title: 'Set status', body, ok: el => {
      const f = readForm(el), errs = []; const date = dateOrErr(f.date, 'Date', errs) || todayISO();
      if (errs.length) return errs.join(' · ');
      mutate(`Set ${ms.length} mice to ${f.status}`, () => {
        for (const m of ms) { const x = DB.mice.find(z => z.id === m.id); x.status = f.status; x.endDate = f.status === 'Live' ? '' : date; if (f.note) x.notes = [x.notes, f.note].filter(Boolean).join(' · '); }
      }, () => ms.map(m => m.name).join('; ') + (f.note ? ' · ' + f.note : ''));
      const emptied = [...new Set(ms.map(m => m.cageId))].map(cageOf).filter(c => c && c.status === 'Active' && !miceIn(c.id).length);
      if (emptied.length && confirm(`Cage${emptied.length > 1 ? 's' : ''} ${emptied.map(c => c.name).join(', ')} now ha${emptied.length > 1 ? 've' : 's'} no live mice. Close ${emptied.length > 1 ? 'them' : 'it'}?`))
        mutate(`Closed cage${emptied.length > 1 ? 's' : ''} ${emptied.map(c => c.name).join(', ')} (empty)`, () => emptied.forEach(c => { const x = DB.cages.find(z => z.id === c.id); x.status = 'Inactive'; x.closed = date; }));
      return true;
    }
  });
}

/* ---------- Litters ---------- */
function openLitterForm(id, cageId) {
  const l = id ? DB.litters.find(x => x.id === id) : { cageId, paired: cageOf(cageId)?.paired || '', born: '', pups: '', weaned: '', females: '', males: '', status: 'Active', comments: '' };
  const c = cageOf(l.cageId);
  const body = `<div class="form">
    ${fld('Date paired', 'paired', fmtDate(l.paired), { hint: dateHint })}${fld('Litter born (LDOB)', 'born', fmtDate(l.born), { hint: dateHint })}
    ${fld('Pups', 'pups', l.pups)}${fld('Females', 'females', l.females)}${fld('Males', 'males', l.males)}
    ${fld('Date weaned', 'weaned', fmtDate(l.weaned))}${fld('Status', 'status', l.status, { options: [['Active', 'Active (not weaned)'], ['Weaned', 'Weaned'], ['Dead', 'Dead / lost'], ['Past', 'Past (old record)']] })}
    ${fld('Comments', 'comments', l.comments, { wide: true })}</div>
    <p class="small muted">Wean-by date is the birth date + ${DB.settings.weanDays} days. To wean pups into new cages with mouse records, use "Wean…" instead of typing a wean date here.</p>`;
  const el = modal({
    title: `${id ? 'Edit' : 'Add'} litter · cage ${c?.name}`, body, wide: true,
    extraBtns: id ? `<button class="btn danger" data-del style="margin-right:auto">Delete</button>` : '',
    ok: el => {
      const f = readForm(el), errs = [];
      const paired = dateOrErr(f.paired, 'Date paired', errs), born = dateOrErr(f.born, 'Born', errs), weaned = dateOrErr(f.weaned, 'Date weaned', errs);
      if (born && paired && born < paired) errs.push('Born before the pairing date');
      if (weaned && born && weaned < born) errs.push('Weaned before born');
      if (errs.length) return errs.join(' · ');
      if (born && paired && daysBetween(paired, born) < 19 && !confirm(`Born ${daysBetween(paired, born)} days after pairing (gestation is ~19–21 days). Save anyway?`)) return 'Check the dates';
      if (born && !id && littersOf(l.cageId).some(x => x.born === born)) return 'This cage already has a litter born on that date';
      const data = { paired, born, pups: f.pups, females: f.females, males: f.males, weaned, status: weaned && f.status === 'Active' ? 'Weaned' : f.status, comments: f.comments };
      if (!id) mutate(`Added litter to cage ${c.name}${born ? ' born ' + fmtDate(born) : ''}`, () => { DB.litters.push({ id: uid('l'), cageId: l.cageId, ...data }); const cc = DB.cages.find(z => z.id === l.cageId); if (!cc.paired && paired) cc.paired = paired; });
      else {
        const changes = Object.keys(data).filter(k => (data[k] ?? '') !== (l[k] ?? '')).map(k => `${k}: "${l[k] ?? ''}" → "${data[k]}"`);
        if (changes.length) mutate(`Edited litter in cage ${c.name} (born ${fmtDate(l.born) || '?'})`, () => Object.assign(DB.litters.find(z => z.id === id), data), changes.join('; '));
      }
      return true;
    }
  });
  const del = el.querySelector('[data-del]');
  if (del) del.onclick = () => { if (confirm('Delete this litter record?')) { mutate(`Deleted litter in cage ${c.name} (born ${fmtDate(l.born) || '?'})`, () => { DB.litters = DB.litters.filter(z => z.id !== id); for (const k of DB.cages) if (k.wfbr?.litterId === id) k.wfbr.litterId = ''; }, JSON.stringify(l)); el.remove(); } };
}

/* Wean: creates holding cages tied to the breeder (WFBR), mouse records with dam/sire, and closes the litter. */
function openWeanForm(litterId) {
  const l = DB.litters.find(x => x.id === litterId), c = cageOf(l.cageId);
  const ms = miceIn(c.id), dams = ms.filter(m => m.sex === 'F'), sires = ms.filter(m => m.sex === 'M');
  const num = v => /^\d+$/.test(String(v).trim()) ? String(v).trim() : '';
  const body = `<p><b>Cage ${esc(c.name)}</b> · ${esc(c.line)} · litter born ${fmtDate(l.born) || '?'}${l.pups ? ', ' + esc(l.pups) + ' pups' : ''}</p>
  <div class="form">
    ${fld('Date weaned', 'date', fmtDate(todayISO()))}
    ${fld('Pup strain', 'strain', canonStrain(String(c.line || '').replace(/\s*\([^)]*\)/g, '')).name || (dams[0] && dams[0].strain) || '', { list: 'dl-strains', hint: 'genotype if known; you can edit each mouse later' })}
    ${fld('Females', 'nf', num(l.females), { type: 'number' })}${fld('Female cage', 'cf', '', { list: 'dl-cages', ph: 'new or existing cage' })}
    ${fld('Males', 'nm', num(l.males), { type: 'number' })}${fld('Male cage', 'cm', '', { list: 'dl-cages', ph: 'new or existing cage' })}
    ${fld('Dam', 'dam', dams.map(m => m.name).join(' / '), { wide: true })}${fld('Sire', 'sire', sires.map(m => m.name).join(' / '), { wide: true })}
    ${fld('Ear tags start at', 'tag0', '', { hint: 'optional: numbers tags in order, females first' })}
  </div>
  <p class="small muted">New cages are set to Holding, linked to breeder ${esc(c.name)} (WFBR), and appear under "Cages without a rack position" in the Rack view. Mice are named <i>strain DOB #cage</i>.</p>`;
  modal({
    title: 'Wean litter', body, wide: true, okText: 'Wean', ok: el => {
      const f = readForm(el), errs = [];
      const date = dateOrErr(f.date, 'Date weaned', errs) || todayISO();
      const nf = +f.nf || 0, nm = +f.nm || 0;
      if (nf < 0 || nm < 0 || nf > 30 || nm > 30) errs.push('Check the pup numbers');
      if (nf && !f.cf) errs.push('Enter a cage for the females');
      if (nm && !f.cm) errs.push('Enter a cage for the males');
      if (l.born && date < l.born) errs.push('Wean date is before the birth date');
      for (const n of [f.cf, f.cm]) { const cc = n && cageNamed(n); if (cc && cc.status !== 'Active') errs.push(`Cage ${cc.name} is closed`); if (cc && cc.id === c.id) errs.push('Pick a cage other than the breeder cage'); }
      if (errs.length) return errs.join(' · ');
      if (!nf && !nm && !confirm('No pups entered. Mark the litter as weaned without creating mice?')) return 'Enter the number of females and males';
      let strain = f.strain;
      if (strain) { const cs = canonStrain(strain); strain = cs.name; if (!cs.known && !confirm(`Pup strain "${strain}" isn't in the strain list. Add it as a new strain?`)) return 'Pick a strain from the list or confirm the new one'; }
      else if (!confirm('No pup strain: mice will be named "Unknown …". Continue?')) return 'Enter the pup strain';
      const plan = [];
      if (nf) plan.push({ sex: 'F', n: nf, cage: f.cf }); if (nm) plan.push({ sex: 'M', n: nm, cage: f.cm });
      let tag = /^\d+$/.test(f.tag0) ? +f.tag0 : null;
      const created = [];
      mutate(`Weaned litter of cage ${c.name} (born ${fmtDate(l.born) || '?'}): ${nf} ♀ → ${f.cf || '—'}, ${nm} ♂ → ${f.cm || '—'}`, () => {
        if (strain && !DB.strains.some(s => s.name === strain)) DB.strains.push({ name: strain, aliases: [] });
        invalidate();
        const taken = takenMouseNames();
        for (const p of plan) {
          let cage = cageNamed(p.cage);
          if (!cage) { cage = { id: uid('c'), name: p.cage, purpose: 'Holding', status: 'Active', line: c.line, barcode: '', building: c.building, room: c.room, rack: '', side: '', row: '', col: '', owner: c.owner, protocol: c.protocol, paired: '', notes: '', wfbr: { cageId: c.id, litterId: l.id }, created: date }; DB.cages.push(cage); invalidate(); created.push(cage.name); }
          else if (!cage.wfbr) DB.cages.find(z => z.id === cage.id).wfbr = { cageId: c.id, litterId: l.id };
          const names = uniqueNames(Array(p.n).fill(mouseBaseName(strain, l.born, cage.name)), taken);
          names.forEach(n => taken.add(n));
          for (const n of names) DB.mice.push({ id: uid('m'), name: n, sex: p.sex, dob: l.born || '', strain, earTag: tag != null ? String(tag++) : '', status: 'Live', endDate: '', dam: f.dam, sire: f.sire, color: '', protocol: c.protocol, owner: c.owner, notes: '', cageId: cage.id, wfbr: c.id, litterId: l.id, history: [{ date, to: cage.name, note: 'weaned from ' + c.name }] });
        }
        Object.assign(DB.litters.find(z => z.id === l.id), { weaned: date, status: 'Weaned', females: nf ? String(nf) : l.females, males: nm ? String(nm) : l.males });
      });
      if (created.length) toast(`Created cage${created.length > 1 ? 's' : ''} ${created.join(', ')}. Place ${created.length > 1 ? 'them' : 'it'} in the Rack view.`, 4500);
      return true;
    }
  });
}

/* ---------- Strain edit / merge ---------- */
/* ---------- Strain list import / export ---------- */
const STRAIN_COLS = ['Strain', 'Alternate spellings'];
const strainListRows = () => [...DB.strains].sort((a, b) => natCmp(a.name, b.name)).map(s => ({ Strain: s.name, 'Alternate spellings': (s.aliases || []).join(', ') }));
/** Read a strain list file into [{row, name, aliases}]. Column A = strain, B = alternate spellings unless headers say otherwise. */
async function readStrainFile(file) {
  const wb = /\.(xlsx|xlsm|xls|ods)$/i.test(file.name) ? XLSX.read(await file.arrayBuffer(), { type: 'array' })
    : (t => XLSX.read(t, { type: 'string', raw: true, FS: t.split('\n')[0].includes('\t') ? '\t' : undefined }))((await file.text()).replace(/^﻿/, ''));
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '', blankrows: false });
  const isName = h => ['strain', 'strainname', 'name', 'line'].includes(hkey(h)), isAlias = h => /alias|alternate|spelling|othername/.test(hkey(h));
  let hi = aoa.findIndex(r => r.some(isName)), ni = 0, ai = 1;
  if (hi >= 0) { ni = aoa[hi].findIndex(isName); ai = aoa[hi].findIndex(isAlias); }
  return aoa.slice(hi + 1).map((r, i) => ({ row: hi + i + 2, name: norm(r[ni]), aliases: ai < 0 ? [] : String(r[ai] ?? '').split(/[,;]/).map(norm).filter(Boolean) }))
    .filter(r => r.name || r.aliases.length);
}
/** Work out what each file row would do. Nothing already in the list is changed or removed; only new strains and new spellings are added. */
function planStrainImport(rows) {
  const owner = new Map(); // lowercase name or spelling -> strain it belongs to
  const add = (key, strain) => owner.set(lc(key), strain);
  DB.strains.forEach(s => { add(s.name, s.name); (s.aliases || []).forEach(a => add(a, s.name)); });
  const seen = new Map(), out = [];
  for (const r of rows) {
    const p = { row: r.row, name: r.name, add: [], notes: [], result: '' };
    out.push(p);
    if (!r.name) { p.result = 'skip'; p.notes.push('No strain name; row skipped'); continue; }
    const hit = owner.get(lc(r.name));
    const existing = DB.strains.find(s => lc(s.name) === lc(r.name));
    if (hit && !existing && !seen.has(lc(r.name))) { p.result = 'skip'; p.notes.push(`"${r.name}" is already an alternate spelling of ${hit}; row skipped`); continue; }
    if (seen.has(lc(r.name))) p.notes.push(`Also listed on row ${seen.get(lc(r.name))}; spellings combined`);
    else seen.set(lc(r.name), r.row);
    const target = existing ? existing.name : hit || r.name;
    if (existing && existing.name !== r.name) p.notes.push(`Matches existing strain "${existing.name}"`);
    if (!hit) add(r.name, r.name);
    for (const a of r.aliases) {
      const o = owner.get(lc(a));
      if (o === target) continue;
      if (o) { p.notes.push(`Spelling "${a}" already belongs to ${o}; not added`); continue; }
      add(a, target); p.add.push(a);
    }
    p.target = target;
    p.result = hit ? (p.add.length ? 'spellings' : 'same') : 'new';
  }
  return out;
}
function openStrainImport(rows, fileName) {
  if (!rows.length) { alert(`No strains found in ${fileName}. The file needs a Strain column (and optionally Alternate spellings).`); return; }
  const plan = planStrainImport(rows);
  const nNew = plan.filter(p => p.result === 'new').length, nSp = plan.reduce((n, p) => n + p.add.length, 0), nSkip = plan.filter(p => p.result === 'skip').length, nWarn = plan.filter(p => p.notes.length).length;
  const label = { new: '<span class="badge b-ok">New strain</span>', spellings: '<span class="badge">Adds spellings</span>', same: '<span class="muted small">Already in list</span>', skip: '<span class="badge b-warn">Skipped</span>' };
  const body = `<p>${esc(fileName)}: ${rows.length} rows. <b>${nNew}</b> new strains and <b>${nSp}</b> new spellings will be added.${nSkip ? ` <b>${nSkip}</b> rows skipped.` : ''} Nothing already in your list is changed or removed.</p>
    ${nWarn ? `<div class="banner warn">${nWarn} rows need a look; see the notes column.</div>` : ''}
    <div class="tablewrap" style="max-height:55vh"><table class="t"><tr><th>Row</th><th>Strain</th><th>Spellings to add</th><th>Result</th><th>Notes</th></tr>
    ${plan.map(p => `<tr><td class="small muted">${p.row}</td><td><b>${esc(p.name)}</b></td><td class="small">${esc(p.add.join(', '))}</td><td>${label[p.result]}</td><td class="small">${p.notes.map(esc).join('<br>')}</td></tr>`).join('')}</table></div>`;
  modal({
    title: 'Import strain list', body, wide: true, okText: nNew || nSp ? `Add ${nNew} strains, ${nSp} spellings` : 'Nothing to add',
    ok: () => {
      if (!nNew && !nSp) return true;
      mutate(`Imported strain list ${fileName}`, () => {
        for (const p of plan) {
          if (p.result === 'new' && !DB.strains.some(s => lc(s.name) === lc(p.target))) DB.strains.push({ name: p.target, aliases: [] });
          if (!p.add.length) continue;
          const s = DB.strains.find(x => x.name === p.target);
          s.aliases = [...(s.aliases || []), ...p.add.filter(a => !(s.aliases || []).some(x => lc(x) === lc(a)))];
        }
      }, `${nNew} new strains, ${nSp} new spellings${nSkip ? `, ${nSkip} rows skipped` : ''}`);
      return true;
    }
  });
}

function openStrainForm(name) {
  const s = name ? DB.strains.find(x => x.name === name) : { name: '', aliases: [] };
  const body = `<div class="form">${fld('Strain name', 'name', s.name, { wide: true, hint: name ? 'Renaming to an existing strain merges the two (mice and aliases move over).' : '' })}${fld('Aliases (comma separated)', 'aliases', (s.aliases || []).join(', '), { wide: true })}</div>`;
  const el = modal({
    title: name ? 'Edit strain' : 'Add strain', body, wide: true,
    extraBtns: name ? `<button class="btn danger" data-del style="margin-right:auto">Delete</button>` : '',
    ok: el => {
      const f = readForm(el); if (!f.name) return 'Name is required';
      const aliases = f.aliases.split(',').map(norm).filter(Boolean);
      const target = DB.strains.find(x => lc(x.name) === lc(f.name) && x !== s);
      if (!name) { if (target) return 'That strain already exists'; mutate(`Added strain ${f.name}`, () => DB.strains.push({ name: f.name, aliases })); return true; }
      const n = DB.mice.filter(m => m.strain === name).length;
      if (target) {
        if (!confirm(`Merge "${name}" into "${target.name}"? ${n} mice will change strain, and "${name}" becomes an alias.`)) return 'Cancelled';
        mutate(`Merged strain ${name} into ${target.name}`, () => { const t = DB.strains.find(x => x.name === target.name); t.aliases = [...new Set([...(t.aliases || []), name, ...aliases])]; DB.strains = DB.strains.filter(x => x.name !== name); DB.mice.forEach(m => { if (m.strain === name) m.strain = target.name; }); }, `${n} mice changed`);
        return true;
      }
      mutate(`Edited strain ${name}${f.name !== name ? ' → ' + f.name : ''}`, () => { const x = DB.strains.find(z => z.name === name); x.name = f.name; x.aliases = f.name !== name ? [...new Set([...aliases, name])] : aliases; if (f.name !== name) DB.mice.forEach(m => { if (m.strain === name) m.strain = f.name; }); }, f.name !== name ? `${n} mice renamed; old name kept as alias` : 'aliases: ' + aliases.join(', '));
      return true;
    }
  });
  const del = el.querySelector('[data-del]');
  if (del) del.onclick = () => {
    const n = DB.mice.filter(m => m.strain === name).length;
    if (n) { alert(`${n} mice use this strain. Merge it into another strain instead.`); return; }
    if (confirm(`Delete strain ${name}?`)) { mutate(`Deleted strain ${name}`, () => DB.strains = DB.strains.filter(x => x.name !== name)); el.remove(); }
  };
}

/* ---------- Printing ---------- */
function printHTML(title, html) {
  $('#print-area').innerHTML = `<div class="pa">${html}</div>`;
  const old = document.title; document.title = title;
  window.print();
  setTimeout(() => { document.title = old; }, 500);
}
function printScope() {
  const rk = $('#prRack')?.value || '', pp = $('#prPurpose')?.value || '';
  return DB.cages.filter(c => c.status === 'Active' && (!rk || String(c.rack) === rk) && (!pp || c.purpose === pp)).sort(locCmp);
}
const locCmp = (a, b) => natCmp(a.rack || 'zzz', b.rack || 'zzz') || natCmp(a.side, b.side) || (+a.row || 999) - (+b.row || 999) || (+a.col || 999) - (+b.col || 999) || natCmp(a.name, b.name);
const printHead = t => `<h1>${esc(t)}</h1><div class="sub">${esc([piLine(), 'printed ' + fmtDate(todayISO())].filter(Boolean).join(' · '))}</div>`;
function printColony() {
  const cs = printScope();
  printHTML('Colony list', printHead('Colony list') + `<table><tr><th>Cage</th><th>Location</th><th>Purpose</th><th>Line</th><th>Mice</th><th>Sex</th><th>DOB</th><th>Age</th><th>Strain</th><th>Tag</th><th>Litter / wean by</th></tr>
  ${cs.map(c => { const ms = miceIn(c.id).sort((a, b) => natCmp(a.sex, b.sex) || natCmp(a.name, b.name)); const l = currentLitter(c); const lt = l && l.born ? `${fmtDate(l.born)}${l.pups ? ' (' + esc(l.pups) + ')' : ''} → ${fmtDate(weanDue(l))}` : ''; const span = Math.max(ms.length, 1);
    const head = `<td rowspan="${span}"><b>${esc(c.name)}</b><br>${esc(cageTitleText(c))}${c.wfbr?.cageId ? `<br>WFBR ${esc(cageOf(c.wfbr.cageId)?.name || '')}` : ''}</td><td rowspan="${span}">${esc(cageLocation(c))}</td><td rowspan="${span}">${esc(c.purpose)}</td><td rowspan="${span}">${esc(c.line)}</td>`;
    if (!ms.length) return `<tr>${head}<td colspan="6"><i>no live mice</i></td><td>${lt}</td></tr>`;
    return ms.map((m, i) => `<tr>${i === 0 ? head : ''}<td>${esc(m.name)}</td><td>${m.sex}</td><td class="d">${fmtDate(m.dob)}</td><td class="d">${ageText(m.dob)}</td><td>${esc(m.strain)}</td><td>${esc(m.earTag)}</td>${i === 0 ? `<td rowspan="${span}">${lt}</td>` : ''}</tr>`).join(''); }).join('')}</table>
  <div class="sub">${cs.length} cages · ${cs.reduce((n, c) => n + miceIn(c.id).length, 0)} live mice</div>`);
}
function printBreeding() {
  const cs = DB.cages.filter(c => c.status === 'Active' && c.purpose === 'Breeding').sort((a, b) => ((weanDue(currentLitter(a) || {}) || '9999').localeCompare(weanDue(currentLitter(b) || {}) || '9999')) || natCmp(a.name, b.name));
  printHTML('Breeding list', printHead('Breeding cages and wean dates') + `<table><tr><th>Cage</th><th>Location</th><th>Line</th><th>Breeders</th><th>Paired</th><th>Litter born</th><th>Pups</th><th>Wean by</th><th>Done</th></tr>
  ${cs.map(c => { const l = currentLitter(c); return `<tr><td><b>${esc(c.name)}</b></td><td>${esc(cageLocation(c))}</td><td>${esc(c.line)}</td><td>${miceIn(c.id).map(m => `${m.sex} ${esc(m.strain)} ${fmtDate(m.dob)}`).join('<br>')}</td><td>${fmtDate(c.paired)}</td><td>${l ? fmtDate(l.born) : ''}</td><td>${l ? esc(l.pups) : ''}</td><td><b>${l && l.born ? fmtDate(weanDue(l)) : ''}</b></td><td style="width:40px"></td></tr>`; }).join('')}</table>`);
}
function cardHTML(c) {
  const ms = miceIn(c.id).sort((a, b) => natCmp(a.sex, b.sex) || natCmp(a.name, b.name));
  const parent = c.wfbr?.cageId ? cageOf(c.wfbr.cageId) : null;
  const top = `<div class="ch"><div><div class="line">${esc(cageTitleText(c))}</div>${c.line ? `<div>${esc(c.line)}</div>` : ''}<div>${esc([c.purpose, (c.owner || DB.settings.pi) && 'PI ' + (c.owner || DB.settings.pi), c.protocol].filter(Boolean).join(' · '))}</div>${parent ? `<div><b>WFBR #${esc(parent.name)}</b></div>` : ''}</div><div style="text-align:right"><div class="cnm">#${esc(c.name)}</div><div>${esc(cageLocation(c))}</div><div style="font-size:9px">${esc(c.barcode)}</div></div></div>`;
  if (c.purpose === 'Breeding') {
    const ls = littersOf(c.id).slice(-6);
    return `<div class="card">${top}<table><tr><th></th><th>ID</th><th>DOB</th><th>Strain</th></tr>${ms.map(m => `<tr><td>${m.sex === 'F' ? '♀' : m.sex === 'M' ? '♂' : '?'}</td><td>${esc(m.earTag)}</td><td>${fmtDate(m.dob)}</td><td>${esc(m.strain)}</td></tr>`).join('')}</table>
      <table style="margin-top:2mm"><tr><th>Paired</th><th>LDOB</th><th>Pups</th><th>DOW</th><th>♀</th><th>♂</th><th>Comments</th></tr>${ls.map(l => `<tr style="${isOpenLitter(l) ? '' : 'color:#777'}"><td>${fmtDate(l.paired)}</td><td>${fmtDate(l.born)}</td><td>${esc(l.pups)}</td><td>${fmtDate(l.weaned) || (isOpenLitter(l) && l.born ? 'by ' + fmtDate(weanDue(l)) : '')}</td><td>${esc(l.females)}</td><td>${esc(l.males)}</td><td>${esc(l.comments)}</td></tr>`).join('')}${'<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(Math.max(0, 3 - ls.length))}</table></div>`;
  }
  return `<div class="card">${top}<table><tr><th>Name</th><th>Sex</th><th>DOB</th><th>Tag</th></tr>${ms.map(m => `<tr><td>${esc(m.name)}</td><td>${m.sex}</td><td>${fmtDate(m.dob)}</td><td>${esc(m.earTag)}</td></tr>`).join('')}</table>${c.notes ? `<div style="margin-top:2mm">${esc(c.notes)}</div>` : ''}</div>`;
}
function printCards(cs) { printHTML('Cage cards', `<div class="cards">${cs.map(cardHTML).join('')}</div>`); }
function rackMapHTML(rk, sd) {
  const conf = DB.settings.racks.find(r => String(r.name) === rk) || { rows: 7, cols: 10 };
  const here = DB.cages.filter(c => c.status === 'Active' && String(c.rack) === rk && (!sd || c.side === sd));
  const rows = Math.max(+conf.rows, ...here.map(c => +c.row || 0)), cols = Math.max(+conf.cols, ...here.map(c => +c.col || 0));
  let g = `<div class="prack" style="grid-template-columns:6mm repeat(${cols},1fr)"><div class="h"></div>`;
  for (let j = 1; j <= cols; j++) g += `<div class="h">${j}</div>`;
  for (let i = 1; i <= rows; i++) for (let j = 1; j <= cols; j++) {
    if (j === 1) g += `<div class="h" style="align-self:center">${rowLabel(i)}</div>`;
    const c = here.find(x => +x.row === i && +x.col === j);
    if (!c) { g += '<div></div>'; continue; }
    const n = cageCounts(c), l = currentLitter(c);
    g += `<div><b>${esc(cageTitleText(c))}</b><br>#${esc(c.name)} ${c.purpose === 'Breeding' ? '(B)' : ''}<br>${n.F}♀ ${n.M}♂${l && l.born ? `<br>wean ${fmtDate(weanDue(l)).slice(0, -5)}` : ''}</div>`;
  }
  return `<div class="grp" style="page-break-after:always">${printHead(`Rack ${rk}${sd ? ' · Side ' + sd : ''}`)}${g}</div></div>`;
}

/* ---------- Event wiring ---------- */
const ACTIONS = {
  'open-cage': el => go('cage/' + el.dataset.id),
  'pick-folder': () => Store.pickFolder(), 'move-folder': () => Store.moveFolder(),
  'forget-folder': () => { if (confirm(`Stop saving to the folder "${Store.dir?.name}"?\n\nNothing is deleted: the folder keeps its files and the data stays open here. The app will ask you to choose a folder the next time it opens.`)) Store.forgetFolder(); },
  'save-file': () => Store.saveToFile(), 'reconnect': () => Store.reconnect(), 'save-now': async () => { if (Store.state === 'error') Store.state = Store.dir ? 'ok' : 'none'; await Store.saveNow(); render(); toast(Store.state === 'ok' ? 'Saved' : 'Saved in browser only'); },
  'rack-pick': el => { UI.rack.rack = el.dataset.rack; saveUI(); render(); }, 'side-pick': el => { UI.rack.side = el.dataset.side; saveUI(); render(); },
  'slot-empty': el => {
    const rk = UI.rack.rack, sd = (DB.settings.sides || []).length ? UI.rack.side : '', row = el.dataset.row, col = el.dataset.col;
    const un = DB.cages.filter(c => c.status === 'Active' && !(c.rack && c.row && c.col)).sort((a, b) => natCmp(a.name, b.name));
    const body = `<p>Rack ${esc(rk)}${sd ? ' · Side ' + esc(sd) : ''} · Row ${rowLabel(row)} · Column ${col}</p>${un.length ? `<label class="f"><span>Put an unplaced cage here</span><select name="cid"><option value="">—</option>${un.map(c => `<option value="${c.id}">${esc(c.name)} · ${esc(c.line || c.purpose)}</option>`).join('')}</select></label>` : '<p class="muted">No unplaced cages.</p>'}`;
    modal({ title: 'Empty slot', body, okText: 'Place cage', extraBtns: `<button class="btn" data-newhere style="margin-right:auto">+ New cage here</button>`, ok: m => { const id = readForm(m).cid; if (!id) return 'Pick a cage, or create a new one'; const c = cageOf(id); mutate(`Cage ${c.name}: placed at Rack ${rk}${sd ? ' Side ' + sd : ''} R${row} C${col}`, () => Object.assign(DB.cages.find(z => z.id === id), { rack: rk, side: sd, row, col })); return true; } })
      .querySelector('[data-newhere]').onclick = e => { e.target.closest('.modal-bg').remove(); openCageForm(null, { rack: rk, side: sd, row, col }); };
  },
  'cage-new': el => openCageForm(null, { rack: el.dataset.rack || '', side: el.dataset.side || '', purpose: el.dataset.purpose }),
  'cage-edit': el => openCageForm(el.dataset.id),
  'cage-close': el => {
    const c = cageOf(el.dataset.id), n = miceIn(c.id).length;
    if (n && !confirm(`Cage ${c.name} still has ${n} live mice. Close it anyway? (The mice stay recorded in it; move them or set their status first if they've left.)`)) return;
    if (!n && !confirm(`Close cage ${c.name}? It leaves the rack view; you can reopen it later.`)) return;
    mutate(`Closed cage ${c.name}`, () => { const x = DB.cages.find(z => z.id === c.id); x.status = 'Inactive'; x.closed = todayISO(); }, `was at ${cageLocation(c)}`);
  },
  'cage-reopen': el => { const c = cageOf(el.dataset.id); mutate(`Reopened cage ${c.name}`, () => { const x = DB.cages.find(z => z.id === c.id); x.status = 'Active'; x.closed = ''; }); },
  'mouse-new': el => openMouseForm(null, el.dataset.cage || ''), 'mouse-edit': el => openMouseForm(el.dataset.id),
  'mice-move': () => openMoveForm(), 'mice-status': () => openStatusForm(),
  'sel-all': el => $$('.msel', el.closest('table')).forEach(c => c.checked = el.checked),
  'toggle-gone': () => { UI.cageShowGone = !UI.cageShowGone; saveUI(); },
  'litter-new': el => openLitterForm(null, el.dataset.cage), 'litter-edit': el => openLitterForm(el.dataset.id), 'litter-wean': el => openWeanForm(el.dataset.id),
  'strain-new': () => openStrainForm(), 'strain-edit': el => openStrainForm(el.dataset.name),
  'strain-export': () => { download(`strain-list-${todayISO()}.csv`, '\ufeff' + toCSV(strainListRows(), STRAIN_COLS), 'text/csv'); logEntry(`Exported strain list (${DB.strains.length} strains)`); Store.schedule(); },
  'strain-import': () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.tsv,.txt,.xlsx,.xls';
    inp.onchange = async () => { try { openStrainImport(await readStrainFile(inp.files[0]), inp.files[0].name); } catch (e) { alert('Could not read the strain list: ' + e.message); } };
    inp.click();
  },
  'strain-adopt': () => mutate('Added strains used by mice to the strain list', () => { const have = new Set(DB.strains.map(s => s.name)); [...new Set(DB.mice.map(m => m.strain).filter(s => s && !have.has(s)))].forEach(s => DB.strains.push({ name: s, aliases: [] })); }),
  'imp-paste': () => startImport(null, $('#impText').value), 'imp-cancel': () => { IMP = null; render(); }, 'imp-commit': () => commitImport(),
  'imp-template': () => download('mLIMS-import-template.csv', toCSV([], [...MLIMS_COLS, ...EXTRA_COLS]), 'text/csv'),
  'imp-template-litters': () => download('matings-litters-template.csv', toCSV([], LITTER_COLS), 'text/csv'),
  'exp-animals': el => { const rows = animalRows($('#expAll')?.checked), cols = [...MLIMS_COLS, ...EXTRA_COLS], n = `colony-animals-${todayISO()}`; el.dataset.fmt === 'csv' ? download(n + '.csv', '﻿' + toCSV(rows, cols), 'text/csv') : xlsxDownload(n + '.xlsx', { Animals: { rows, cols } }); logEntry(`Exported animals (${rows.length} rows, ${el.dataset.fmt})`); Store.schedule(); },
  'exp-litters': el => { const rows = litterRows(), n = `colony-litters-${todayISO()}`; el.dataset.fmt === 'csv' ? download(n + '.csv', '﻿' + toCSV(rows, LITTER_COLS), 'text/csv') : xlsxDownload(n + '.xlsx', { Litters: { rows, cols: LITTER_COLS } }); },
  'exp-workbook': () => {
    const cages = DB.cages.slice().sort(locCmp).map(c => { const n = cageCounts(c), l = currentLitter(c); return { Cage: c.name, Status: c.status === 'Active' ? 'Active' : 'Closed', Purpose: c.purpose, Line: c.line, Rack: c.rack, Side: c.side, Row: rowLabel(c.row), Column: c.col, Females: n.F, Males: n.M, 'Date Paired': fmtDate(c.paired), 'Open litter born': l ? fmtDate(l.born) : '', 'Wean by': l && l.born ? fmtDate(weanDue(l)) : '', 'Weaned from (WFBR)': c.wfbr?.cageId ? cageOf(c.wfbr.cageId)?.name || '' : '', Barcode: c.barcode, Building: c.building, Room: c.room, Owner: c.owner, Protocol: c.protocol, Notes: c.notes }; });
    const mice = animalRows(true).map(r => ({ ...r, 'Weaned from (WFBR)': (() => { const m = DB.mice.find(x => x.name === r['Animal Name']); return m?.wfbr ? cageOf(m.wfbr)?.name || '' : ''; })() }));
    const log = DB.log.map(e => ({ When: new Date(e.ts).toLocaleString(), Change: e.msg, Details: e.details }));
    xlsxDownload(`colony-${todayISO()}.xlsx`, { Cages: { rows: cages, cols: Object.keys(cages[0] || { Cage: 1 }) }, Mice: { rows: mice, cols: [...MLIMS_COLS, ...EXTRA_COLS, 'Weaned from (WFBR)'] }, Litters: { rows: litterRows(), cols: LITTER_COLS }, 'Change log': { rows: log, cols: ['When', 'Change', 'Details'] } });
  },
  'exp-report': () => { try { exportReport(); } catch (e) { console.error(e); alert('Could not make the report: ' + e.message); } },
  'export-log': () => download(`colony-log-${todayISO()}.csv`, '﻿' + toCSV(DB.log.map(e => ({ When: new Date(e.ts).toLocaleString(), Change: e.msg, Details: e.details })), ['When', 'Change', 'Details']), 'text/csv'),
  'backup-download': () => download(`colony-backup-${stamp()}.json`, JSON.stringify(DB, null, 1), 'application/json'),
  'backup-restore': () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => {
      try {
        const j = JSON.parse(await inp.files[0].text());
        if (!isColonyData(j)) throw new Error('Not a colony backup file');
        if ((DB.cages.length || DB.mice.length) && !confirm(`Replace ALL current data (${DB.cages.length} cages, ${DB.mice.length} mice) with this file (${j.cages.length} cages, ${j.mice.length} mice, saved ${j.meta?.savedAt ? new Date(j.meta.savedAt).toLocaleString() : '?'})?\n\nUndo (top bar) brings the current data back if you change your mind.`)) return;
        const keepLog = DB.log;
        mutate(`Opened data file ${inp.files[0].name}`, () => { DB = upgrade(j); DB.log = keepLog; DB.meta.changesSinceFile = -1; /* the next save counts 1, so a freshly opened file shows no unsaved changes */ });
      } catch (e) { alert('Could not restore: ' + e.message); }
    };
    inp.click();
  },
  'settings-save': () => {
    const f = readForm($('#setForm')), errs = [];
    const racks = f.racks.split('\n').map(s => s.split(',').map(norm)).filter(p => p[0]).map(([name, rows, cols]) => ({ name, rows: +rows || 7, cols: +cols || 10 }));
    const series = f.series.split('\n').map(s => s.split(',').map(norm)).filter(p => p[0]).map(([label, base, suffix]) => ({ label, base: +base, suffix: suffix || '' }));
    if (series.some(s => !s.base)) errs.push('Each barcode series needs a numeric base');
    if (!racks.length) errs.push('Add at least one rack');
    const wd = +f.weanDays; if (!(wd >= 14 && wd <= 35)) errs.push('Wean age should be 14–35 days');
    if (errs.length) { alert(errs.join('\n')); return; }
    mutate('Changed settings', () => Object.assign(DB.settings, { pi: f.pi, owner: f.owner, protocol: f.protocol, building: f.building, room: f.room, weanDays: wd, sides: f.sides.split(',').map(norm).filter(Boolean), racks, series }));
    toast('Settings saved');
  },
  'print-colony': () => printColony(), 'print-breeding': () => printBreeding(),
  'print-cards': () => { const cs = printScope(); if (!cs.length) return toast('No cages to print'); printCards(cs); },
  'print-card': el => printCards([cageOf(el.dataset.id)]),
  'print-rack': () => printHTML('Rack map', rackMapHTML(UI.rack.rack, (DB.settings.sides || []).length ? UI.rack.side : '')),
  'print-racks': () => { const rk = $('#prRack')?.value; const racks = rk ? [rk] : rackNames(); const sides = (DB.settings.sides || []).length ? DB.settings.sides : ['']; printHTML('Rack maps', racks.flatMap(r => sides.map(s => rackMapHTML(r, s))).join('')); },
  'undo': () => undo(),
};
const CHANGE_ACTIONS = {
  'imp-kind': el => { IMP.src.kind = el.value; IMP.src.mapping = autoMap(IMP.src.headers, el.value === 'litters' ? LITTER_FIELDS : ANIMAL_FIELDS); rebuildPlan(); render(); },
  'imp-map': el => { IMP.src.mapping[el.dataset.f] = +el.value; rebuildPlan(); render(); },
  'imp-only': el => { IMP.onlyProblems = el.checked; render(); },
  'imp-mouse-action': el => { const p = IMP.plan.mice[+el.dataset.i]; p.action = el.value; p.include = el.value !== 'skip' && !p.blocked; render(); },
  'imp-litter-status': el => { IMP.plan.litters[+el.dataset.i].data.status = el.value; },
};

function wire() {
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a || (a.tagName === 'INPUT' && a.type !== 'checkbox')) return;
    if (a.closest('.ctile') && e.target.closest('a,button') && !e.target.closest('a,button').isSameNode(a)) return;
    const fn = ACTIONS[a.dataset.act]; if (!fn) return;
    if (a.tagName === 'A') e.preventDefault();
    fn(a, e);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.actChange && CHANGE_ACTIONS[t.dataset.actChange]) return CHANGE_ACTIONS[t.dataset.actChange](t);
    if (t.dataset.imp) { const [arr, i] = t.dataset.imp.split(':'); const p = IMP.plan[arr][+i]; p.include = t.checked; if (arr === 'mice' && p.existing && t.checked && p.action === 'skip') p.action = 'update';
      if (arr === 'cages') for (const q of [...IMP.plan.mice, ...IMP.plan.litters]) if (q.cageKey === p.key && !q.blocked && (q.action === 'new' || !t.checked)) q.include = t.checked && q.action !== 'skip';
      render(); return; }
    if (t.dataset.impf) { const [arr, i, f] = t.dataset.impf.split(':'); let v = norm(t.value); if (f === 'row') { const r = parseRow(v); if (r === null) { alert('Row must be a letter (A, B, C…)'); t.value = ''; v = ''; } else v = r; } if (f === 'col' && v && !/^\d+$/.test(v)) { alert('Column must be a number'); t.value = ''; v = ''; } IMP.plan[arr][+i].data[f] = v; return; }
    if (t.dataset.ui && t.tagName === 'SELECT') setUI(t);
  });
  document.addEventListener('input', e => { const t = e.target; if (t.dataset.ui && t.tagName === 'INPUT') setUI(t); });
  // global search
  const s = $('#search'), box = $('#searchRes'); let res = [], sel = 0;
  const draw = () => { box.hidden = !res.length; box.innerHTML = res.map((r, i) => `<div class="${i === sel ? 'sel' : ''}" data-i="${i}">${r.html}</div>`).join(''); };
  s.addEventListener('input', () => { res = searchAll(s.value); sel = 0; draw(); });
  s.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, res.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && res[sel]) { res[sel].go(); s.value = ''; res = []; draw(); s.blur(); }
    else if (e.key === 'Escape') { s.value = ''; res = []; draw(); }
  });
  box.addEventListener('mousedown', e => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); res[+d.dataset.i].go(); s.value = ''; res = []; draw(); } });
  s.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('.modal-bg')) { e.preventDefault(); undo(); }
    if (e.key === 'Escape') { const m = $$('.modal-bg').pop(); if (m) m.remove(); }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); s.focus(); }
  });
  $('#savePill').addEventListener('click', () => { if (Store.state === 'needs-permission') Store.reconnect(); else if (Store.state === 'browser') Store.saveToFile(); else if (Store.state !== 'ok') Store.pickFolder(); else go('settings'); });
  window.addEventListener('hashchange', render);
  window.addEventListener('beforeunload', e => { if (Store.dirty || Store.saving) { Store.saveNow(); e.preventDefault(); e.returnValue = ''; } });
}
function setUI(t) {
  const [grp, key] = t.dataset.ui.split('.'); UI[grp][key] = t.value; saveUI();
  const body = $('#listBody');
  if (body && grp === 'cages') body.innerHTML = cagesTable();
  else if (body && grp === 'mice') body.innerHTML = miceTable();
  else if (grp === 'hist' || grp === 'breeding') { const pos = t.selectionStart; render(); const n = $(`[data-ui="${t.dataset.ui}"]`); if (n && n.tagName === 'INPUT') { n.focus(); n.setSelectionRange(pos, pos); } }
}

/* On opening: ask once for a data folder (Chrome/Edge), ask to reconnect it, or explain data files (Safari/Firefox).
   Folder access needs a click, so this is a dialog with a button rather than an automatic picker. */
function startupPrompt() {
  if (Store.state === 'needs-permission') {
    const m = modal({ title: 'Reconnect your data folder', body: `<p>Colony Manager saves to the folder <b>${esc(Store.dir.name)}</b>. Your browser needs your OK each time the app opens.</p><p class="small muted">In the browser prompt, choosing "Allow on every visit" (when offered) stops this question.</p>`, okText: 'Reconnect', ok: () => { Store.reconnect(); return true; } });
    return m;
  }
  if (Store.state === 'none' && !Store.setupDone) {
    const has = DB.cages.length + DB.mice.length;
    return modal({ title: 'Welcome to Colony Manager', body: `<p>Choose a folder on your computer for the colony data. The app saves there automatically and keeps a dated backup copy on every save. You only do this once.</p>
      <p class="small muted">A folder that is backed up (e.g. OneDrive) is best. If the folder already has colony data, the app opens it.${has ? ` The ${has} records already in this browser are kept.` : ''}</p>`, okText: 'Choose data folder…', ok: () => { Store.pickFolder(); return true; } });
  }
  if (Store.state === 'browser' && !Store.setupDone) {
    const el = modal({ title: 'Welcome to Colony Manager', body: `<p>This browser can't save straight into a folder, so Colony Manager keeps the colony in the browser. To keep a copy on your computer, click <b>Save data file</b> (top right) at the end of each session. Files go to Downloads and are dated, so each one is also a backup.</p>
      <p>If you already have a data file, open it now. Otherwise start fresh or import your records.</p><p class="small muted">Chrome or Edge can save to a folder automatically instead.</p>`,
      okText: 'Start', extraBtns: '<button class="btn" data-open style="margin-right:auto">Open a data file…</button>', ok: () => { Store.setupDone = true; idb.set('setupDone', true); return true; } });
    el.querySelector('[data-open]').onclick = () => { Store.setupDone = true; idb.set('setupDone', true); el.remove(); ACTIONS['backup-restore'](); };
  }
}
async function start() {
  wire();
  await Store.init();
  render();
  startupPrompt();
  // flush pending save when the window is hidden/closed
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Store.dirty) Store.saveNow(); });
}
start();
