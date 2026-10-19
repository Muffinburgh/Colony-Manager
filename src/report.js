/* ===== Formatted Excel report (styled with xlsx-js-style) ===== */
const XC = { breederHead: 'FFD966', breeder: 'FFF2CC', due: 'FCE4D6', over: 'F8CBAD', head: 'DDEBF7', grey: 'F2F2F2', line: 'A6A6A6', dark: 'BF9000', F: 'C2185B', M: '1E6FC2', muted: '7F7F7F' };
const xBorder = (style = 'thin', rgb = XC.line) => ({ style, color: { rgb } });
const xBox = (st = 'thin') => ({ top: xBorder(st), bottom: xBorder(st), left: xBorder(st), right: xBorder(st) });
const xs = (o = {}) => ({ font: { name: 'Calibri', sz: 11, ...(o.font || {}) }, alignment: { vertical: 'top', wrapText: true, ...(o.alignment || {}) }, ...(o.fill ? { fill: { patternType: 'solid', fgColor: { rgb: o.fill } } } : {}), ...(o.border ? { border: o.border } : {}) });

/** Minimal sheet builder: set cells with styles, merges and column widths. */
class SheetB {
  constructor() { this.cells = {}; this.merges = []; this.cols = []; this.rows = []; this.maxR = 0; this.maxC = 0; }
  set(r, c, v, s) { this.cells[XLSX.utils.encode_cell({ r, c })] = { v: v ?? '', t: typeof v === 'number' ? 'n' : 's', s: s || xs() }; this.maxR = Math.max(this.maxR, r); this.maxC = Math.max(this.maxC, c); }
  style(r, c, s) { const k = XLSX.utils.encode_cell({ r, c }); if (!this.cells[k]) this.set(r, c, '', s); else this.cells[k].s = s; }
  merge(r1, c1, r2, c2) { this.merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }); }
  sheet(widths) {
    const ws = { ...this.cells };
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(this.maxR, 0), c: Math.max(this.maxC, 0) } });
    if (this.merges.length) ws['!merges'] = this.merges;
    ws['!cols'] = widths.map(w => ({ wch: w }));
    if (this.rows.length) ws['!rows'] = this.rows;
    return ws;
  }
}
const sexSym = s => s === 'F' ? '♀' : s === 'M' ? '♂' : '?';
const sexFont = s => ({ bold: true, color: { rgb: s === 'F' ? XC.F : s === 'M' ? XC.M : XC.muted } });
function reportTitle(B, title, sub) {
  B.set(0, 0, title, xs({ font: { bold: true, sz: 16 }, alignment: { wrapText: false } }));
  B.set(1, 0, sub, xs({ font: { color: { rgb: XC.muted } }, alignment: { wrapText: false } }));
}
const subLine = () => [piLine(), `exported ${fmtDate(todayISO())}`].filter(Boolean).join(' · ');

