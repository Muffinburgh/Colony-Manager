/* ===== Import: mLIMS animal files, matings/litters files, card-reading JSON ===== */
const MLIMS_COLS = ['Animal Name', 'Life Status', 'Sex', 'Dam', 'Sire', 'Date of Birth', 'Body Color', 'Ear Tag', 'Protocol', 'Cage Name', 'Cage Status', 'Building', 'Room', 'Rack', 'Side', 'Row', 'Column', 'Owner'];
const EXTRA_COLS = ['Strain', 'Cage Purpose', 'Cage Barcode'];
const LITTER_COLS = ['Cage Name', 'Line', 'Date Paired', 'Litter DOB', 'Pups', 'Date Weaned', 'Females', 'Males', 'Comments'];

const ANIMAL_FIELDS = {
  name: ['animalname', 'name', 'animal', 'animalid', 'mouse', 'mousename', 'mouseid'],
  status: ['lifestatus', 'status', 'animalstatus'],
  sex: ['sex', 'gender'],
  dam: ['dam', 'mother'], sire: ['sire', 'father'],
  dob: ['dateofbirth', 'dob', 'birthdate', 'birthday', 'born'],
  color: ['bodycolor', 'color', 'coatcolor'],
  earTag: ['eartag', 'eartagnumber', 'tag', 'tagnumber', 'eartagid'],
  protocol: ['protocol', 'protocolnumber', 'iacuc'],
  cage: ['cagename', 'cage', 'cageid', 'cagenumber', 'cagecard'],
  cageStatus: ['cagestatus'],
  building: ['building'], room: ['room'], rack: ['rack'], side: ['side'], row: ['row'], col: ['column', 'col'],
  owner: ['owner', 'pi'],
  strain: ['strain', 'line', 'genotype', 'strainname', 'strainline'],
  purpose: ['cagepurpose', 'purpose', 'cagetype'],
  barcode: ['cagebarcode', 'barcode'],
  notes: ['notes', 'comments', 'comment', 'note'],
};
const LITTER_FIELDS = {
  cage: ['cagename', 'cage', 'cageid', 'breedercage'],
  line: ['line', 'strain'],
  paired: ['datepaired', 'paired', 'pairdate', 'matingdate', 'setupdate'],
  born: ['litterdob', 'ldob', 'litterdate', 'born', 'dateofbirth', 'dob'],
  pups: ['pups', 'pupcount', 'littersize', 'numberofpups', 'born#'],
  weaned: ['dateweaned', 'dow', 'weaned', 'weandate'],
  females: ['females', 'female', 'f'], males: ['males', 'male', 'm'],
  comments: ['comments', 'comment', 'notes'],
};
const FIELD_LABELS = { name: 'Animal Name', status: 'Life Status', sex: 'Sex', dam: 'Dam', sire: 'Sire', dob: 'Date of Birth', color: 'Body Color', earTag: 'Ear Tag', protocol: 'Protocol', cage: 'Cage Name', cageStatus: 'Cage Status', building: 'Building', room: 'Room', rack: 'Rack', side: 'Side', row: 'Row', col: 'Column', owner: 'Owner', strain: 'Strain', purpose: 'Cage Purpose', barcode: 'Cage Barcode', notes: 'Notes', line: 'Line', paired: 'Date Paired', born: 'Litter DOB', pups: 'Pups', weaned: 'Date Weaned', females: 'Females', males: 'Males', comments: 'Comments' };
const hkey = h => String(h || '').toLowerCase().replace(/[^a-z0-9#]/g, '');

/** Parse a picked file or pasted text into {kind, headers, rows} or {kind:'cards', cards}. */
async function readImportSource(file, text) {
  let name = file ? file.name : 'pasted text';
  if (file && /\.(xlsx|xlsm|xls|ods)$/i.test(file.name)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
    return tableFromAOA(aoa, name + (wb.SheetNames.length > 1 ? ` (sheet "${wb.SheetNames[0]}")` : ''));
  }
  if (file) text = await file.text();
  text = String(text || '').replace(/^﻿/, '');
  const t = text.trim();
  if (!t) throw new Error('Nothing to import.');
  if (t[0] === '[' || t[0] === '{') {
    let j;
    try { j = JSON.parse(t); } catch (e) { throw new Error('This looks like JSON but could not be read: ' + e.message); }
    if (!Array.isArray(j)) j = [j];
    if (j.length && j[0] && (j[0].animals || j[0].lab_cage_raw || j[0].cage_number)) return { kind: 'cards', cards: j, source: name };
    throw new Error('JSON was not in the card-reading format (expected objects with cage_number and animals).');
  }
  const wb = XLSX.read(t, { type: 'string', raw: true, FS: t.split('\n')[0].includes('\t') ? '\t' : undefined });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '', blankrows: false });
  return tableFromAOA(aoa, name);
}
function tableFromAOA(aoa, source) {
  // Header row = first row with 2+ recognised column names (mLIMS exports sometimes have title rows).
  const all = new Set([...Object.values(ANIMAL_FIELDS).flat(), ...Object.values(LITTER_FIELDS).flat()]);
  let hi = aoa.findIndex(r => r.filter(c => all.has(hkey(c))).length >= 2);
  if (hi < 0) hi = 0;
  const headers = aoa[hi].map(h => norm(h));
  const rows = aoa.slice(hi + 1).filter(r => r.some(c => norm(c))).map((r, i) => ({ _row: hi + i + 2, cells: headers.map((_, j) => norm(r[j])) }));
  const keys = headers.map(hkey);
  const isLitter = keys.some(k => ['litterdob', 'ldob', 'pups', 'datepaired'].includes(k)) && !keys.some(k => ['animalname', 'sex', 'dateofbirth'].includes(k));
  const kind = isLitter ? 'litters' : 'animals';
  return { kind, headers, rows, source, mapping: autoMap(headers, kind === 'litters' ? LITTER_FIELDS : ANIMAL_FIELDS) };
}
function autoMap(headers, FIELDS) {
  const map = {};
  for (const [f, al] of Object.entries(FIELDS)) {
    const i = headers.findIndex(h => al.includes(hkey(h)));
    map[f] = i;
  }
  // a column can only feed one field
  const seen = new Set();
  for (const f of Object.keys(map)) { if (map[f] >= 0) { if (seen.has(map[f])) map[f] = -1; else seen.add(map[f]); } }
  return map;
}

