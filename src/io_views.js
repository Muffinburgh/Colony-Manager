/* ===== Import & export views ===== */
let IMP = null; // { src, plan, defaults, onlyProblems }

function viewImport() {
  let h = `<h1>Import</h1>`;
  if (!IMP) {
    h += `<div class="panel">
      <p style="margin-top:0">Accepted: <b>mLIMS animal files</b> (CSV, TSV, Excel; the mLIMS import columns or an mLIMS export), <b>matings & litters</b> files (Cage Name, Line, Date Paired, Litter DOB, Pups, Date Weaned, Females, Males, Comments), and the <b>breeder-card JSON</b> from the card-reading chat. Nothing is added until you review the preview.</p>
      <div class="drop-zone" id="dropZone">Drop a file here, or <label class="btn primary" style="margin-left:6px">Choose file…<input type="file" id="impFile" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.json" hidden></label></div>
      <h3>…or paste text (JSON, or rows copied from Excel with the header row)</h3>
      <textarea id="impText" rows="7" placeholder='[{"photo": "IMG_4107.HEIC", "cage_number": "28", ...}]'></textarea>
      <div class="row" style="margin-top:8px"><button class="btn primary" data-act="imp-paste">Preview pasted text</button><span class="spacer"></span>
      <a data-act="imp-template">Download an empty mLIMS-format template</a> · <a data-act="imp-template-litters">matings & litters template</a></div></div>`;
    return h;
  }
  const { plan, src } = IMP;
  const cnt = arr => ({ inc: arr.filter(p => p.include).length, err: arr.filter(p => p.issues.some(i => i.level === 'err')).length, warn: arr.filter(p => p.issues.some(i => i.level === 'warn')).length });
  const cc = cnt(plan.cages), mc = cnt(plan.mice), lcnt = cnt(plan.litters);
  const kindLabel = { cards: 'Breeder-card JSON', animals: 'Animals (mLIMS format)', litters: 'Matings & litters' }[src.kind];
  h += `<div class="panel"><div class="row"><b>${esc(src.source)}</b><span class="badge b-info">${kindLabel}</span>
    ${src.kind !== 'cards' ? `<select data-act-change="imp-kind"><option value="animals" ${src.kind === 'animals' ? 'selected' : ''}>Treat as animals file</option><option value="litters" ${src.kind === 'litters' ? 'selected' : ''}>Treat as litters file</option></select>` : ''}
    <span class="spacer"></span><button class="btn" data-act="imp-cancel">Cancel</button></div>
    ${plan.notes.map(n => `<div class="issue ${n.level}">${esc(n.msg)}</div>`).join('')}
    ${src.kind !== 'cards' ? mappingHtml(src) : ''}
    ${plan.cages.some(c => c.action === 'new') ? `<h3>Location for new cages <span class="muted small">(used where the file has none; set Row/Column per cage below)</span></h3><div class="form" id="impDefaults">
      ${['building', 'room', 'rack', 'side'].map(f => `<label class="f"><span>${FIELD_LABELS[f]}</span>${f === 'rack' ? `<select name="rack"><option value="">—</option>${rackNames().map(r => `<option ${IMP.defaults.rack === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>` : f === 'side' && (DB.settings.sides || []).length ? `<select name="side"><option value="">—</option>${DB.settings.sides.map(s => `<option ${IMP.defaults.side === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : `<input name="${f}" value="${esc(IMP.defaults[f] || '')}">`}</label>`).join('')}</div>` : ''}
    ${plan.newStrains.size ? `<h3>New strains (${plan.newStrains.size})</h3><div class="small">These aren't in the strain list and will be added. Check the spelling; you can merge them later on the Strains page.<br>${[...plan.newStrains.values()].map(s => `<span class="badge b-warn">${esc(s.name)}</span> <span class="muted">(${esc(s.where.slice(0, 3).join(', '))}${s.where.length > 3 ? '…' : ''})</span>`).join(' ')}</div>` : ''}
    <div class="row" style="margin-top:12px">
      <span><b>Will add:</b> ${plan.cages.filter(p => p.include && p.action === 'new').length} new cages · ${plan.mice.filter(p => p.include && p.action === 'new').length} mice${plan.mice.some(p => p.include && p.action === 'update') ? ` · update ${plan.mice.filter(p => p.include && p.action === 'update').length} mice` : ''} · ${plan.litters.filter(p => p.include && p.action === 'new').length} litters</span>
      <span class="muted small">Rows with ✖ errors are left out. ⚠ warnings are imported; check them.</span>
      <span class="spacer"></span><label class="small"><input type="checkbox" data-act-change="imp-only" ${IMP.onlyProblems ? 'checked' : ''}> Show only rows with ✖ or ⚠</label>
      <button class="btn primary" data-act="imp-commit">Import</button></div></div>`;
  const show = p => !IMP.onlyProblems || p.issues.some(i => i.level !== 'info');
  if (plan.cages.length) h += `<h2>Cages (${cc.inc} of ${plan.cages.length} included${cc.err ? `, ${cc.err} with errors` : ''})</h2><div class="tablewrap"><table class="t"><tr><th></th><th>Cage</th><th></th><th>Purpose</th><th>Line</th><th>Barcode</th><th>Rack / side</th><th>Row</th><th>Col</th><th>Problems</th></tr>
    ${plan.cages.map((p, i) => show(p) ? `<tr class="${p.include ? '' : 'off'}"><td><input type="checkbox" data-imp="cages:${i}" ${p.include ? 'checked' : ''} ${p.blocked ? 'disabled' : ''}></td><td><b>${esc(p.data.name)}</b><div class="small muted">${esc(p.src)}</div></td><td>${p.action === 'new' ? '<span class="badge b-ok">new</span>' : '<span class="badge">in app</span>'}</td><td>${esc(p.action === 'new' ? p.data.purpose || 'Holding' : p.existing.purpose)}</td><td>${esc(p.data.line)}</td><td class="small">${esc(p.data.barcode)}</td><td class="small">${esc([p.data.rack || IMP.defaults.rack, p.data.side || IMP.defaults.side].filter(Boolean).join(' / '))}</td>
    <td>${p.action === 'new' ? `<input class="cell" data-impf="cages:${i}:row" value="${esc(rowLabel(p.data.row))}" placeholder="A">` : esc(rowLabel(p.existing.row))}</td><td>${p.action === 'new' ? `<input class="cell" data-impf="cages:${i}:col" value="${esc(p.data.col)}">` : esc(p.existing.col)}</td><td>${issuesHtml(p.issues)}</td></tr>` : '').join('')}</table></div>`;
  if (plan.mice.length) h += `<h2>Mice (${mc.inc} of ${plan.mice.length} included${mc.err ? `, ${mc.err} with errors` : ''}${mc.warn ? `, ${mc.warn} with warnings` : ''})</h2><div class="tablewrap"><table class="t"><tr><th></th><th>Name</th><th></th><th>Sex</th><th>DOB</th><th>Strain</th><th>Ear tag</th><th>Cage</th><th>Status</th><th>Problems</th></tr>
    ${plan.mice.map((p, i) => show(p) ? `<tr class="${p.include ? '' : 'off'}"><td><input type="checkbox" data-imp="mice:${i}" ${p.include ? 'checked' : ''} ${p.blocked ? 'disabled' : ''}></td><td>${esc(p.data.name)}<div class="small muted">${esc(p.src)}</div></td>
    <td>${p.existing ? `<select data-act-change="imp-mouse-action" data-i="${i}"><option value="skip" ${p.action === 'skip' ? 'selected' : ''}>Skip</option><option value="update" ${p.action === 'update' ? 'selected' : ''}>Update existing</option></select>` : '<span class="badge b-ok">new</span>'}</td>
    <td>${sexSpan(p.data.sex)}</td><td>${fmtDate(p.data.dob)}</td><td>${esc(p.data.strain)}</td><td>${esc(p.data.earTag)}</td><td>${esc(p.data.cageName)}</td><td>${esc(p.data.status)}</td><td>${issuesHtml(p.issues)}</td></tr>` : '').join('')}</table></div>`;
  if (plan.litters.length) h += `<h2>Litters (${lcnt.inc} of ${plan.litters.length} included${lcnt.err ? `, ${lcnt.err} with errors` : ''})</h2><div class="tablewrap"><table class="t"><tr><th></th><th>Cage</th><th>Paired</th><th>Born</th><th>Pups</th><th>♀</th><th>♂</th><th>Weaned</th><th>Status</th><th>Comments</th><th>Problems</th></tr>
    ${plan.litters.map((p, i) => show(p) ? `<tr class="${p.include ? '' : 'off'}"><td><input type="checkbox" data-imp="litters:${i}" ${p.include ? 'checked' : ''} ${p.blocked ? 'disabled' : ''}></td><td>${esc(p.data.cageName)}</td><td>${fmtDate(p.data.paired)}</td><td>${fmtDate(p.data.born)}</td><td>${esc(p.data.pups)}</td><td>${esc(p.data.females)}</td><td>${esc(p.data.males)}</td><td>${fmtDate(p.data.weaned)}</td>
    <td><select data-act-change="imp-litter-status" data-i="${i}">${LITTER_STATUSES.map(s => `<option ${p.data.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td class="small">${esc(p.data.comments)}</td><td>${issuesHtml(p.issues)}</td></tr>` : '').join('')}</table></div>`;
  return h;
}
viewImport.after = () => {
  const d = $('#impDefaults'); if (d) d.addEventListener('change', e => { IMP.defaults[e.target.name] = norm(e.target.value); render(); });
  const dz = $('#dropZone'); if (!dz) return;
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) startImport(f); });
  $('#impFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) startImport(f); });
};
function mappingHtml(src) {
  const FIELDS = src.kind === 'litters' ? LITTER_FIELDS : ANIMAL_FIELDS;
  const unmatched = src.headers.filter((h, i) => !Object.values(src.mapping).includes(i));
  return `<details style="margin-top:8px" ${unmatched.length || Object.values(src.mapping).filter(i => i >= 0).length < 3 ? 'open' : ''}><summary>Columns: ${Object.values(src.mapping).filter(i => i >= 0).length} matched${unmatched.length ? `, <span style="color:var(--warn)">${unmatched.length} not used: ${esc(unmatched.join(', '))}</span>` : ''} · ${src.rows.length} rows</summary>
    <div class="form" style="margin-top:8px">${Object.keys(FIELDS).map(f => `<label class="f"><span>${FIELD_LABELS[f]}</span><select data-act-change="imp-map" data-f="${f}"><option value="-1">— not in file —</option>${src.headers.map((h, i) => `<option value="${i}" ${src.mapping[f] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div></details>`;
}
async function startImport(file, text) {
  try {
    const src = await readImportSource(file, text);
    IMP = { src, defaults: { building: DB.settings.building, room: DB.settings.room, rack: '', side: '' }, onlyProblems: false };
    rebuildPlan();
    render(); $('#view').scrollTop = 0;
  } catch (e) { console.error(e); alert('Could not read this: ' + e.message); }
}
function rebuildPlan() {
  const s = IMP.src;
  IMP.plan = s.kind === 'cards' ? planFromCards(s) : s.kind === 'litters' ? planFromLitters(s) : planFromAnimals(s);
}
function commitImport() {
  const { plan, defaults } = IMP;
  const nC = plan.cages.filter(p => p.include && p.action === 'new').length, nM = plan.mice.filter(p => p.include && p.action !== 'skip').length, nL = plan.litters.filter(p => p.include && p.action !== 'skip').length;
  if (!nC && !nM && !nL) { alert('Nothing is selected to import.'); return; }
  const left = [...plan.cages, ...plan.mice, ...plan.litters].filter(p => !p.include).length;
  if (!confirm(`Import ${nC} new cages, ${nM} mice and ${nL} litter records from ${plan.source}?` + (left ? `\n\n${left} rows are left out (errors, duplicates or unticked).` : ''))) return;
  let sum;
  mutate(`Imported ${plan.source}`, () => { sum = applyPlan(plan, defaults); }, () => `${sum.cages} cages, ${sum.mice} mice${sum.updated ? `, ${sum.updated} mice updated` : ''}, ${sum.litters} litters${sum.strains ? `, ${sum.strains} new strains` : ''}${left ? `; ${left} rows left out` : ''}. Mice: ${sum.names.slice(0, 40).join('; ')}${sum.names.length > 40 ? '…' : ''}`);
  IMP = null;
  toast(`Imported ${sum.cages} cages, ${sum.mice} mice, ${sum.litters} litters`, 4000);
  go(sum.cages ? 'racks' : 'cages');
}

/* ---------- Export & print ---------- */
function viewExport() {
  const racks = rackNames();
  return `<h1>Export & print</h1>
  <div class="grid2">
  <div class="panel"><h2 style="margin-top:0">Export files</h2>
    <div style="margin-bottom:14px;padding:10px 12px;background:#fff8e1;border:1px solid #f1d29b;border-radius:6px"><b>Breeders sheet</b> <span class="muted small">(one formatted Excel sheet: each breeder cage in yellow with its cross, parents and litters, and the holding cages weaned from it beside it)</span><br><button class="btn primary" data-act="exp-report" style="margin-top:6px">Download breeders sheet</button></div>
    <p class="small muted">Plain files below use the mLIMS import columns so they can be re-imported here or into mLIMS. Dates are written M-D-YYYY.</p>
    <div style="margin-bottom:10px"><b>Animals & cages</b> <span class="muted small">(mLIMS import columns + Strain, Cage Purpose, Cage Barcode)</span><br>
      <label class="small"><input type="checkbox" id="expAll"> include dead / sacrificed / transferred mice</label><br>
      <button class="btn" data-act="exp-animals" data-fmt="xlsx">Excel</button> <button class="btn" data-act="exp-animals" data-fmt="csv">CSV</button></div>
    <div style="margin-bottom:10px"><b>Matings & litters</b><br><button class="btn" data-act="exp-litters" data-fmt="xlsx">Excel</button> <button class="btn" data-act="exp-litters" data-fmt="csv">CSV</button></div>
    <div style="margin-bottom:10px"><b>Everything as plain tables</b> <span class="muted small">(Cages, Mice, Litters, Change log sheets)</span><br><button class="btn" data-act="exp-workbook">Excel workbook</button></div>
    <div><b>Full backup</b> <span class="muted small">(can be restored in Settings)</span><br><button class="btn" data-act="backup-download">Download .json</button></div>
  </div>
  <div class="panel"><h2 style="margin-top:0">Print</h2>
    <div class="form" style="margin-bottom:10px">
      <label class="f"><span>Which cages</span><select id="prRack"><option value="">All racks</option>${racks.map(r => `<option value="${esc(r)}">Rack ${esc(r)}</option>`).join('')}</select></label>
      <label class="f"><span>Purpose</span><select id="prPurpose"><option value="">All</option>${PURPOSES.map(p => `<option>${p}</option>`).join('')}</select></label>
    </div>
    <div class="row"><button class="btn primary" data-act="print-colony">Colony list</button><button class="btn" data-act="print-breeding">Breeding & wean list</button><button class="btn" data-act="print-cards">Cage cards</button><button class="btn" data-act="print-racks">Rack maps</button></div>
    <p class="small muted">Opens your printer dialog. Choose "Save as PDF" there to keep a copy.</p>
  </div></div>`;
}
function animalRows(includeGone) {
  return DB.mice.filter(m => includeGone || m.status === 'Live').map(m => {
    const c = cageOf(m.cageId) || {};
    return { 'Animal Name': m.name, 'Life Status': m.status, 'Sex': m.sex === 'U' ? '' : m.sex, 'Dam': m.dam, 'Sire': m.sire, 'Date of Birth': fmtDate(m.dob), 'Body Color': m.color, 'Ear Tag': m.earTag, 'Protocol': m.protocol, 'Cage Name': c.name || '', 'Cage Status': c.name ? (c.status === 'Active' ? 'Active' : 'Inactive') : '', 'Building': c.building || '', 'Room': c.room || '', 'Rack': c.rack || '', 'Side': c.side || '', 'Row': rowLabel(c.row), 'Column': c.col || '', 'Owner': m.owner || c.owner || '', 'Strain': m.strain, 'Cage Purpose': c.purpose || '', 'Cage Barcode': c.barcode || '' };
  }).sort((a, b) => natCmp(a['Cage Name'], b['Cage Name']) || natCmp(a['Animal Name'], b['Animal Name']));
}
function litterRows() {
  const rows = [];
  for (const c of DB.cages.slice().sort((a, b) => natCmp(a.name, b.name))) {
    const ls = littersOf(c.id);
    if (!ls.length && c.purpose === 'Breeding' && c.paired) rows.push({ 'Cage Name': c.name, 'Line': c.line, 'Date Paired': fmtDate(c.paired), 'Litter DOB': '', 'Pups': '', 'Date Weaned': '', 'Females': '', 'Males': '', 'Comments': '' });
    for (const l of ls) rows.push({ 'Cage Name': c.name, 'Line': c.line, 'Date Paired': fmtDate(l.paired), 'Litter DOB': fmtDate(l.born), 'Pups': l.pups, 'Date Weaned': fmtDate(l.weaned), 'Females': l.females, 'Males': l.males, 'Comments': [l.status !== 'Active' && l.status !== 'Weaned' ? l.status : '', l.comments].filter(Boolean).join('; ') });
  }
  return rows;
}
function xlsxDownload(name, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [sn, { rows, cols }] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows, { header: cols });
    ws['!cols'] = cols.map(c => ({ wch: Math.min(40, Math.max(c.length, ...rows.slice(0, 300).map(r => String(r[c] ?? '').length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sn.slice(0, 31));
  }
  download(name, new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
