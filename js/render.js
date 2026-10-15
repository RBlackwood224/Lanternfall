'use strict';
// ===== Rendering: world, lighting, fog, overlay text =====
const R = { VW: 400, VH: 225, t: 0, cam: { x: 0, y: 0 }, layers: null, shake: 0, beat: 0, flashT: 0 };

function initRenderer() {
  R.scene = document.getElementById('game');
  R.sctx = R.scene.getContext('2d');
  R.ov = document.getElementById('overlay');
  R.octx = R.ov.getContext('2d');
  R.light = mkCanvas(R.VW, R.VH); R.lctx = R.light.getContext('2d');
  // fog texture
  R.fog = mkCanvas(256, 256);
  const fx = R.fog.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 20 + Math.random() * 50;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      const gr = fx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, 'rgba(190,205,220,0.35)'); gr.addColorStop(1, 'rgba(190,205,220,0)');
      fx.fillStyle = gr; fx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  window.addEventListener('resize', resizeRenderer);
  resizeRenderer();
}
function resizeRenderer() {
  const ww = window.innerWidth, wh = window.innerHeight;
  const aspect = Math.max(1.3, Math.min(2.25, ww / wh));
  R.VW = Math.round(225 * aspect / 2) * 2; R.VH = 225;
  R.scene.width = R.VW; R.scene.height = R.VH;
  R.light.width = R.VW; R.light.height = R.VH;
  let cw = ww, ch = ww / (R.VW / R.VH);
  if (ch > wh) { ch = wh; cw = wh * R.VW / R.VH; }
  for (const c of [R.scene, R.ov]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; c.style.left = (ww - cw) / 2 + 'px'; c.style.top = (wh - ch) / 2 + 'px'; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  R.ov.width = Math.round(cw * dpr); R.ov.height = Math.round(ch * dpr);
  R.scale = R.ov.width / R.VW;
  R.cssScale = cw / R.VW;
  R.vig = mkCanvas(R.VW, R.VH);
  const v = R.vig.getContext('2d'), gr = v.createRadialGradient(R.VW / 2, R.VH / 2, R.VH * 0.35, R.VW / 2, R.VH / 2, R.VW * 0.62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.75)');
  v.fillStyle = gr; v.fillRect(0, 0, R.VW, R.VH);
  R.redVig = mkCanvas(R.VW, R.VH);
  const rv = R.redVig.getContext('2d'), g2 = rv.createRadialGradient(R.VW / 2, R.VH / 2, R.VH * 0.3, R.VW / 2, R.VH / 2, R.VW * 0.6);
  g2.addColorStop(0, 'rgba(120,0,0,0)'); g2.addColorStop(1, 'rgba(150,0,0,0.85)');
  rv.fillStyle = g2; rv.fillRect(0, 0, R.VW, R.VH);
}
function setWorld(G) { R.layers = buildWorldLayers(G.map); }

const LIGHT_COL = { lantern: [255, 206, 140], altar: [255, 150, 70], window: [255, 180, 100], flare: [255, 236, 200], holy: [210, 225, 255], fake: [255, 206, 140] };

function ex(e) { return e.rx !== undefined ? e.rx : e.x; }
function ey(e) { return e.ry !== undefined ? e.ry : e.y; }

// what the local viewer can see of the creature
function creatureVisibility(G, m, viewer) {
  if (!m) return 0;
  if (!viewer) return 1;
  if (viewer.side === 'm') return 1;
  if (monsterVisibleToAll(G, m)) return 1;
  const d = Math.hypot(ex(m) - ex(viewer), ey(m) - ey(viewer));
  if (viewer.state === 'ghost') return d < 70 ? 0.6 : 0;
  if (d < 46) return 0.15; // just the eyes in the dark
  return 0;
}

function renderGame(G, viewer, dt, cams) {
  R.t += dt;
  const c = R.sctx, VW = R.VW, VH = R.VH, map = G.map, L = R.layers;
  const m = monster(G);
  const vKind = !viewer ? 'spec' : viewer.side === 'm' ? 'm' : (viewer.state === 'ghost' ? 'g' : 'v');
  // camera
  let tx = map.spawn.x, ty = map.spawn.y;
  if (cams && cams.length) { tx = 0; ty = 0; for (const e of cams) { tx += ex(e); ty += ey(e); } tx /= cams.length; ty /= cams.length; }
  const camX = Math.round(Math.max(0, Math.min(map.w * TILE - VW, tx - VW / 2)));
  const camY = Math.round(Math.max(0, Math.min(map.h * TILE - VH, ty - VH / 2)));
  R.shake = Math.max(0, R.shake - dt * 8);
  const sx = R.shake > 0 ? Math.round((Math.random() - 0.5) * R.shake * 3) : 0, sy = R.shake > 0 ? Math.round((Math.random() - 0.5) * R.shake * 3) : 0;
  R.cam.x = camX + sx; R.cam.y = camY + sy;
  const ox = -R.cam.x, oy = -R.cam.y;
  const onScr = (x, y, pad) => x + ox > -pad && x + ox < VW + pad && y + oy > -pad && y + oy < VH + pad;
  c.globalCompositeOperation = 'source-over';
  c.imageSmoothingEnabled = false;
  c.fillStyle = '#0a0f0c'; c.fillRect(0, 0, VW, VH);
  c.drawImage(L.ground, R.cam.x, R.cam.y, VW, VH, 0, 0, VW, VH);

  // ---- decals ----
  for (const z of G.fx.salt) ring(c, z.x + ox, z.y + oy, z.r, '#e8e8f2', 0.9, 14);
  for (const z of G.fx.holy) { c.fillStyle = 'rgba(230,210,140,0.12)'; c.beginPath(); c.arc(z.x + ox, z.y + oy, z.r, 0, 7); c.fill(); ring(c, z.x + ox, z.y + oy, z.r, '#f0d890', 1, 24); }
  for (const t of G.fx.iron) c.drawImage(ART.trap, Math.round(t.x + ox - 3), Math.round(t.y + oy - 2));
  if (vKind === 'm') {
    for (const h of G.fx.hex) ring(c, h.x + ox, h.y + oy, 10, '#b070e0', 0.8, 8);
    for (const n of G.fx.noise) ring(c, n.x + ox, n.y + oy, 4 + (0.8 - n.t) * 26, '#e0d0ff', Math.max(0, n.t), 12);
  }
  // altar oil pips
  for (const a of G.altars) {
    if (!onScr(a.x, a.y, 20)) continue;
    if (!a.lit) for (let k = 0; k < a.need; k++) { c.fillStyle = k < a.oil ? '#e0a040' : '#2a2420'; c.fillRect(Math.round(a.x + ox - a.need * 2 + k * 4), Math.round(a.y + oy - 12), 3, 2); }
  }
  // items
  for (const it of G.items) {
    if (!onScr(it.x, it.y, 10)) continue;
    const bob = Math.round(Math.sin(R.t * 3 + it.id) * 1);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(Math.round(it.x + ox - 3), Math.round(it.y + oy + 3), 7, 1);
    c.drawImage(ART.item[it.type], Math.round(it.x + ox - 3), Math.round(it.y + oy - 4 + bob));
  }
  // cage + caged villagers
  const cage = map.cage;
  const emis = [];
  for (const v of G.ents) if (v.side === 'v' && v.state === 'caged') drawVillager(c, v, ox, oy, emis, G);
  c.drawImage(ART.cage, Math.round(cage.x + ox - 9), Math.round(cage.y + oy - 9));

  // ---- entities, sorted by y ----
  const list = [];
  for (const e of G.ents) {
    if (e.side === 'v') {
      if (e.state === 'hidden' || e.state === 'caged' || e.state === 'carried') continue;
      if (e.state === 'ghost') { if (vKind !== 'm') list.push(e); continue; }
      if (vKind === 'm' && !(m && monsterSees(G, m, e))) continue;
      list.push(e);
    } else list.push(e);
  }
  list.sort((a, b) => ey(a) - ey(b));
  const mVis = creatureVisibility(G, m, viewer);
  for (const e of list) {
    if (!onScr(ex(e), ey(e), 24)) continue;
    if (e.side === 'v') drawVillager(c, e, ox, oy, emis, G);
    else drawCreature(c, G, e, ox, oy, mVis, emis, vKind);
  }
  // canopy
  c.drawImage(L.canopy, R.cam.x, R.cam.y, VW, VH, 0, 0, VW, VH);
  // projectiles
  for (const p of G.fx.proj) { c.fillStyle = '#9ad0ff'; c.fillRect(Math.round(p.x + ox - 1), Math.round(p.y + oy - 1), 3, 3); emis.push({ k: 'dot', x: p.x, y: p.y, col: '#d0eaff' }); }

  // ---- lighting ----
  const lc = R.lctx;
  lc.globalCompositeOperation = 'source-over';
  lc.fillStyle = rgbStr(ambientColor(G, vKind)); lc.fillRect(0, 0, VW, VH);
  lc.globalCompositeOperation = 'lighter';
  const lights = worldLights(G);
  for (const f of G.fx.fake) lights.push({ x: f.x, y: f.y - 6 + Math.sin(R.t * 2 + f.x) * 2, r: 50, kind: 'fake' });
  for (const l of lights) {
    if (!onScr(l.x, l.y, l.r + 4)) continue;
    let r = l.r;
    if (l.kind === 'lantern' || l.kind === 'altar' || l.kind === 'fake') r *= 1 + 0.05 * Math.sin(R.t * 9 + l.x) + 0.03 * Math.sin(R.t * 23 + l.y);
    const s = lightSprite(r, LIGHT_COL[l.kind] || LIGHT_COL.lantern, l.kind === 'window' ? 0.8 : 1.15);
    lc.drawImage(s, Math.round(l.x + ox - s.width / 2), Math.round(l.y + oy - s.height / 2));
  }
  // creature sees a little around itself
  if (vKind === 'm' && m) { const s = lightSprite(70, [120, 90, 150], 0.7); lc.drawImage(s, Math.round(ex(m) + ox - s.width / 2), Math.round(ey(m) + oy - s.height / 2)); }
  if (vKind === 'g' && viewer) { const s = lightSprite(50, [120, 150, 190], 0.6); lc.drawImage(s, Math.round(ex(viewer) + ox - s.width / 2), Math.round(ey(viewer) + oy - s.height / 2)); }
  if (vKind === 'v' && viewer && lanternRadius(G, viewer) === 0) { const s = lightSprite(16, [90, 100, 130], 0.6); lc.drawImage(s, Math.round(ex(viewer) + ox - s.width / 2), Math.round(ey(viewer) + oy - s.height / 2)); }
  c.globalCompositeOperation = 'multiply';
  c.drawImage(R.light, 0, 0);
  c.globalCompositeOperation = 'source-over';

  // ---- emissive ----
  const tf = Math.floor(R.t * 12);
  for (const a of G.altars) {
    if (!onScr(a.x, a.y, 30)) continue;
    if (a.lit) flame(c, a.x + ox, a.y + oy - 6, 3, tf + a.id * 7, 9);
    else if (a.oil > 0) { c.fillStyle = (tf + a.id) % 6 < 3 ? '#a04018' : '#702a10'; c.fillRect(Math.round(a.x + ox - 2), Math.round(a.y + oy - 6), 4, 1); }
  }
  for (const w of L.windows) {
    if (!onScr(w.x, w.y, 10)) continue;
    const fl = 0.85 + 0.15 * Math.sin(R.t * 3 + w.x);
    if (w.stained) { c.fillStyle = rgbStr([200 * fl, 120 * fl, 60 * fl]); c.fillRect(w.x + ox, w.y + oy, w.w, w.h); c.fillStyle = rgbStr([80 * fl, 120 * fl, 200 * fl]); c.fillRect(w.x + ox + 1, w.y + oy + 1, w.w - 2, 2); c.fillStyle = '#2a1a10'; c.fillRect(w.x + ox + 2, w.y + oy, 1, w.h); }
    else { c.fillStyle = rgbStr([255 * fl, 200 * fl, 96 * fl]); c.fillRect(w.x + ox, w.y + oy, w.w, w.h); c.fillStyle = '#5a3a1c'; c.fillRect(w.x + ox + 2, w.y + oy, 1, w.h); c.fillRect(w.x + ox, w.y + oy + 2, w.w, 1); }
  }
  for (const f of G.fx.fake) { const yy = f.y - 6 + Math.sin(R.t * 2 + f.x) * 2; c.fillStyle = '#ffe080'; c.fillRect(Math.round(f.x + ox - 1), Math.round(yy + oy - 1), 2, 3); c.fillStyle = '#fff4c0'; c.fillRect(Math.round(f.x + ox - 1), Math.round(yy + oy), 1, 1); }
  for (const f of G.fx.flare) { flame(c, f.x + ox, f.y + oy - 3, 2, tf + 3, 6); }
  for (const e of emis) {
    if (e.k === 'lantern') { c.fillStyle = '#ffd878'; c.fillRect(Math.round(e.x + ox), Math.round(e.y + oy), 2, 3); c.fillStyle = '#fff6d0'; c.fillRect(Math.round(e.x + ox), Math.round(e.y + oy + 1), 1, 1); }
    else if (e.k === 'eyes') { c.globalAlpha = e.a; c.fillStyle = e.col; for (const p of e.p) c.fillRect(Math.round(p[0] + ox), Math.round(p[1] + oy), 1, 1); c.globalAlpha = 1; }
    else if (e.k === 'dot') { c.fillStyle = e.col; c.fillRect(Math.round(e.x + ox), Math.round(e.y + oy), 1, 1); }
    else if (e.k === 'smoke') { c.globalAlpha = 0.6; c.fillStyle = '#a080c0'; c.fillRect(Math.round(e.x + ox), Math.round(e.y + oy), 1, 1); c.globalAlpha = 1; }
  }
  // fog
  const fogA = G.special === 'fog' ? 0.32 : 0.13;
  c.globalAlpha = fogA; c.globalCompositeOperation = 'screen';
  const fxo = ((R.t * 6 + R.cam.x * 0.6) % 256 + 256) % 256, fyo = ((R.t * 2 + R.cam.y * 0.6) % 256 + 256) % 256;
  for (let y = -fyo; y < VH; y += 256) for (let x = -fxo; x < VW; x += 256) c.drawImage(R.fog, Math.round(x), Math.round(y));
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  // lightning
  if (G.lightT > 0) { c.fillStyle = `rgba(220,230,255,${Math.min(0.75, G.lightT * 2.2)})`; c.fillRect(0, 0, VW, VH); }
  if (R.flashT > 0) { R.flashT -= dt; c.fillStyle = `rgba(255,240,200,${R.flashT})`; c.fillRect(0, 0, VW, VH); }
  c.drawImage(R.vig, 0, 0);
  // heartbeat
  if (vKind === 'v' && m && viewer.state !== 'hidden') {
    const d = Math.hypot(ex(m) - ex(viewer), ey(m) - ey(viewer));
    const range = viewer.role === 'herbwoman' ? 190 : 140;
    const k = Math.max(0, 1 - d / range);
    R.beatK = G.t > DUSK - 5 ? k : 0;
  } else R.beatK = 0;
  if (R.beatK > 0) {
    const rate = 1.1 + R.beatK * 1.6;
    R.beat += dt * rate;
    const ph = R.beat % 1, pulse = ph < 0.12 ? 1 : ph < 0.25 ? 0.3 : ph < 0.37 ? 0.8 : 0;
    c.globalAlpha = R.beatK * (0.25 + 0.5 * pulse); c.drawImage(R.redVig, 0, 0); c.globalAlpha = 1;
  }
  if (G.manifested) { c.fillStyle = `rgba(120,0,20,${0.06 + 0.04 * Math.sin(R.t * 4)})`; c.fillRect(0, 0, VW, VH); }

  drawOverlay(G, viewer, vKind, ox, oy, mVis);
}

function ambientColor(G, vKind) {
  let a;
  if (vKind === 'm') a = [74, 60, 100];
  else if (vKind === 'g') a = [50, 60, 84];
  else a = [24, 29, 54];
  if (G.special === 'bloodmoon') a = mix(a, [92, 34, 44], 0.45);
  if (G.special === 'storm') a = shade(a, 0.85);
  if (G.special === 'fog') a = mix(a, [70, 80, 96], 0.3);
  // dusk -> night, and the dawn creeping in
  if (G.t < DUSK) a = mix([140, 100, 112], a, Math.min(1, G.t / DUSK));
  const left = G.nightLen - G.t;
  if (left < 60) a = mix(a, [150, 150, 170], Math.max(0, (60 - left) / 60) * 0.7);
  return a;
}

function ring(c, x, y, r, col, a, n) {
  c.globalAlpha = Math.max(0, Math.min(1, a)); c.fillStyle = col;
  const cnt = Math.max(8, Math.round(r * 1.6));
  for (let i = 0; i < cnt; i++) { if (n && i % 3 === 2) continue; const t = i / cnt * Math.PI * 2 + R.t * 0.4; c.fillRect(Math.round(x + Math.cos(t) * r), Math.round(y + Math.sin(t) * r * 0.75), 1, 1); }
  c.globalAlpha = 1;
}
function flame(c, x, y, w0, tf, hgt) {
  for (let j = 0; j < hgt; j++) for (let i = -w0; i <= w0; i++) {
    const w = w0 + 0.3 - j * (w0 / hgt) * 1.1;
    if (Math.abs(i) <= w && hash2(i + tf * 7, j + tf) > 0.1 + j * 0.07) {
      c.fillStyle = j < hgt * 0.3 ? '#fff0a0' : j < hgt * 0.6 ? '#ffa030' : '#d0481a';
      c.fillRect(Math.round(x + i), Math.round(y - j), 1, 1);
    }
  }
}

function drawVillager(c, v, ox, oy, emis, G) {
  const x = Math.round(ex(v) + ox), y = Math.round(ey(v) + oy);
  if (v.state === 'ghost') {
    c.globalAlpha = 0.5 + 0.15 * Math.sin(R.t * 3 + v.id);
    c.drawImage(ART.ghost, x - 4, y - 12 + Math.round(Math.sin(R.t * 2 + v.id) * 2));
    c.globalAlpha = 1; return;
  }
  const fr = ART.v[v.role];
  const f = v.moving ? 1 + (Math.floor(v.walk || 0) % 2) : 0;
  const back = v.fy < -0.5 && Math.abs(v.fx) < 0.8;
  const flip = v.fx < -0.1;
  const set = back ? (flip ? fr.backF : fr.back) : (flip ? fr.frontF : fr.front);
  c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x - 3, y, 7, 1);
  const bob = v.moving && (Math.floor(v.walk || 0) % 2) ? 1 : 0;
  c.drawImage(set[f], x - 4, y - 11 + bob);
  if (v.state === 'wounded' && Math.floor(R.t * 3) % 2) { c.fillStyle = '#c02020'; c.fillRect(x + (flip ? -2 : 2), y - 6, 1, 2); }
  const lr = lanternRadius(G, v);
  if (lr > 0 && !back) emis.push({ k: 'lantern', x: ex(v) + (flip ? -4 : 4), y: ey(v) - 6 + bob });
  else if (lr > 0) emis.push({ k: 'lantern', x: ex(v) + (flip ? -4 : 4), y: ey(v) - 7 });
  if (v.incenseT > 0 && Math.floor(R.t * 6) % 2) emis.push({ k: 'smoke', x: ex(v) + Math.sin(R.t * 4 + v.id) * 3, y: ey(v) - 13 - (R.t * 8 % 5) });
  if (v.cans > 0) c.drawImage(ART.item.can, x + (flip ? 2 : -9), y - 7);
}