/* ---------- Normalisers ---------- */
function normSex(v) {
  const s = lc(v);
  if (['f', 'female', '♀', 'fem'].includes(s)) return 'F';
  if (['m', 'male', '♂'].includes(s)) return 'M';
  if (!s) return '';
  return null;
}
function normStatus(v) {
  const s = lc(v);
  if (!s || ['live', 'alive', 'active', 'living'].includes(s)) return 'Live';
  if (['dead', 'deceased', 'died', 'found dead'].includes(s)) return 'Dead';
  if (['sacrificed', 'euthanized', 'sacced', 'sac', 'culled'].includes(s)) return 'Sacrificed';
  if (['transferred', 'transfer', 'shipped'].includes(s)) return 'Transferred';
  if (s === 'missing') return 'Missing';
  return null;
}
function normPurpose(v) {
  const s = lc(v);
  if (!s) return '';
  if (s.startsWith('breed') || s === 'mating') return 'Breeding';
  if (s.startsWith('hold') || s === 'weaning' || s === 'stock holding') return 'Holding';
  if (s.startsWith('exp')) return 'Experimental';
  if (s.startsWith('stock')) return 'Stock';
  return 'Other';
}
function litterStatusFrom(comments, weaned) {
  const c = lc(comments);
  if (/\bdead\b|\bdied\b/.test(c)) return 'Dead';
  if (weaned) return 'Weaned';
  if (/crossed out/.test(c)) return 'Past';
  return 'Active';
}