/* Sheet 1: each breeder cage as a yellow block, with the cages weaned from it beside it. */
function sheetBreeders() {
  const B = new SheetB();
  const cs = DB.cages.filter(c => c.status === 'Active' && c.purpose === 'Breeding').sort((a, b) => natCmp(cageTitleText(a), cageTitleText(b)) || natCmp(a.name, b.name));
  reportTitle(B, 'Breeding cages', `${subLine()} · ${cs.length} breeding cages · weaned cages (WFBR) are listed to the right of their breeder`);
  const H = 3, hs = xs({ font: { bold: true }, fill: XC.head, border: { bottom: xBorder('medium', '808080') } });
  ['', 'Strain', 'DOB', 'Age', 'Ear tag', 'Pairing & litters', '', 'Weaned cage', 'Location', 'Mice', 'DOB', 'Strain', 'From litter'].forEach((h, i) => { if (i !== 6) B.set(H, i, h, hs); });
  let r = H + 2; const today = todayISO();
  for (const c of cs) {
    const ms = miceIn(c.id).sort((a, b) => natCmp(a.sex, b.sex) || natCmp(a.name, b.name));
    const lines = [];
    if (c.paired) lines.push({ t: `Paired ${fmtDate(c.paired)} (${daysBetween(c.paired, today)} d ago)` });
    for (const l of littersOf(c.id).filter(isOpenLitter)) {
      const w = weanState(l);
      lines.push({ t: l.born ? `Litter born ${fmtDate(l.born)}${l.pups ? ` · ${l.pups} pups` : ''} · wean by ${fmtDate(weanDue(l))}${w && w.left < 0 ? ' (OVERDUE)' : ''}` : `Litter (no birth date)${l.pups ? ` · ${l.pups} pups` : ''}`, fill: w ? (w.left < 0 ? XC.over : w.left <= 3 ? XC.due : null) : null, bold: true });
    }
    for (const l of littersOf(c.id).filter(l => l.status === 'Weaned').slice(-2)) lines.push({ t: `Weaned ${fmtDate(l.weaned) || '?'} · born ${fmtDate(l.born) || '?'}${l.females || l.males ? ` (${l.females || 0}♀ ${l.males || 0}♂)` : ''}`, muted: true });
    const kids = (ix().childrenOf.get(c.id) || []).filter(k => k.status === 'Active').sort((a, b) => natCmp(a.name, b.name));
    const h = Math.max(ms.length, lines.length, kids.length, 1);
    // header row: the cross, cage number and location
    const hd = xs({ font: { bold: true, sz: 12 }, fill: XC.breederHead, border: { top: xBorder('medium', XC.dark) } });
    B.set(r, 0, cageTitleText(c), hd); for (let k = 1; k <= 4; k++) B.style(r, k, hd); B.merge(r, 0, r, 4);
    B.set(r, 5, `Cage #${c.name}${cageLocation(c) ? ' · ' + cageLocation(c) : ''}${c.line ? '\n' + c.line : ''}`, xs({ font: { bold: true }, fill: XC.breederHead, border: { top: xBorder('medium', XC.dark) } }));
    if (kids.length) B.set(r, 6, '→', xs({ font: { bold: true, sz: 14, color: { rgb: XC.dark } }, alignment: { horizontal: 'center' } }));
    for (let i = 0; i < h; i++) {
      const rr = r + 1 + i, last = i === h - 1;
      const yb = o => xs({ fill: XC.breeder, ...o, border: last ? { bottom: xBorder('medium', XC.dark) } : undefined });
      const m = ms[i];
      B.set(rr, 0, m ? sexSym(m.sex) : '', yb({ font: m ? sexFont(m.sex) : {}, alignment: { horizontal: 'center' } }));
      B.set(rr, 1, m ? m.strain : '', yb()); B.set(rr, 2, m ? fmtDate(m.dob) : '', yb()); B.set(rr, 3, m ? ageText(m.dob) : '', yb()); B.set(rr, 4, m ? m.earTag : '', yb());
      const L = lines[i];
      B.set(rr, 5, L ? L.t : '', yb({ fill: (L && L.fill) || XC.breeder, font: L ? { bold: !!L.bold, color: L.muted ? { rgb: XC.muted } : undefined } : {} }));
      const k = kids[i];
      const kb = { bottom: xBorder('thin', 'D9D9D9') };
      if (k) {
        const km = miceIn(k.id), F = km.filter(x => x.sex === 'F').length, M = km.filter(x => x.sex === 'M').length;
        const lit = k.wfbr?.litterId ? DB.litters.find(l => l.id === k.wfbr.litterId) : null;
        B.set(rr, 7, '#' + k.name, xs({ font: { bold: true }, border: kb }));
        B.set(rr, 8, cageLocation(k) || 'not placed', xs({ border: kb, font: cageLocation(k) ? {} : { color: { rgb: XC.muted } } }));
        B.set(rr, 9, [F && F + '♀', M && M + '♂', km.length - F - M && (km.length - F - M) + '?'].filter(Boolean).join(' ') || 'empty', xs({ border: kb }));
        B.set(rr, 10, [...new Set(km.map(x => fmtDate(x.dob)).filter(Boolean))].join(', '), xs({ border: kb }));
        B.set(rr, 11, [...new Set(km.map(x => x.strain).filter(Boolean))].join(', '), xs({ border: kb }));
        B.set(rr, 12, lit ? fmtDate(lit.born) : '', xs({ border: kb }));
      } else if (i === 0) B.set(rr, 7, 'none yet', xs({ font: { italic: true, color: { rgb: XC.muted } } }));
    }
    r += h + 2;
  }
  if (!cs.length) B.set(r, 0, 'No active breeding cages.');
  return B.sheet([4, 30, 11, 7, 8, 44, 3, 10, 22, 9, 12, 28, 11]);
}

function exportReport() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetBreeders(), 'Breeders');
  download(`breeders-${todayISO()}.xlsx`, new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