function drawCreature(c, G, m, ox, oy, vis, emis, vKind) {
  if (vis <= 0) return;
  const x = Math.round(ex(m) + ox), y = Math.round(ey(m) + oy);
  const spr = ART.c[m.creature], info = ART.eyes[m.creature];
  const flip = m.fx < -0.1 ? 1 : 0;
  const alt = m.moving && Math.floor((m.walk || 0)) % 2 ? 2 : 0;
  const img = spr[alt + flip];
  const w = info.w, h = info.h;
  const bx = x - Math.floor(w / 2), by = y - h + (m.creature === 'wisp' ? Math.round(Math.sin(R.t * 3) * 1.5) - 2 : 0);
  if (vis >= 0.5) {
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x - 5, y, 11, 2);
    c.globalAlpha = vis;
    if (G.manifested && Math.floor(R.t * 6) % 2) { c.globalAlpha = vis * 0.6; c.drawImage(img, bx - 1, by); c.drawImage(img, bx + 1, by); c.globalAlpha = vis; }
    c.drawImage(img, bx, by);
    c.globalAlpha = 1;
    // carried victim
    if (m.carrying >= 0) {
      const v = G.ents.find(e => e.id === m.carrying);
      if (v) { c.save(); c.translate(x, by + 2); c.rotate(Math.PI / 2 * (flip ? -1 : 1)); c.drawImage(ART.v[v.role].front[0], -5, -4); c.restore(); }
    }
    if (m.stunT > 0) for (let i = 0; i < 3; i++) { const a = R.t * 6 + i * 2.1; emis.push({ k: 'dot', x: ex(m) + Math.cos(a) * 6, y: ey(m) - h - 2 + Math.sin(a) * 2, col: '#ffe080' }); }
    if (m.rootT > 0) { c.fillStyle = '#8a8a94'; c.fillRect(x - 5, y - 1, 11, 1); }
  }
  if (m.stunT <= 0 || vis < 0.5) {
    const blink = Math.floor(R.t * 1.7 + m.id) % 7 === 0;
    if (!blink) emis.push({ k: 'eyes', p: info.pos.map(p => [ex(m) - Math.floor(w / 2) + (flip ? w - 1 - p[0] : p[0]), ey(m) - h + p[1] + (by - (y - h))]), col: '#ff3028', a: vis < 0.5 ? 0.9 : 1 });
  }
}