/* ---------- Plan building: everything is checked before anything is written ---------- */
function issue(level, msg) { return { level, msg }; }
function newPlan(src) { return { source: src.source, kind: src.kind, cages: [], mice: [], litters: [], newStrains: new Map(), notes: [] }; }
function noteStrain(plan, raw, where) {
  const r = canonStrain(raw);
  if (r.name && !r.known) { if (!plan.newStrains.has(r.name)) plan.newStrains.set(r.name, { name: r.name, where: [], add: true }); plan.newStrains.get(r.name).where.push(where); }
  return r;
}
function addCagePlan(plan, data, issues, src) {
  const ex = cageNamed(data.name);
  const p = { key: lc(data.name), data, issues: issues || [], include: true, existing: ex || null, src };
  if (ex) {
    p.action = 'existing';
    const diffs = [];
    for (const f of ['purpose', 'line', 'barcode', 'rack', 'side', 'row', 'col', 'building', 'room']) {
      if (data[f] && ex[f] && String(data[f]) !== String(ex[f])) diffs.push(`${FIELD_LABELS[f] || f}: file "${data[f]}", app "${ex[f]}"`);
    }
    p.issues.push(issue('info', 'Cage already in the app: new mice and litters are added to it; its details are kept as they are.'));
    if (diffs.length) p.issues.push(issue('warn', 'Differs from the app (app value kept): ' + diffs.join('; ')));
  } else p.action = 'new';
  plan.cages.push(p);
  return p;
}

