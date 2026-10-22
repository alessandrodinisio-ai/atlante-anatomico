(() => {
'use strict';

const DATA = window.__ATLAS;
const XLINK = 'http://www.w3.org/1999/xlink';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const store = {
  get(k, d) { try { const v = localStorage.getItem('atlas.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('atlas.' + k, JSON.stringify(v)); } catch {} },
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SYS = {
  nerv:  'Sistema nervoso', sens: 'Testa e organi di senso', card: 'Cardiovascolare', resp: 'Respiratorio',
  dig:   'Digerente', uro: 'Urinario', repro: 'Riproduttivo', endo: 'Endocrino', imm: 'Linfatico e immunitario',
  tess:  'Tessuti e locomotore',
};
const GRP = {
  cortex: 'Corteccia cerebrale', limbic: 'Sistema limbico', basal: 'Nuclei della base', dienc: 'Diencefalo ed epitalamo',
  stem: 'Tronco encefalico', cereb: 'Cervelletto', cover: 'Meningi e ventricoli', all: 'Encefalo',
};
// Reti che attraversano l'intera figura: disegnate sopra, ma scelte per ultime nella pila di selezione.
const NETWORK = new Set(['UBERON_0001021', 'CL_0000738', 'UBERON_0000029']);
const SKIN = 'UBERON_0000014';
// Identificativi dell'SVG che differiscono dal termine ontologico corretto.
const SVG_FIX = { UBERON_00024818: 'UBERON_0002481' };

const VIEWS = {
  body:  { tpl: 'svg-male',  tav: 'TAV. I',  cap: 'Homo sapiens, maschio adulto · veduta anteriore', key: 'sys', order: Object.keys(SYS), names: SYS },
  brain: { tpl: 'svg-brain', tav: 'TAV. II', cap: 'Encefalo umano · sezioni assiali, sagittale mediana e veduta laterale', key: 'grp', order: ['cortex','limbic','basal','dienc','stem','cereb','cover'], names: GRP },
};
const TABS = [['over','Panoramica'],['anat','Anatomia'],['isto','Istologia'],['clin','Clinica'],['onto','Ontologia']];

const state = {
  view: 'body', sel: null, hov: null, tab: store.get('tab', 'over'), mode: 'explore',
  hidden: { body: new Set(), brain: new Set() }, q: '', seen: new Set(store.get('seen', [])),
  lastStack: [], lastPt: null, quiz: null,
};
const models = {};
const stage = $('#stage'), sheet = $('#sheet'), callout = $('#callout'), tip = $('#tip');

/* =====================================================================
   Suono: sintesi Web Audio con transienti di rumore filtrato e corpi
   risonanti brevi, per un feedback "fisico" (legno, carta, metallo).
   ===================================================================== */
const Sound = (() => {
  let ctx = null, out = null, wet = null, noiseBuf = null, on = store.get('sound', true), lastTick = 0;
  function init() {
    if (ctx) return ctx.state === 'suspended' ? ctx.resume() : null;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    out = ctx.createGain(); out.gain.value = .55; out.connect(comp); comp.connect(ctx.destination);
    // Piccola stanza: risposta all'impulso sintetica e corta, dà corpo senza riverbero evidente.
    const len = Math.floor(ctx.sampleRate * .28), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const conv = ctx.createConvolver(); conv.buffer = ir; wet = ctx.createGain(); wet.gain.value = .16; wet.connect(conv); conv.connect(out);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  const dest = () => { const g = ctx.createGain(); g.connect(out); g.connect(wet); return g; };
  function noise(t, dur, freq, q, gain, type = 'bandpass') {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest()); s.start(t, Math.random() * .3); s.stop(t + dur + .02);
    return f;
  }
  function tone(t, freq, dur, gain, type = 'sine', glide = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest()); o.start(t); o.stop(t + dur + .02);
  }
  // Blocchetto di legno: transiente + parziali inarmoniche smorzate rapidamente.
  function wood(t, f, gain = .22) {
    noise(t, .018, f * 3.2, 1.4, gain * .9);
    tone(t, f, .16, gain); tone(t, f * 2.76, .07, gain * .35); tone(t, f * 5.4, .03, gain * .15);
    tone(t, 90, .09, gain * .5, 'sine', .6);
  }
  const PITCH = { nerv: 392, sens: 349, card: 262, resp: 440, dig: 294, uro: 330, repro: 311, endo: 466, imm: 523, tess: 247,
    cortex: 440, limbic: 349, basal: 294, dienc: 392, stem: 262, cereb: 330, cover: 247, all: 392 };
  const api = {
    get on() { return on; },
    toggle() { on = !on; store.set('sound', on); if (on) { init(); api.play('latch'); } return on; },
    unlock() { if (on) init(); },
    play(kind, arg) {
      if (!on) return; init(); if (!ctx) return;
      const t = ctx.currentTime + .005;
      switch (kind) {
        case 'tick': { // polpastrello su carta spessa: transiente morbido con un filo di corpo
          const now = performance.now(); if (now - lastTick < 180) return; lastTick = now;
          const v = 1 + (Math.random() - .5) * .12; // piccola variazione: la ripetizione non suona meccanica
          const f = noise(t, .03, 1700 * v, 1.1, .045); f.Q.setValueAtTime(1.1, t);
          tone(t, 210 * v, .035, .018); break; }
        case 'select': wood(t, PITCH[arg] || 330); break;
        case 'deeper': wood(t, (PITCH[arg] || 330) * .75, .18); noise(t + .03, .02, 1800, 2, .06); break;
        case 'tab': { const f = noise(t, .07, 2400, .8, .07, 'lowpass'); f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(900, t + .07); break; }
        case 'latch': noise(t, .01, 3000, 3, .12); noise(t + .028, .014, 1900, 3, .09); tone(t + .028, 160, .05, .06); break;
        case 'detent': noise(t, .008, 2600, 4, .07); tone(t, 1200, .02, .02); break;
        case 'view': noise(t, .16, 1200, .6, .06, 'lowpass'); tone(t, 110, .22, .1, 'sine', .7); wood(t + .05, 196, .12); break;
        case 'right': wood(t, 523, .2); wood(t + .09, 784, .2); break;
        case 'wrong': tone(t, 140, .18, .22, 'sine', .55); noise(t, .05, 500, 1, .12, 'lowpass'); break;
        case 'reveal': wood(t, 392, .16); wood(t + .1, 330, .14); wood(t + .2, 262, .14); break;
      }
    },
  };
  return api;
})();

/* =====================================================================
   Caricamento degli SVG
   1) innesto dal <template>  2) riempimenti e tratti predefiniti
   3) rimozione di visibility:hidden  4) personalizzazioni dell'atlante
   ===================================================================== */
function applyDefaults(svg) {
  // Gli SVG dell'anatomogram dichiarano fill:none;stroke:none su ogni struttura: la ripristiniamo prima di tutto.
  const STRIP = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity'];
  svg.querySelectorAll('*').forEach(el => {
    if (el.style) STRIP.forEach(p => el.style.removeProperty(p));
    STRIP.forEach(p => el.removeAttribute(p));
  });
  svg.querySelectorAll('#LAYER_EFO [id^="UBERON_"], #LAYER_EFO [id^="CL_"]').forEach(el => {
    el.setAttribute('fill', '#D8C7B4'); el.setAttribute('stroke', '#7A6858'); el.setAttribute('stroke-width', '0.25');
  });
  svg.querySelectorAll('#LAYER_OUTLINE *').forEach(el => { el.setAttribute('fill', '#E7DDD0'); el.setAttribute('stroke', '#9A8878'); });
}
function unhide(svg) {
  [svg, ...svg.querySelectorAll('*')].forEach(el => {
    if (el.style && el.style.visibility === 'hidden') el.style.removeProperty('visibility');
    if (el.getAttribute('visibility') === 'hidden') el.removeAttribute('visibility');
    if (el.style && el.style.display === 'none' && el.closest('#LAYER_EFO')) el.style.removeProperty('display');
  });
}
function toRoot(svg, rect) {
  const m = svg.getScreenCTM().inverse(), p = svg.createSVGPoint();
  const pts = [[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]].map(([x, y]) => { p.x = x; p.y = y; return p.matrixTransform(m); });
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
const union = bs => { bs = bs.filter(Boolean); if (!bs.length) return null;
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
  return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y }; };

function buildModel(view) {
  const V = VIEWS[view];
  const svg = document.getElementById(V.tpl).content.querySelector('svg').cloneNode(true);
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.classList.add('anat', 'v-' + view);
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', V.cap);
  stage.replaceChildren(svg);

  applyDefaults(svg);
  unhide(svg);

  // Personalizzazioni: via titoli nativi e icona di navigazione dell'anatomogram, alias <use> risolti.
  svg.querySelectorAll('title, metadata, #g3').forEach(n => n.remove());
  const alias = {};
  svg.querySelectorAll('use').forEach(u => {
    const href = (u.getAttribute('href') || u.getAttributeNS(XLINK, 'href') || '').slice(1);
    if (u.id && href) alias[SVG_FIX[u.id] || u.id] = SVG_FIX[href] || href;
    u.remove();
  });

  const efo = svg.querySelector('#LAYER_EFO');
  const shapes = {};
  efo.querySelectorAll('[id^="UBERON_"], [id^="CL_"]').forEach(el => {
    const uid = SVG_FIX[el.id] || el.id, e = DATA[uid];
    el.classList.add('o'); el.dataset.uid = uid;
    const k = e ? (e[V.key] || e.sys) : 'tess';
    el.dataset.k = k; el.style.setProperty('--c', `var(--p-${k})`);
    if (NETWORK.has(uid)) el.classList.add('net');
    if (uid === SKIN) el.classList.add('skin');
    shapes[uid] = el;
  });
  // Geometria nel sistema di riferimento della radice.
  const full = svg.viewBox.baseVal; const fullBox = { x: full.x, y: full.y, w: full.width, h: full.height };
  const box = {};
  for (const [uid, el] of Object.entries(shapes)) box[uid] = toRoot(svg, el.getBoundingClientRect());
  // Ordine di disegno: dalle aree più grandi alle più piccole, reti in superficie.
  Object.keys(shapes).filter(u => shapes[u].parentNode === efo)
    .sort((a, b) => (NETWORK.has(a) - NETWORK.has(b)) || (box[b].w * box[b].h - box[a].w * box[a].h))
    .forEach(u => efo.appendChild(shapes[u]));
  const order = [...efo.children];
  if (view === 'brain') svg.appendChild(svg.querySelector('#LAYER_OUTLINE')); // solchi sopra i colori, come in una tavola incisa

  const ids = [...Object.keys(shapes), ...Object.keys(alias).filter(a => shapes[alias[a]] && DATA[a])].filter(u => DATA[u]);
  const shapeOf = uid => shapes[uid] || shapes[alias[uid]] || null;
  const area = uid => { const b = box[uid] || box[alias[uid]]; return b ? b.w * b.h : Infinity; };
  const rank = el => { const u = el.dataset.uid; return u === SKIN ? 1e9 : NETWORK.has(u) ? 1e8 + area(u) : area(u); };

  let regions;
  if (view === 'body') {
    const R = (...u) => union(u.map(x => box[x]));
    regions = [
      ['Intera', fullBox],
      ['Testa e collo', R('UBERON_0000955', 'UBERON_0001044', 'UBERON_0000341', 'UBERON_0002046')],
      ['Torace', R('UBERON_0002048', 'UBERON_0000977', 'UBERON_0000948')],
      ['Addome', R('UBERON_0002107', 'UBERON_0000945', 'UBERON_0001155', 'UBERON_0002113')],
      ['Pelvi', R('UBERON_0001255', 'UBERON_0002367', 'UBERON_0000473', 'UBERON_0001052', 'UBERON_0000989')],
      ['Arto inferiore', R('UBERON_0002481', 'UBERON_0002371', 'UBERON_0001134', 'UBERON_0007844')],
    ];
  } else {
    const ob = id => { const n = svg.querySelector('#' + id); return n ? toRoot(svg, n.getBoundingClientRect()) : null; };
    regions = [
      ['Tutte', fullBox],
      ['Assiale mesencefalica', ob('top_left_outline')],
      ['Assiale dei nuclei della base', ob('top_right_outline')],
      ['Sagittale mediana', ob('bottom_left_outline')],
      ['Laterale sinistra', ob('bottom_right_outline')],
    ];
  }
  regions = regions.filter(r => r[1]);
  const m = { view, svg, efo, shapes, alias, box, full: fullBox, vb: { ...fullBox }, ids, shapeOf, area, rank, regions, order, anchors: {} };
  return m;
}

/* =====================================================================
   Vista: viewBox, zoom, pan, inquadratura
   ===================================================================== */
const M = () => models[state.view];
function setVB(vb) {
  const m = M(); m.vb = vb;
  m.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const { W, H } = stageSize();
  const lvl = Math.min(W / vb.w, H / vb.h) / (Math.min(W / m.full.w, H / m.full.h) / 1.06);
  $('#zlvl').textContent = lvl.toFixed(1).replace('.', ',') + '×';
  drawCallout();
}
function stageSize() { const r = stage.getBoundingClientRect(); return { W: r.width || 1, H: r.height || 1, r }; }
function fitVB(b, pad = .1) {
  const { W, H } = stageSize(), asp = W / H, m = M();
  let w = b.w * (1 + pad * 2), h = b.h * (1 + pad * 2);
  const minW = m.full.w / 9; if (w < minW) { h *= minW / w; w = minW; }
  if (w / h > asp) h = w / asp; else w = h * asp;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}
let anim = 0;
function animateVB(to, dur = 520) {
  cancelAnimationFrame(anim);
  const from = { ...M().vb };
  if (reduced || dur === 0) return setVB(to);
  const t0 = performance.now(), ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = now => {
    const k = ease(Math.min(1, (now - t0) / dur));
    // Interpolazione logaritmica della scala: lo zoom appare uniforme.
    const w = from.w * Math.pow(to.w / from.w, k), h = from.h * Math.pow(to.h / from.h, k);
    const cx = from.x + from.w / 2 + (to.x + to.w / 2 - from.x - from.w / 2) * k;
    const cy = from.y + from.h / 2 + (to.y + to.h / 2 - from.y - from.h / 2) * k;
    setVB({ x: cx - w / 2, y: cy - h / 2, w, h });
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
function clientToSvg(x, y) { const m = M(); const p = m.svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(m.svg.getScreenCTM().inverse()); }
function zoomAt(factor, cx, cy, animate = false) {
  const m = M(), vb = m.vb;
  const w = Math.min(m.full.w * 1.4, Math.max(m.full.w / 40, vb.w * factor)), k = w / vb.w, h = vb.h * k;
  const p = cx == null ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : clientToSvg(cx, cy);
  const to = { x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w, h };
  animate ? animateVB(to, 260) : setVB(to);
}
function resetView(animate = true) { const t = fitVB(M().full, .03); animate ? animateVB(t) : setVB(t); }
function frame(uid, animate = true) {
  const m = M(), b = m.box[uid] || m.box[m.alias[uid]]; if (!b) return;
  const small = b.w * b.h < m.full.w * m.full.h * .02;
  const t = fitVB(b, small ? .9 : .3); animate ? animateVB(t) : setVB(t);
}

/* Punto d'ancoraggio interno alla forma, per il richiamo con linea di guida */
function anchorOf(uid) {
  const m = M(); const el = m.shapeOf(uid); if (!el) return null;
  const key = el.dataset.uid; if (m.anchors[key]) return m.anchors[key];
  const geos = [...(el.matches('path,ellipse,rect,circle,polygon') ? [el] : []), ...el.querySelectorAll('path,ellipse,rect,circle,polygon')];
  let best = null, bestA = -1;
  for (const g of geos) { const r = g.getBoundingClientRect(); const a = r.width * r.height; if (a > bestA) { bestA = a; best = g; } }
  if (!best) return null;
  const bb = best.getBBox(), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2, p = m.svg.createSVGPoint();
  let pick = { x: cx, y: cy }, d = Infinity;
  if (best.isPointInFill) {
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
      p.x = bb.x + bb.width * i / 12; p.y = bb.y + bb.height * j / 12;
      if (best.isPointInFill(p)) { const dd = (p.x - cx) ** 2 + (p.y - cy) ** 2; if (dd < d) { d = dd; pick = { x: p.x, y: p.y }; } }
    }
  }
  // locale → schermo → radice
  p.x = pick.x; p.y = pick.y; const s = p.matrixTransform(best.getScreenCTM());
  const r = s.matrixTransform(m.svg.getScreenCTM().inverse());
  return (m.anchors[key] = { x: r.x, y: r.y });
}
function drawCallout() {
  const m = M();
  const uid = state.sel;
  if (!uid || !m || (state.mode === 'quiz' && !(state.quiz && state.quiz.revealed))) { callout.innerHTML = ''; return; }
  const a = anchorOf(uid); if (!a) { callout.innerHTML = ''; return; }
  const p = m.svg.createSVGPoint(); p.x = a.x; p.y = a.y; const s = p.matrixTransform(m.svg.getScreenCTM());
  const { W, H, r } = stageSize(); const x = s.x - r.left, y = s.y - r.top;
  if (x < 0 || y < 0 || x > W || y > H) { callout.innerHTML = ''; return; }
  const e = DATA[uid], left = x > W / 2;
  const name = e.it, id = uid.replace('_', ':');
  const lx = left ? 18 : W - 18, ly = Math.max(28, Math.min(H - 44, y - 34));
  const tw = Math.max(name.length * 7.6, id.length * 6.6) + 16;
  const ex = left ? lx + tw : lx - tw;
  const bx = left ? lx - 6 : ex - 6;
  callout.setAttribute('viewBox', `0 0 ${W} ${H}`);
  callout.innerHTML =
    `<polyline points="${x},${y} ${x + (left ? -14 : 14)},${ly + 8} ${ex + (left ? 6 : -6)},${ly + 8}"/>` +
    `<circle cx="${x}" cy="${y}" r="3.2"/>` +
    `<rect class="cl-bg" x="${bx}" y="${ly - 14}" width="${tw + 12}" height="${40}" rx="1"/>` +
    `<text class="cl-name" x="${lx}" y="${ly + 2}" text-anchor="${left ? 'start' : 'end'}">${esc(name)}</text>` +
    `<text class="cl-id" x="${lx}" y="${ly + 20}" text-anchor="${left ? 'start' : 'end'}">${esc(id)}</text>`;
}

/* =====================================================================
   Pila di strutture sotto un punto
   ===================================================================== */
function stackAt(x, y) {
  const m = M(), seen = new Set(), out = [];
  for (const n of document.elementsFromPoint(x, y)) {
    const o = n.closest && n.closest('.o');
    if (o && m.svg.contains(o) && !o.classList.contains('off') && !seen.has(o.dataset.uid)) { seen.add(o.dataset.uid); out.push(o); }
  }
  return out.sort((a, b) => m.rank(a) - m.rank(b)).map(o => o.dataset.uid);
}
// Le strutture che condividono la forma (alias) appaiono anch'esse nella pila.
function withAliases(stack) {
  const m = M(), out = [];
  for (const u of stack) { out.push(u); for (const [a, t] of Object.entries(m.alias)) if (t === u && DATA[a]) out.push(a); }
  return out;
}

/* =====================================================================
   Selezione e stato visivo
   ===================================================================== */
let hovEl = null, selEl = null, tickTimer = 0;
function setHover(uid) {
  if (state.hov === uid) return;
  state.hov = uid;
  if (hovEl) hovEl.classList.remove('hov');
  hovEl = uid ? M().shapeOf(uid) : null;
  if (hovEl) hovEl.classList.add('hov');
  stage.classList.toggle('over', !!uid);
  // Il tick suona solo se il cursore si ferma sulla struttura: scorrendo sulla tavola resta in silenzio.
  clearTimeout(tickTimer);
  if (uid && !drag) tickTimer = setTimeout(() => state.hov === uid && Sound.play('tick'), 110);
}
function select(uid, opts = {}) {
  const m = M(); if (!uid || !DATA[uid]) return;
  const el = m.shapeOf(uid); if (!el) return;
  if (selEl && selEl !== el) selEl.classList.remove('sel');
  selEl = el; el.classList.add('sel'); m.svg.classList.add('has-sel'); raise(el);
  state.sel = uid;
  if (state.mode === 'explore') {
    state.seen.add(uid); store.set('seen', [...state.seen]);
    try { history.replaceState(null, '', '#' + uid); } catch {}
  }
  const k = DATA[uid][VIEWS[state.view].key] || DATA[uid].sys;
  if (state.hidden[state.view].has(k)) { state.hidden[state.view].delete(k); applyFilters(); renderLegend(); }
  if (!opts.silent) Sound.play(opts.deeper ? 'deeper' : 'select', k);
  if (opts.frame) frame(uid); else drawCallout();
  if (opts.stack) state.lastStack = opts.stack; else if (!opts.keepStack) state.lastStack = [];
  renderPanel(); renderList(); renderProgress();
}
// La struttura selezionata sale in superficie; le altre tornano all'ordine di disegno originale.
function raise(el) {
  const m = M(); m.order.forEach(n => m.efo.appendChild(n));
  if (el && el.parentNode === m.efo) m.efo.appendChild(el);
}
function clearSel() {
  const m = M(); raise(null); if (selEl) selEl.classList.remove('sel'); selEl = null; state.sel = null; m.svg.classList.remove('has-sel');
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  drawCallout(); renderPanel(); renderList();
}
function applyFilters() {
  const m = M(), hid = state.hidden[state.view];
  for (const el of Object.values(m.shapes)) el.classList.toggle('off', hid.has(el.dataset.k));
}

/* =====================================================================
   Indice, legenda, regioni
   ===================================================================== */
const keyOf = uid => DATA[uid][VIEWS[state.view].key] || DATA[uid].sys;
function orderedIds() {
  const V = VIEWS[state.view], m = M();
  return m.ids.slice().sort((a, b) => (V.order.indexOf(keyOf(a)) - V.order.indexOf(keyOf(b))) || DATA[a].it.localeCompare(DATA[b].it, 'it'));
}
function matches(uid, q) {
  if (!q) return true; const e = DATA[uid];
  return norm([e.it, e.la, e.en, uid, uid.replace('_', ':'), (e.syn || []).join(' '), e.kind].join(' ')).includes(q);
}
function renderList() {
  const V = VIEWS[state.view], q = norm(state.q.trim()), hid = state.hidden[state.view];
  const groups = new Map(); for (const k of V.order) groups.set(k, []);
  for (const u of orderedIds()) if (matches(u, q)) { const k = keyOf(u); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); }
  let html = '', n = 0;
  for (const [k, list] of groups) {
    if (!list.length) continue; n += list.length;
    html += `<div class="grp" style="--c:var(--p-${k})"><h3><i class="sw"></i>${esc(V.names[k] || k)}<span class="n">${list.length}</span></h3>`;
    for (const u of list) {
      const short = u.startsWith('CL_') ? 'CL ' + u.slice(3) : u.slice(7);
      html += `<button class="item${hid.has(k) ? ' off' : ''}" data-uid="${u}" ${u === state.sel ? 'aria-current="true"' : ''}><i class="seen${state.seen.has(u) ? ' on' : ''}"></i><span class="nm">${esc(DATA[u].it)}</span><span class="uid">${short}</span></button>`;
    }
    html += '</div>';
  }
  $('#list').innerHTML = html || `<p class="empty">Nessuna struttura corrisponde a «${esc(state.q)}» in questa tavola.</p>`;
  // Scorre solo la colonna dell'indice, mai la pagina (su telefono l'indice sta in fondo).
  const cur = $('#list [aria-current="true"]'), col = $('.index');
  if (cur && !listHover && getComputedStyle(col).overflowY !== 'visible') {
    const r = cur.getBoundingClientRect(), c = col.getBoundingClientRect();
    if (r.top < c.top + 40 || r.bottom > c.bottom - 20) col.scrollTop += r.top - c.top - c.height / 3;
  }
}
let listHover = false;
function renderLegend() {
  const V = VIEWS[state.view], m = M(), hid = state.hidden[state.view];
  const present = V.order.filter(k => m.ids.some(u => keyOf(u) === k));
  $('#legend').innerHTML = `<span class="lbl">Sistemi</span>` + present.map(k =>
    `<button class="chip sys" data-k="${k}" aria-pressed="${!hid.has(k)}" style="--c:var(--p-${k})"><i class="sw"></i>${esc(V.names[k])}</button>`).join('') +
    (hid.size ? `<button class="solo" data-k="*">Mostra tutti</button>` : '');
}
function renderRegions() {
  const m = M();
  $('#regions').innerHTML = `<span class="lbl">Inquadra</span>` + m.regions.map((r, i) => `<button class="chip" data-r="${i}">${esc(r[0])}</button>`).join('');
}
function renderProgress() {
  const all = Object.keys(DATA).length, n = [...state.seen].filter(u => DATA[u]).length;
  $('#prog-t').textContent = `${n} di ${all} consultate`;
  $('#prog-b').style.width = (100 * n / all).toFixed(1) + '%';
}

/* =====================================================================
   Scheda con linguette
   ===================================================================== */
const facts = rows => rows && rows.length ? `<dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
const sect = (k, v) => v && v !== '—' ? `<div class="sect"><span class="k">${esc(k)}</span><p>${esc(v)}</p></div>` : '';
function viewsOf(uid) {
  const out = [];
  for (const v of Object.keys(VIEWS)) { const m = models[v] || null; if (m ? m.ids.includes(uid) : PRESENCE[v].has(uid)) out.push(v === 'body' ? 'Corpo (Tav. I)' : 'Encefalo (Tav. II)'); }
  return out;
}
function tabHTML(uid, tab) {
  const e = DATA[uid], m = M();
  if (tab === 'over') return `
    <p class="lead">${esc(e.sum)}</p>
    <div><h4>Funzioni</h4><ul class="fnlist">${(e.fn || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
    ${e.dati ? `<div><h4>Dati di riferimento</h4>${facts(e.dati)}</div>` : ''}`;
  if (tab === 'anat') return `
    <div><h4>Topografia</h4></div>
    ${sect('Posizione', e.loc)}${sect('Rapporti', e.rel)}${sect('Vascolarizzazione', e.vasc)}${sect('Innervazione', e.inn)}`;
  if (tab === 'isto') return `${sect('Istologia', e.isto)}${sect('Sviluppo', e.emb)}`;
  if (tab === 'clin') return `
    <div><h4>Quadri clinici</h4><div class="clin">${(e.clin || []).map(([t, d]) => `<div><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join('')}</div></div>
    ${e.esami ? `<div><h4>Indagini</h4><p>${esc(e.esami)}</p></div>` : ''}
    ${e.perla ? `<div class="pearl"><span class="k">Nota</span><p>${esc(e.perla)}</p></div>` : ''}
    <p class="disclaimer">Contenuto didattico di riferimento, non un’indicazione diagnostica o terapeutica.</p>`;
  if (tab === 'onto') {
    const shape = m.shapeOf(uid), shared = shape && shape.dataset.uid !== uid ? shape.dataset.uid : null;
    const sharers = Object.entries(m.alias).filter(([a, t]) => t === uid && DATA[a]).map(([a]) => a);
    const svgId = e.svgId || (shared ? null : uid);
    const curie = uid.replace('_', ':'), ont = uid.startsWith('CL_') ? 'cl' : 'uberon';
    const rel = orderedIds().filter(u => u !== uid && keyOf(u) === keyOf(uid));
    return `
      <dl class="onto">
        <dt>Identificativo</dt><dd>${curie}</dd>
        <dt>Termine (inglese)</dt><dd class="txt">${esc(e.en)}</dd>
        <dt>Terminologia latina</dt><dd class="txt"><i>${esc(e.la)}</i></dd>
        <dt>Categoria</dt><dd class="txt">${esc(e.kind)}</dd>
        <dt>Sistema</dt><dd class="txt">${esc(SYS[e.sys])}${e.grp && e.grp !== 'all' ? ' · ' + esc(GRP[e.grp]) : ''}</dd>
        <dt>Elemento SVG</dt><dd>${shared ? `&lt;use&gt; → ${shared}<br><span style="font-family:var(--sans)">condivide la forma di ${esc(DATA[shared].it)}</span>` : `#${esc(svgId)}`}</dd>
        ${sharers.length ? `<dt>Alias nell’SVG</dt><dd>${sharers.map(a => esc(a)).join('<br>')}</dd>` : ''}
        <dt>Presente in</dt><dd class="txt">${viewsOf(uid).join(', ')}</dd>
        ${e.syn ? `<dt>Sinonimi</dt><dd class="txt">${e.syn.map(esc).join('<br>')}</dd>` : ''}
        <dt>Fonte</dt><dd class="txt"><a href="https://www.ebi.ac.uk/ols4/ontologies/${ont}/classes?obo_id=${curie}" target="_blank" rel="noopener">Ontology Lookup Service</a></dd>
      </dl>
      ${rel.length ? `<div><h4>Nello stesso gruppo</h4><div class="related">${rel.map(u => `<button class="chip" data-go="${u}">${esc(DATA[u].it)}</button>`).join('')}</div></div>` : ''}`;
  }
  return '';
}
function renderPanel() {
  const P = $('#panel');
  if (state.mode === 'quiz' && !(state.quiz && state.quiz.revealed)) {
    const q = state.quiz;
    P.innerHTML = `<div class="eyebrow">Esercitazione</div><h2>Individua la struttura</h2>
      <p class="lead" style="max-width:62ch">Il nome compare sulla tavola. Clicca sul punto in cui si trova: se più strutture si sovrappongono vale qualunque livello della pila. Dopo tre tentativi la soluzione viene mostrata.</p>
      ${q ? `<dl class="facts"><dt>Risposte esatte</dt><dd>${q.right} / ${q.done}</dd><dt>Serie in corso</dt><dd>${q.streak}</dd><dt>Serie migliore</dt><dd>${store.get('best', 0)}</dd><dt>Rimaste in questo giro</dt><dd>${q.pool.length}</dd></dl>` : ''}
      <p class="disclaimer">Le sagome sono neutre durante l’esercizio. Tasto Invio per passare alla prossima, H per un indizio.</p>`;
    return;
  }
  const uid = state.sel;
  if (!uid) {
    P.innerHTML = `<div class="eyebrow">${esc(VIEWS[state.view].tav)}</div><h2>Seleziona una struttura</h2>
      <p class="lead">Clicca sulla tavola o scegli dall’indice. Dove più strutture si sovrappongono, un secondo clic sullo stesso punto scende di livello.</p>
      <dl class="facts"><dt>Strutture in questa tavola</dt><dd>${M().ids.length}</dd><dt>Tasti</dt><dd>/ ↑ ↓ 1–5 + − 0 F S Esc</dd></dl>`;
    return;
  }
  const e = DATA[uid], k = keyOf(uid), V = VIEWS[state.view];
  const ids = orderedIds(), i = ids.indexOf(uid), prev = ids[(i - 1 + ids.length) % ids.length], next = ids[(i + 1) % ids.length];
  const stack = state.lastStack.length > 1 ? state.lastStack : [];
  if (!TABS.some(t => t[0] === state.tab)) state.tab = 'over';
  P.innerHTML = `
    <div class="eyebrow" style="--c:var(--p-${k})"><i class="sw"></i>${esc(V.names[k] || SYS[e.sys])}<span class="kind">· ${esc(e.kind)}</span></div>
    <div><h2>${esc(e.it)}</h2><p class="latin">${esc(e.la)}</p></div>
    <div class="idrow"><span class="idv">${uid.replace('_', ':')}</span><button id="copy">Copia ID</button><button id="frame">Inquadra</button></div>
    ${stack.length ? `<div class="stack"><span>In questo punto:</span>${stack.map(u => `<button class="chip" data-go="${u}" data-keep="1" ${u === uid ? 'aria-pressed="true"' : ''}>${esc(DATA[u].it)}</button>`).join('')}</div>` : ''}
    <div class="tabs" role="tablist">${TABS.map(([t, l], j) => `<button role="tab" id="tab-${t}" aria-selected="${t === state.tab}" aria-controls="pane" data-tab="${t}">${l}<span class="k">${j + 1}</span></button>`).join('')}</div>
    <div class="tabpane" id="pane" role="tabpanel" aria-labelledby="tab-${state.tab}">${tabHTML(uid, state.tab)}</div>
    <div class="pager"><button data-go="${prev}"><span>Precedente</span><b>${esc(DATA[prev].it)}</b></button><button data-go="${next}"><span>Successiva</span><b>${esc(DATA[next].it)}</b></button></div>`;
}
function setTab(t) {
  if (t === state.tab || !state.sel) return;
  state.tab = t; store.set('tab', t); Sound.play('tab');
  renderPanel();
}

/* =====================================================================
   Esercitazione
   ===================================================================== */
function quizPool() {
  const m = M(), minA = m.full.w * m.full.h * .00006;
  return m.ids.filter(u => m.shapes[u] && u !== SKIN && !NETWORK.has(u) && m.area(u) > minA).sort(() => Math.random() - .5);
}
function startQuiz() {
  state.mode = 'quiz'; Sound.play('latch'); $('.app').classList.add('quizzing');
  $('#m-quiz').setAttribute('aria-pressed', 'true'); $('#m-explore').setAttribute('aria-pressed', 'false');
  state.quiz = { pool: quizPool(), right: 0, done: 0, streak: 0 };
  raise(null); if (selEl) selEl.classList.remove('sel'); M().svg.classList.remove('has-sel'); state.sel = null;
  M().svg.classList.add('quiz'); resetView(); nextQuestion();
}
function stopQuiz() {
  state.mode = 'explore'; Sound.play('latch'); $('.app').classList.remove('quizzing');
  $('#m-quiz').setAttribute('aria-pressed', 'false'); $('#m-explore').setAttribute('aria-pressed', 'true');
  M().svg.classList.remove('quiz'); $('#quiz').hidden = true;
  const keep = state.quiz && state.quiz.target; state.quiz = null;
  if (keep) select(keep, { silent: true }); else { clearSel(); }
}
function nextQuestion() {
  const q = state.quiz; if (!q) return;
  if (!q.pool.length) q.pool = quizPool();
  q.target = q.pool.pop(); q.tries = 0; q.revealed = false; q.msg = ''; q.cls = '';
  raise(null); if (selEl) selEl.classList.remove('sel'); selEl = null; state.sel = null; M().svg.classList.remove('has-sel');
  renderQuiz(); renderPanel(); drawCallout();
}
function renderQuiz() {
  const q = state.quiz, box = $('#quiz'); if (!q) { box.hidden = true; return; }
  const e = DATA[q.target]; box.hidden = false;
  box.innerHTML = `<div class="q-main"><span class="q-lbl">Individua sulla tavola</span><span class="q-target">${esc(e.it)}<i>${esc(e.la)}</i></span></div>
    <div class="q-row"><span class="q-score">${q.right}/${q.done} · serie ${q.streak}</span>${q.revealed ? `<button class="btn primary" id="q-next">Prossima</button>` : `<button class="btn" id="q-hint">Indizio</button><button class="btn" id="q-skip">Mostra</button>`}
    <button class="btn" id="q-exit">Termina</button></div>
    <span class="q-msg ${q.cls}">${esc(q.msg || 'Clicca sulla struttura. Hai tre tentativi.')}</span>`;
}
let wrongTimer = 0;
function quizAnswer(stack) {
  const q = state.quiz; if (!q || q.revealed) return;
  const m = M(), full = withAliases(stack);
  if (!stack.length) return;
  if (full.includes(q.target)) {
    q.right++; q.done++; q.streak++; if (q.streak > store.get('best', 0)) store.set('best', q.streak);
    q.msg = q.tries ? `Esatto, al tentativo ${q.tries + 1}.` : 'Esatto, al primo tentativo.'; q.cls = 'ok';
    reveal(true);
  } else {
    q.tries++; const wrongEl = m.shapeOf(stack[0]);
    clearTimeout(wrongTimer); Object.values(m.shapes).forEach(s => s.classList.remove('wrong'));
    if (wrongEl) { wrongEl.classList.add('wrong'); wrongTimer = setTimeout(() => wrongEl.classList.remove('wrong'), 1100); }
    Sound.play('wrong');
    if (q.tries >= 3) { q.done++; q.streak = 0; q.msg = `Hai indicato ${DATA[stack[0]].it}. Ecco la posizione corretta.`; q.cls = 'ko'; reveal(false); }
    else { q.msg = `Questo è ${DATA[stack[0]].it}. Tentativi rimasti: ${3 - q.tries}.`; q.cls = 'ko'; renderQuiz(); }
  }
}
function reveal(ok) {
  const q = state.quiz; q.revealed = true;
  const m = M(), el = m.shapeOf(q.target);
  if (selEl) selEl.classList.remove('sel'); selEl = el; el.classList.add('sel'); m.svg.classList.add('has-sel'); raise(el);
  state.sel = q.target; state.seen.add(q.target); store.set('seen', [...state.seen]);
  Sound.play(ok ? 'right' : 'reveal');
  frame(q.target); renderQuiz(); renderPanel(); renderList(); renderProgress();
}
function quizHint() {
  const q = state.quiz; if (!q || q.revealed) return;
  const e = DATA[q.target], m = M(), b = m.box[q.target];
  const k = keyOf(q.target); q.msg = `Indizio: ${VIEWS[state.view].names[k]}. ${e.loc.split('.')[0]}.`; q.cls = '';
  if (b) animateVB(fitVB(b, 2.2)); Sound.play('detent'); renderQuiz();
}

/* =====================================================================
   Cambio di tavola
   ===================================================================== */
function showView(view, opts = {}) {
  if (!models[view]) models[view] = buildModel(view);
  else stage.replaceChildren(models[view].svg);
  state.view = view; hovEl = null; state.hov = null;
  const m = M(); selEl = m.svg.querySelector('.o.sel');
  ['body', 'brain'].forEach(v => $('#v-' + v).setAttribute('aria-pressed', String(v === view)));
  $('#tav').textContent = VIEWS[view].tav; $('#cap').textContent = VIEWS[view].cap;
  applyFilters(); renderLegend(); renderRegions();
  if (state.mode === 'quiz') { m.svg.classList.add('quiz'); state.quiz.pool = quizPool(); resetView(false); nextQuestion(); }
  else {
    m.svg.classList.remove('quiz');
    const target = opts.select && m.ids.includes(opts.select) ? opts.select : (state.sel && m.ids.includes(state.sel) ? state.sel : null);
    if (selEl) selEl.classList.remove('sel'); selEl = null; state.sel = null; m.svg.classList.remove('has-sel');
    resetView(false);
    if (target) select(target, { silent: true, frame: !!opts.frame }); else { renderPanel(); renderList(); }
  }
  if (!opts.silent) Sound.play('view');
}

/* =====================================================================
   Interazione sulla tavola
   ===================================================================== */
const pointers = new Map(); let drag = null, pinch = null, hoverRaf = 0;
stage.addEventListener('pointerdown', ev => {
  Sound.unlock();
  stage.setPointerCapture(ev.pointerId);
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 1) drag = { x: ev.clientX, y: ev.clientY, vb: { ...M().vb }, moved: false };
  else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), vb: { ...M().vb } }; drag = null; }
});
stage.addEventListener('pointermove', ev => {
  if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  const pt = clientToSvg(ev.clientX, ev.clientY);
  $('#coord').textContent = `x ${pt.x.toFixed(1)}  y ${pt.y.toFixed(1)}`;
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    const m = M(); m.vb = { ...pinch.vb }; zoomAt(pinch.d / d, (a.x + b.x) / 2, (a.y + b.y) / 2); return;
  }
  if (drag) {
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; stage.classList.add('dragging'); hideTip(); }
    if (drag.moved) {
      const { W, H } = stageSize(), u = Math.max(drag.vb.w / W, drag.vb.h / H);
      setVB({ ...drag.vb, x: drag.vb.x - dx * u, y: drag.vb.y - dy * u }); return;
    }
  }
  if (ev.pointerType === 'touch') return;
  cancelAnimationFrame(hoverRaf);
  hoverRaf = requestAnimationFrame(() => {
    const st = stackAt(ev.clientX, ev.clientY), u = st[0] || null;
    setHover(u); showTip(u, ev.clientX, ev.clientY, st.length);
  });
});
function endPointer(ev) {
  const wasDrag = drag && drag.moved, wasPinch = !!pinch;
  pointers.delete(ev.pointerId);
  if (pointers.size < 2) pinch = null;
  if (ev.type === 'pointerup' && drag && !wasDrag && !wasPinch) onClick(ev.clientX, ev.clientY);
  if (pointers.size === 0) { drag = null; stage.classList.remove('dragging'); }
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('pointerleave', () => { if (!drag) { setHover(null); hideTip(); } });
stage.addEventListener('wheel', ev => {
  ev.preventDefault(); cancelAnimationFrame(anim);
  zoomAt(Math.exp(ev.deltaY * (ev.ctrlKey ? .01 : .0016)), ev.clientX, ev.clientY);
  const now = performance.now(); if (now - (stage._wt || 0) > 90) { stage._wt = now; Sound.play('detent'); }
}, { passive: false });

function onClick(x, y) {
  const st = stackAt(x, y);
  if (state.mode === 'quiz') return quizAnswer(st);
  if (!st.length) { if (state.sel) { clearSel(); Sound.play('latch'); } return; }
  const full = withAliases(st);
  const same = state.lastPt && Math.hypot(state.lastPt.x - x, state.lastPt.y - y) < 6 && state.sel && full.includes(state.sel);
  state.lastPt = { x, y };
  if (same && full.length > 1) {
    const next = full[(full.indexOf(state.sel) + 1) % full.length];
    select(next, { stack: full, deeper: true });
  } else select(full[0], { stack: full });
}
function showTip(uid, x, y, depth) {
  if (!uid || state.mode === 'quiz') return hideTip();
  const e = DATA[uid]; if (!e) return hideTip();
  tip.innerHTML = `<b>${esc(e.it)}</b><em>${esc(e.la)}</em><span>${uid.replace('_', ':')}${depth > 1 ? ` · ${depth} livelli` : ''}</span>`;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(x, innerWidth - w - 24) + 'px'; tip.style.top = Math.min(y, innerHeight - h - 24) + 'px';
  tip.classList.add('on');
}
function hideTip() { tip.classList.remove('on'); }

/* =====================================================================
   Eventi dell'interfaccia
   ===================================================================== */
document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
$('#v-body').onclick = () => state.view !== 'body' && showView('body');
$('#v-brain').onclick = () => state.view !== 'brain' && showView('brain');
$('#m-explore').onclick = () => state.mode === 'quiz' && stopQuiz();
$('#m-quiz').onclick = () => state.mode !== 'quiz' && startQuiz();
$('#z-in').onclick = () => { zoomAt(1 / 1.6, null, null, true); Sound.play('detent'); };
$('#z-out').onclick = () => { zoomAt(1.6, null, null, true); Sound.play('detent'); };
$('#z-fit').onclick = () => { state.sel ? frame(state.sel) : resetView(); Sound.play('detent'); };
$('#z-reset').onclick = () => { resetView(); Sound.play('detent'); };

const sndBtn = $('#snd');
function renderSnd() {
  const on = Sound.on;
  sndBtn.setAttribute('aria-pressed', String(on)); sndBtn.setAttribute('aria-label', on ? 'Suoni attivi' : 'Suoni disattivati');
  sndBtn.innerHTML = `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 7h3l4-3v10l-4-3H3z" fill="currentColor" stroke="none"/>${on ? '<path d="M12.5 6.5a3.5 3.5 0 010 5M14.5 4.5a6.4 6.4 0 010 9"/>' : '<path d="M12.5 7l4 4M16.5 7l-4 4"/>'}</svg>`;
}
sndBtn.onclick = () => { Sound.toggle(); renderSnd(); };

$('#q').addEventListener('input', ev => { state.q = ev.target.value; renderList(); });
$('#q').addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { const b = $('#list .item'); if (b) { selectFromList(b.dataset.uid); ev.target.blur(); } }
  if (ev.key === 'Escape') { ev.target.value = ''; state.q = ''; renderList(); ev.target.blur(); }
});
function selectFromList(uid) {
  if (state.mode === 'quiz') return toast('Termina l’esercitazione per consultare l’indice.');
  select(uid, { frame: true });
}
const list = $('#list');
list.addEventListener('click', ev => { const b = ev.target.closest('.item'); if (b) selectFromList(b.dataset.uid); });
list.addEventListener('pointerenter', () => listHover = true); list.addEventListener('pointerleave', () => { listHover = false; setHover(null); });
list.addEventListener('pointerover', ev => { const b = ev.target.closest('.item'); if (b && state.mode !== 'quiz') setHover(b.dataset.uid); });

$('#legend').addEventListener('click', ev => {
  const b = ev.target.closest('[data-k]'); if (!b) return;
  const hid = state.hidden[state.view], k = b.dataset.k, V = VIEWS[state.view];
  if (k === '*') hid.clear();
  else if (ev.altKey || ev.metaKey) { hid.clear(); V.order.forEach(x => x !== k && hid.add(x)); }
  else hid.has(k) ? hid.delete(k) : hid.add(k);
  if (state.sel && hid.has(keyOf(state.sel))) clearSel();
  Sound.play('latch'); applyFilters(); renderLegend(); renderList();
});
$('#legend').addEventListener('dblclick', ev => {
  const b = ev.target.closest('[data-k]'); if (!b || b.dataset.k === '*') return;
  const hid = state.hidden[state.view]; hid.clear(); VIEWS[state.view].order.forEach(x => x !== b.dataset.k && hid.add(x));
  applyFilters(); renderLegend(); renderList(); toast(`Solo: ${VIEWS[state.view].names[b.dataset.k]}`);
});
$('#regions').addEventListener('click', ev => {
  const b = ev.target.closest('[data-r]'); if (!b) return;
  const r = M().regions[+b.dataset.r]; animateVB(fitVB(r[1], +b.dataset.r === 0 ? .03 : .06)); Sound.play('detent');
});
$('#panel').addEventListener('click', ev => {
  const t = ev.target.closest('[data-tab]'); if (t) return setTab(t.dataset.tab);
  const g = ev.target.closest('[data-go]'); if (g) return select(g.dataset.go, g.dataset.keep ? { keepStack: true, deeper: true } : { frame: true });
  if (ev.target.id === 'frame') { frame(state.sel); Sound.play('detent'); }
  if (ev.target.id === 'copy') {
    const id = state.sel.replace('_', ':');
    try { navigator.clipboard.writeText(id).then(() => toast(`${id} copiato`), () => toast(id)); } catch { toast(id); }
    Sound.play('latch');
  }
});
$('#panel').addEventListener('keydown', ev => {
  const t = ev.target.closest('[role="tab"]'); if (!t) return;
  const i = TABS.findIndex(x => x[0] === state.tab);
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
    ev.preventDefault(); setTab(TABS[(i + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]);
    $(`#tab-${state.tab}`).focus();
  }
});
$('#quiz').addEventListener('click', ev => {
  const id = ev.target.id;
  if (id === 'q-next') nextQuestion();
  if (id === 'q-hint') quizHint();
  if (id === 'q-skip') { const q = state.quiz; q.done++; q.streak = 0; q.msg = 'Ecco dove si trova.'; q.cls = ''; reveal(false); }
  if (id === 'q-exit') stopQuiz();
});
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

document.addEventListener('keydown', ev => {
  if (ev.target.matches('input')) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key;
  if (k === '/') { ev.preventDefault(); $('#q').focus(); return; }
  if (state.mode === 'quiz') {
    if (k === 'Enter' && state.quiz && state.quiz.revealed) nextQuestion();
    else if (k === 'h' || k === 'H') quizHint();
    else if (k === 'Escape') stopQuiz();
    return;
  }
  if (k >= '1' && k <= '5' && state.sel) setTab(TABS[+k - 1][0]);
  else if (k === 'ArrowDown' || k === 'ArrowUp') {
    if (ev.target.closest && ev.target.closest('[role="tab"]')) return;
    ev.preventDefault(); const ids = orderedIds().filter(u => matches(u, norm(state.q.trim())));
    const i = ids.indexOf(state.sel), n = ids[(i + (k === 'ArrowDown' ? 1 : ids.length - 1) + (i < 0 && k === 'ArrowUp' ? 1 : 0)) % ids.length];
    if (n) select(n, { frame: true });
  }
  else if (k === '+' || k === '=') { zoomAt(1 / 1.6, null, null, true); Sound.play('detent'); }
  else if (k === '-' || k === '_') { zoomAt(1.6, null, null, true); Sound.play('detent'); }
  else if (k === '0') { resetView(); Sound.play('detent'); }
  else if (k === 'f' || k === 'F') { state.sel ? frame(state.sel) : resetView(); }
  else if (k === 's' || k === 'S') { Sound.toggle(); renderSnd(); }
  else if (k === 'Escape' && state.sel) { clearSel(); Sound.play('latch'); }
});
new ResizeObserver(() => { const m = M(); if (m && stageSize().r.width > 0) { const c = { x: m.vb.x + m.vb.w / 2, y: m.vb.y + m.vb.h / 2 }; const t = fitVB({ x: c.x - m.vb.w / 2, y: c.y - m.vb.h / 2, w: m.vb.w, h: m.vb.h }, 0); setVB(t); } }).observe(sheet);

/* =====================================================================
   Avvio
   ===================================================================== */
// Presenza nelle due tavole calcolata dai template, senza costruire subito entrambe le viste.
const PRESENCE = {};
for (const v of Object.keys(VIEWS)) {
  const t = document.getElementById(VIEWS[v].tpl).content; const s = new Set();
  t.querySelectorAll('[id^="UBERON_"], [id^="CL_"]').forEach(n => s.add(SVG_FIX[n.id] || n.id));
  PRESENCE[v] = s;
}
// L'ancora #UBERON_… coincide con l'id della forma nell'SVG: il browser scorrerebbe fino a lei. Annulliamo quello scorrimento.
const unscroll = () => { scrollTo(0, 0); document.querySelectorAll('.plate, .panel').forEach(c => { c.scrollTop = 0; }); };
try { history.scrollRestoration = 'manual'; } catch {}
addEventListener('load', () => setTimeout(unscroll, 0));
window.addEventListener('hashchange', () => {
  unscroll();
  const id = location.hash.slice(1);
  if (!DATA[id] || id === state.sel || state.mode !== 'explore') return;
  const v = PRESENCE[state.view].has(id) ? state.view : (PRESENCE.body.has(id) ? 'body' : 'brain');
  if (v !== state.view) showView(v, { select: id, frame: true }); else select(id, { frame: true });
});
renderSnd(); renderProgress();
const h = (location.hash || '').slice(1);
const start = DATA[h] ? h : 'UBERON_0000948';
const startView = PRESENCE.body.has(start) ? 'body' : 'brain';
// La geometria si misura sullo schermo: se la pagina si apre in una scheda non ancora visibile
// la tavola misura 0 px, quindi si attende che abbia dimensioni prima di costruire il modello.
const sized = () => { const r = stage.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
if (sized()) showView(startView, { select: start, frame: !!DATA[h], silent: true });
else { const ro = new ResizeObserver(() => { if (!sized()) return; ro.disconnect(); showView(startView, { select: start, frame: !!DATA[h], silent: true }); }); ro.observe(stage); }
})();