// ---- hi-res overlay: names, pings, prompts ----
function drawOverlay(G, viewer, vKind, ox, oy, mVis) {
  const o = R.octx, s = R.scale;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, R.ov.width, R.ov.height);
  const fs = Math.max(10, Math.round(3.3 * s));
  o.font = `${fs}px ${UI_FONT}`; o.textAlign = 'center'; o.textBaseline = 'bottom';
  const text = (str, x, y, col, size) => {
    if (size) o.font = `${size}px ${UI_FONT}`;
    o.fillStyle = 'rgba(0,0,0,0.75)'; o.fillText(str, x + 1, y + 1);
    o.fillStyle = col; o.fillText(str, x, y);
    if (size) o.font = `${fs}px ${UI_FONT}`;
  };
  // names
  for (const e of G.ents) {
    if (e.side !== 'v' || e.state === 'hidden' || e.state === 'carried') continue;
    if (vKind === 'm') { const mm = monster(G); if (!(mm && monsterSees(G, mm, e))) continue; }
    if (e.state === 'ghost' && vKind === 'm') continue;
    const x = (ex(e) + ox) * s, y = (ey(e) + oy - 13) * s;
    if (x < -50 || x > R.ov.width + 50 || y < -20 || y > R.ov.height + 20) continue;
    let col = e === viewer ? '#ffe9a8' : '#e6e2d8';
    if (e.state === 'wounded') col = '#ff9a8a';
    if (e.state === 'ghost') col = '#a8c4e8';
    if (e.state === 'caged') col = '#ff7060';
    text(e.name + (e.state === 'caged' ? ` ${Math.ceil(e.cageT || 0)}` : ''), x, y, col);
  }
  const m = monster(G);
  if (m && (vKind === 'm' || mVis >= 0.5)) {
    const x = (ex(m) + ox) * s, y = (ey(m) + oy - 20) * s;
    if (vKind !== 'm') text(t('cr_' + m.creature), x, y, '#ff8070');
    if (G.manifested) {
      const w = 16 * s, hgt = 2 * s;
      o.fillStyle = '#200'; o.fillRect(x - w / 2, y + 2, w, hgt);
      o.fillStyle = '#e03030'; o.fillRect(x - w / 2, y + 2, w * Math.max(0, m.hp) / m.maxHp, hgt);
    }
  }
  // action progress above the local player
  if (viewer && viewer.side === 'v' && viewer.actFrac > 0) {
    const x = (ex(viewer) + ox) * s, y = (ey(viewer) + oy - 16) * s;
    o.lineWidth = Math.max(2, s * 0.8); o.strokeStyle = 'rgba(0,0,0,0.6)';
    o.beginPath(); o.arc(x, y - 6 * s, 3 * s, 0, Math.PI * 2); o.stroke();
    o.strokeStyle = '#ffd36a'; o.beginPath(); o.arc(x, y - 6 * s, 3 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, viewer.actFrac)); o.stroke();
  }
  if (viewer && viewer.side === 'm' && m && m.searchFrac > 0) {
    const x = (ex(m) + ox) * s, y = (ey(m) + oy - 22) * s;
    o.lineWidth = Math.max(2, s * 0.8); o.strokeStyle = '#c070ff';
    o.beginPath(); o.arc(x, y - 4 * s, 3 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, m.searchFrac)); o.stroke();
  }
  // pings (creature doesn't see villager pings, only its own fakes are shown to it)
  for (const p of G.fx.pings) {
    if (vKind === 'm' && !p.fake) continue;
    let x = (p.x + ox) * s, y = (p.y + oy - 24) * s;
    const W = R.ov.width, H = R.ov.height, pad = 24 * (s / 3);
    const off = x < pad || x > W - pad || y < pad || y > H - pad;
    x = Math.max(pad, Math.min(W - pad, x)); y = Math.max(pad * 1.6, Math.min(H - pad, y));
    const col = ['#fff', '#ff7a6a', '#ffcf6a', '#ff5050', '#9ad0ff'][p.kind] || '#fff';
    const pulse = 1 + 0.15 * Math.sin(R.t * 8);
    o.fillStyle = col; o.beginPath(); o.arc(x, y - fs * 1.4, fs * 0.45 * pulse, 0, Math.PI * 2); o.fill();
    text(t('ping' + p.kind), x, y - fs * 0.1, col);
    text(p.name, x, y + fs * 1.0, '#ddd', Math.round(fs * 0.85));
    if (off) text('➤', x, y - fs * 2.2, col);
  }
}