function planFromCards(src) {
  const plan = newPlan(src);
  const today = todayISO();
  const taken = takenMouseNames();
  const pendingNames = [];
  src.cards.forEach((card, ci) => {
    const where = card.photo || `card ${ci + 1}`;
    const name = norm(card.cage_number);
    const cIss = [];
    if (!name) { cIss.push(issue('err', 'No cage number')); }
    if (plan.cages.some(c => c.key === lc(name))) cIss.push(issue('err', `Cage ${name} appears twice in this file`));
    const rawNum = (String(card.lab_cage_raw || '').match(/\d+/) || [])[0];
    if (rawNum && name && rawNum !== (name.match(/\d+/) || [])[0]) cIss.push(issue('warn', `Label "${card.lab_cage_raw}" doesn't match cage ${name}`));
    if (/^YZ-/i.test(norm(card.lab_cage_raw)) && !/-YZ$/i.test(name)) cIss.push(issue('warn', `YZ label but cage name has no -YZ suffix`));
    const bc = checkBarcode(card.barcode, name);
    if (bc && !bc.ok) cIss.push(issue('warn', bc.msg));
    if (card.uncertain?.includes('header')) cIss.push(issue('warn', 'Line name (header) marked uncertain'));
    if (card.notes) cIss.push(issue('info', 'Card note: ' + card.notes));
    let paired = '';
    for (const l of card.litters || []) if (l.paired) { paired = parseDate(l.paired) || ''; if (paired) break; }
    const cage = {
      name, purpose: 'Breeding', status: 'Active', line: norm(card.header), barcode: norm(card.barcode),
      owner: norm(card.pi) || DB.settings.owner, protocol: norm(card.protocol) || DB.settings.protocol,
      building: '', room: '', rack: '', side: '', row: '', col: '', paired,
      notes: [card.notes, card.photo ? 'Card photo ' + card.photo : ''].filter(Boolean).join(' · '), wfbr: null,
    };
    const cp = addCagePlan(plan, cage, cIss, where);

    // Parents: rules from the lab — no strain + no DOB = not in cage; DOB but no strain = same strain as other parent (same sex first).
    const animals = (card.animals || []).map(a => ({ ...a, dobISO: parseDate(a.dob || ''), strainC: noteStrain(plan, a.strain || a.strain_raw, where) }));
    const present = animals.filter(a => norm(a.dob) || norm(a.strain) || norm(a.strain_raw));
    for (const a of animals) if (!present.includes(a)) cp.issues.push(issue('info', `${a.slot} slot empty: not added`));
    for (const a of present) {
      const iss = [];
      const sex = /^F/i.test(a.slot) ? 'F' : /^M/i.test(a.slot) ? 'M' : 'U';
      let strain = a.strainC.name;
      if (!strain) {
        const sameSex = present.filter(o => o !== a && o.strainC.name && o.slot[0] === a.slot[0]);
        const other = present.filter(o => o !== a && o.strainC.name);
        const from = sameSex[0] || other[0];
        if (from) { strain = from.strainC.name; iss.push(issue('warn', `Strain filled in from ${from.slot} (blank on card)`)); }
        else iss.push(issue('warn', 'No strain on card'));
      } else if (a.strain_raw && a.strainC.changed) iss.push(issue('info', `Strain "${a.strain_raw}" → "${strain}"`));
      if (strain && !a.strainC.known && a.strainC.name === strain) iss.push(issue('warn', `New strain "${strain}"`));
      if (a.dobISO === null) iss.push(issue('err', `DOB "${a.dob}" can't be read`));
      if (!a.dobISO && a.dobISO !== null) iss.push(issue('warn', 'No DOB'));
      if (a.dobISO && a.dobISO > today) iss.push(issue('err', 'DOB is in the future'));
      if (a.dobISO && paired && a.dobISO > paired) iss.push(issue('warn', 'DOB is after the pairing date'));
      for (const u of card.uncertain || []) if (u.startsWith(a.slot + '.')) iss.push(issue('warn', `${u.split('.')[1] === 'dob' ? 'DOB' : u.split('.')[1] === 'strain' ? 'Strain' : u} marked uncertain on card` + (a.dob_raw && u.endsWith('dob') ? ` (written "${a.dob_raw}")` : '')));
      const m = {
        name: '', status: 'Live', sex, dam: '', sire: '', dob: a.dobISO || '', color: '', earTag: norm(a.id), protocol: cage.protocol, owner: cage.owner,
        strain, cageName: name, notes: a.slot ? `Breeder card slot ${a.slot}` : '', wfbr: '',
      };
      pendingNames.push(mouseBaseName(strain, m.dob, name));
      const mp = { data: m, issues: iss, include: true, action: 'new', cageKey: lc(name), src: `${where} ${a.slot}` };
      const same = cp.existing && miceIn(cp.existing.id, true).find(x => x.sex === sex && x.dob === m.dob && x.strain === strain && !plan.mice.some(q => q.existing === x));
      if (same) { mp.existing = same; mp.action = 'skip'; mp.include = false; iss.push(issue('info', `Already in the app as ${same.name}: skipped`)); }
      plan.mice.push(mp);
    }

    for (const l of card.litters || []) {
      const born = parseDate(l.ldob), weaned = parseDate(l.dow), lp = parseDate(l.paired);
      if (!l.ldob && !l.pups && !l.dow && !l.females && !l.males) continue; // pairing record only → cage.paired
      const iss = [];
      if (born === null) iss.push(issue('err', `Litter DOB "${l.ldob}" can't be read`));
      if (weaned === null) iss.push(issue('err', `Wean date "${l.dow}" can't be read`));
      if (born && born > today) iss.push(issue('err', 'Litter DOB is in the future'));
      const pr = lp || paired;
      if (born && pr && daysBetween(pr, born) < 19) iss.push(issue('warn', `Born ${daysBetween(pr, born)} days after pairing`));
      const status = litterStatusFrom(l.comments, weaned);
      if (status === 'Active' && born && daysBetween(born, today) > 35) iss.push(issue('warn', `Still open but born ${daysBetween(born, today)} days ago: probably weaned (mark it after import)`));
      if (!born) iss.push(issue('info', 'No litter DOB'));
      plan.litters.push({ data: { cageName: name, paired: lp || '', born: born || '', pups: norm(l.pups), weaned: weaned || '', females: norm(l.females), males: norm(l.males), status, comments: norm(l.comments) }, issues: iss, include: true, action: 'new', cageKey: lc(name), src: where });
    }
  });
  const finals = uniqueNames(pendingNames, taken);
  plan.mice.forEach((p, i) => p.data.name = finals[i]);
  finishPlan(plan);
  return plan;
}

function planFromAnimals(src) {
  const plan = newPlan(src);
  const M = src.mapping, get = (r, f) => (M[f] >= 0 ? r.cells[M[f]] : '');
  const today = todayISO();
  if (M.name < 0 && (M.strain < 0 || M.cage < 0)) plan.notes.push(issue('err', 'No "Animal Name" column found. Match the columns below.'));
  const cageRows = new Map();
  const seenNames = new Map();
  const taken = takenMouseNames();
  const genBases = [];
  for (const r of src.rows) {
    const iss = [];
    const cageName = get(r, 'cage');
    const strainR = noteStrain(plan, get(r, 'strain'), 'row ' + r._row);
    const dob = parseDate(get(r, 'dob'));
    const sex = normSex(get(r, 'sex')), status = normStatus(get(r, 'status'));
    if (dob === null) iss.push(issue('err', `Date of Birth "${get(r, 'dob')}" can't be read`));
    else if (!dob) iss.push(issue('warn', 'No date of birth'));
    else if (dob > today) iss.push(issue('err', 'Date of birth is in the future'));
    if (sex === null) iss.push(issue('warn', `Sex "${get(r, 'sex')}" not recognised: set to unknown`));
    else if (!sex) iss.push(issue('warn', 'No sex'));
    if (status === null) iss.push(issue('warn', `Life Status "${get(r, 'status')}" not recognised: kept as Live`));
    if (!cageName) iss.push(issue('warn', 'No cage: mouse will be unassigned'));
    if (!strainR.name) iss.push(issue('warn', 'No strain'));
    else if (!strainR.known) iss.push(issue('warn', `New strain "${strainR.name}"`));
    else if (strainR.changed) iss.push(issue('info', `Strain "${get(r, 'strain')}" → "${strainR.name}"`));
    let name = get(r, 'name');
    const m = {
      name, status: status || 'Live', sex: sex || 'U', dam: get(r, 'dam'), sire: get(r, 'sire'), dob: dob || '', color: get(r, 'color'), earTag: get(r, 'earTag'),
      protocol: get(r, 'protocol') || DB.settings.protocol, owner: get(r, 'owner') || DB.settings.owner, strain: strainR.name, cageName, notes: get(r, 'notes'), wfbr: '',
    };
    const p = { data: m, issues: iss, include: true, action: 'new', cageKey: lc(cageName), src: 'row ' + r._row, genIndex: -1 };
    if (!name) { p.genIndex = genBases.length; genBases.push(mouseBaseName(m.strain, m.dob, cageName)); iss.push(issue('info', 'No name in file: name made from strain, DOB and cage')); }
    else {
      if (seenNames.has(lc(name))) { iss.push(issue('err', `Same name as ${seenNames.get(lc(name))} in this file`)); }
      seenNames.set(lc(name), 'row ' + r._row);
      const ex = ix().mouseByName.get(lc(name));
      if (ex) { p.existing = ex; p.action = 'skip'; p.include = false; iss.push(issue('warn', `A mouse with this name is already in the app (cage ${cageOf(ex.cageId)?.name || 'none'}). Skipped unless you choose Update.`)); }
    }
    plan.mice.push(p);
    if (cageName) {
      if (!cageRows.has(lc(cageName))) cageRows.set(lc(cageName), { name: cageName, rows: [] });
      cageRows.get(lc(cageName)).rows.push(r);
    }
  }
  const gen = uniqueNames(genBases, new Set([...taken, ...seenNames.keys()]));
  plan.mice.forEach(p => { if (p.genIndex >= 0) p.data.name = gen[p.genIndex]; });
  for (const { name, rows } of cageRows.values()) {
    const iss = [];
    const pick = f => { const vals = [...new Set(rows.map(r => get(r, f)).filter(Boolean))]; if (vals.length > 1) iss.push(issue('warn', `Rows disagree on ${FIELD_LABELS[f]}: ${vals.join(' / ')} (using "${vals[0]}")`)); return vals[0] || ''; };
    const purposeRaw = pick('purpose');
    const purpose = normPurpose(purposeRaw);
    const cs = lc(pick('cageStatus'));
    const cage = {
      name, purpose, status: cs && !['active', 'open'].includes(cs) ? 'Inactive' : 'Active', line: '', barcode: pick('barcode'),
      owner: pick('owner') || DB.settings.owner, protocol: pick('protocol') || DB.settings.protocol,
      building: pick('building'), room: pick('room'), rack: pick('rack'), side: pick('side'), row: pick('row'), col: pick('col'), paired: '', notes: '', wfbr: null,
    };
    const prow = parseRow(cage.row);
    if (prow === null) { iss.push(issue('warn', `Row "${cage.row}" isn't a letter or number: left blank`)); cage.row = ''; } else cage.row = prow;
    if (cage.col && !/^\d+$/.test(cage.col)) { iss.push(issue('warn', `Column "${cage.col}" isn't a number: left blank`)); cage.col = ''; }
    if (!purposeRaw && !cageNamed(name)) iss.push(issue('info', 'No Cage Purpose in file: set to Holding'));
    if (cage.barcode) { const bc = checkBarcode(cage.barcode, name); if (bc && !bc.ok) iss.push(issue('warn', bc.msg)); }
    addCagePlan(plan, cage, iss, rows.map(r => 'row ' + r._row).join(', '));
  }
  // Dam/Sire should name known mice (in app or file).
  const known = new Set([...DB.mice.map(m => lc(m.name)), ...plan.mice.map(p => lc(p.data.name))]);
  for (const p of plan.mice) for (const f of ['dam', 'sire']) if (p.data[f] && !known.has(lc(p.data[f]))) p.issues.push(issue('info', `${FIELD_LABELS[f]} "${p.data[f]}" isn't a mouse in the app`));
  finishPlan(plan);
  return plan;
}

function planFromLitters(src) {
  const plan = newPlan(src);
  const M = src.mapping, get = (r, f) => (M[f] >= 0 ? r.cells[M[f]] : '');
  const today = todayISO();
  if (M.cage < 0) plan.notes.push(issue('err', 'No "Cage Name" column found. Match the columns below.'));
  for (const r of src.rows) {
    const iss = [];
    const cageName = get(r, 'cage');
    const paired = parseDate(get(r, 'paired')), born = parseDate(get(r, 'born')), weaned = parseDate(get(r, 'weaned'));
    if (!cageName) iss.push(issue('err', 'No cage name'));
    else if (!cageNamed(cageName)) iss.push(issue('err', `Cage "${cageName}" isn't in the app yet. Import the cages first.`));
    if (paired === null) iss.push(issue('err', `Date Paired "${get(r, 'paired')}" can't be read`));
    if (born === null) iss.push(issue('err', `Litter DOB "${get(r, 'born')}" can't be read`));
    if (weaned === null) iss.push(issue('err', `Date Weaned "${get(r, 'weaned')}" can't be read`));
    if (born && born > today) iss.push(issue('err', 'Litter DOB is in the future'));
    if (born && paired && daysBetween(paired, born) < 19) iss.push(issue('warn', `Born ${daysBetween(paired, born)} days after pairing`));
    const pairingOnly = !born && !get(r, 'pups') && !weaned;
    // Our own export writes a closed litter's status in front of the comment ("Past; crossed out").
    let comments = get(r, 'comments'); const pre = comments.match(/^(Past|Dead|Weaned)(;\s*|$)/i);
    if (pre) comments = comments.slice(pre[0].length);
    const status = pre ? pre[1][0].toUpperCase() + pre[1].slice(1).toLowerCase() : litterStatusFrom(comments, weaned);
    plan.litters.push({ data: { cageName, paired: paired || '', born: born || '', pups: get(r, 'pups'), weaned: weaned || '', females: get(r, 'females'), males: get(r, 'males'), status, comments, pairingOnly }, issues: iss, include: true, action: pairingOnly ? 'pairing' : 'new', cageKey: lc(cageName), src: 'row ' + r._row });
    if (pairingOnly) iss.push(issue('info', 'Pairing date only: sets the cage\'s Date Paired if it is blank'));
  }
  finishPlan(plan);
  return plan;
}

/** Shared checks after a plan is built: duplicates against the app, error rows excluded. */
function finishPlan(plan) {
  for (const l of plan.litters) {
    const c = cageNamed(l.data.cageName);
    if (c && l.action === 'new') {
      const dup = littersOf(c.id).find(x => (l.data.born && x.born === l.data.born) || (!l.data.born && !x.born && x.paired === l.data.paired && x.pups === l.data.pups));
      if (dup) { l.action = 'skip'; l.include = false; l.issues.push(issue('info', 'Already recorded in the app: skipped')); }
    }
  }
  for (const arr of [plan.cages, plan.mice, plan.litters]) for (const p of arr) if (p.issues.some(i => i.level === 'err')) { p.include = false; p.blocked = true; }
  // Mice/litters of a cage that can't be imported can't be imported either.
  const blockedCages = new Set(plan.cages.filter(c => c.blocked).map(c => c.key));
  for (const p of [...plan.mice, ...plan.litters]) if (blockedCages.has(p.cageKey)) { p.include = false; p.blocked = true; p.issues.push(issue('err', 'Its cage has an error')); }
}

/** Apply the included rows. Returns a summary. Never overwrites existing values except on explicit "Update". */
function applyPlan(plan, defaults) {
  const sum = { cages: 0, mice: 0, updated: 0, litters: 0, strains: 0, pairings: 0, names: [] };
  for (const s of plan.newStrains.values()) if (s.add && !DB.strains.some(x => lc(x.name) === lc(s.name))) { DB.strains.push({ name: s.name, aliases: [] }); sum.strains++; }
  const cageIdByKey = new Map();
  for (const c of DB.cages) cageIdByKey.set(lc(c.name), c.id);
  for (const p of plan.cages) {
    if (!p.include) continue;
    if (p.action === 'new') {
      const d = { ...p.data, purpose: p.data.purpose || 'Holding' };
      for (const f of ['building', 'room', 'rack', 'side']) if (!d[f] && defaults[f]) d[f] = defaults[f];
      const c = { id: uid('c'), ...d, created: todayISO() };
      DB.cages.push(c); cageIdByKey.set(p.key, c.id); sum.cages++;
    } else if (p.existing) {
      const ex = DB.cages.find(c => c.id === p.existing.id);
      for (const f of ['line', 'barcode', 'paired', 'owner', 'protocol']) if (!ex[f] && p.data[f]) ex[f] = p.data[f]; // fill blanks only
    }
  }
  for (const p of plan.mice) {
    if (!p.include) continue;
    const d = p.data, cid = d.cageName ? cageIdByKey.get(lc(d.cageName)) : '';
    if (d.cageName && !cid) continue; // cage row excluded
    if (p.action === 'update' && p.existing) {
      const m = DB.mice.find(x => x.id === p.existing.id);
      for (const f of ['status', 'sex', 'dam', 'sire', 'dob', 'color', 'earTag', 'protocol', 'owner', 'strain', 'notes']) if (d[f] && d[f] !== 'U') m[f] = d[f];
      if (cid && m.cageId !== cid) { (m.history = m.history || []).push({ date: todayISO(), from: cageOf(m.cageId)?.name || '', to: d.cageName, note: 'import' }); m.cageId = cid; }
      sum.updated++;
    } else if (p.action === 'new') {
      const { cageName, ...rest } = d;
      DB.mice.push({ id: uid('m'), ...rest, cageId: cid || '', history: [{ date: todayISO(), to: cageName || '', note: 'imported from ' + plan.source }] });
      sum.mice++; sum.names.push(d.name);
    }
  }
  invalidate();
  for (const p of plan.litters) {
    if (!p.include) continue;
    const c = cageNamed(p.data.cageName); if (!c) continue;
    if (p.action === 'pairing') { if (!c.paired && p.data.paired) { c.paired = p.data.paired; sum.pairings++; } continue; }
    if (p.action !== 'new') continue;
    const { cageName, pairingOnly, ...rest } = p.data;
    DB.litters.push({ id: uid('l'), cageId: c.id, ...rest });
    if (!c.paired && rest.paired) c.paired = rest.paired;
    sum.litters++;
  }
  return sum;
}
