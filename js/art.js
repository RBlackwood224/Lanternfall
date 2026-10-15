'use strict';
// ===== Procedural pixel art =====
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function hexRgb(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function rgbStr(c, a) { return a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function shade(c, k) { return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// draw an ascii sprite into a new canvas; palette: char -> hex color
function spriteFrom(rows, pal, flip) {
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const c = mkCanvas(w, h), x = c.getContext('2d');
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      const ch = r[i]; if (ch === '.' || ch === ' ' || !pal[ch]) continue;
      x.fillStyle = pal[ch]; x.fillRect(flip ? w - 1 - i : i, j, 1, 1);
    }
  });
  return c;
}
function findChars(rows, ch) { const out = []; rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === ch) out.push([i, j]); }); return out; }

const ART = {};

// ---------- villagers ----------
const V_FRONT_TOP = ['..kkkk..', '.khhhhk.', '.kssssk.', '.ksesek.', '..kssk..'];
const V_BACK_TOP = ['..kkkk..', '.khhhhk.', '.khhhhk.', '.khhhhk.', '..kssk..'];
const V_BODY = ['.kcccck.', 'kccddcck', 'kcbbbbck', '.kccdck.'];
const V_LEGS = [['.kl..lk.', '.kk..kk.'], ['.kl..lk.', 'kk....kk'], ['.kl..lk.', '..kk.kk.']];
const ROLE_PAL = {
  priest: { c: '#d8d2c2', d: '#a8a294', h: '#d8d2c2', b: '#c9a24a', l: '#3a3428' },
  smith: { c: '#7a4e36', d: '#4e3022', h: '#2a201a', b: '#9a9aa2', l: '#2a2220' },
  herbwoman: { c: '#4e7e46', d: '#2e5228', h: '#3a5e32', b: '#b08a5a', l: '#2a3220' },
  watchman: { c: '#3e5e92', d: '#26406a', h: '#22262e', b: '#c9a24a', l: '#22283a' },
  miller: { c: '#c49438', d: '#8e6624', h: '#e8e2d2', b: '#6a4a2a', l: '#4a3a22' },
};
function villagerFrames(role) {
  const p = ROLE_PAL[role];
  const pal = { k: '#16100e', h: p.h, s: '#e2b48c', e: '#2a1a14', c: p.c, d: p.d, b: p.b, l: p.l };
  const out = { front: [], back: [], frontF: [], backF: [] };
  for (let f = 0; f < 3; f++) {
    const fr = V_FRONT_TOP.concat(V_BODY, V_LEGS[f]);
    const br = V_BACK_TOP.concat(V_BODY, V_LEGS[f]);
    out.front.push(spriteFrom(fr, pal)); out.frontF.push(spriteFrom(fr, pal, true));
    out.back.push(spriteFrom(br, pal)); out.backF.push(spriteFrom(br, pal, true));
  }
  // role marks
  const mark = (cv, fn) => { const x = cv.getContext('2d'); fn(x); };
  for (const arr of [out.front, out.frontF]) for (const cv of arr) {
    if (role === 'priest') mark(cv, x => { x.fillStyle = '#e8c25a'; x.fillRect(3, 6, 2, 1); x.fillRect(3, 5, 1, 3); });
    if (role === 'watchman') mark(cv, x => { x.fillStyle = '#1a1c22'; x.fillRect(0, 1, 8, 1); x.fillRect(2, 0, 4, 1); });
    if (role === 'miller') mark(cv, x => { x.fillStyle = '#f4f0e6'; x.fillRect(2, 0, 4, 1); });
    if (role === 'herbwoman') mark(cv, x => { x.fillStyle = '#3a5e32'; x.fillRect(1, 2, 1, 3); x.fillRect(6, 2, 1, 3); });
  }
  return out;
}
const GHOST_ROWS = ['..kkkk..', '.kwwwwk.', 'kwwwwwwk', 'kwekkewk', 'kwwwwwwk', 'kwwwwwwk', 'kwwwwwwk', 'kwkwwkwk', '.k.kk.k.'];

// ---------- creatures ----------
const WISP_ROWS = [
  '....kkkk....', '...kmmmmk...', '..kmmmmmmk..', '..kmemmemk..', '..kmmmmmmk..', '...kmnnmk...',
  '.kkmmmmmmkk.', 'kmmmmmmmmmmk', 'kmkmmmmmmkmk', 'kmkmmmmmmkmk', 'kk.kmmmmk.kk', 'c..kmmmmk..c',
  '...kmmmmmk..', '..kmmmmmmk..', '..kmkmmkmk..', '.km.km.km...', '.k..k..k....'];
const WITCH_ROWS = [
  '......kk....', '.....kpk....', '....kppk....', '...kpppk....', '..kpppppk...', 'kkkkkkkkkkk.',
  '.kwgggggwk..', '.kwgegegwk..', '.kwgggnggwk.', '..kwgggwk...', '.kppppppk...', 'kpppppppppk.',
  'kgkpppppkgk.', '..kppqpppk..', '.kpppqppppk.', 'kppppqpppppk', 'kkkkkkkkkkkk'];
const WOLF_ROWS = [
  '..k......k....', '.kgk....kgk...', '.kggkkkkggk...', 'kgggggggggk...', 'kgegggggegk...', 'kggggnngggk...',
  '.kgggwwgggk...', '..kgggggk.....', '.kggggggggk...', 'kggkggggkggk..', 'kgk.kggggk.kgk.', 'kck.kggggk.kck',
  '....kggggk....', '...kgk..kgk...', '...kgk..kgk...', '..kkk....kkk..'];
const CREATURE_PAL = {
  wisp: { k: '#050608', m: '#22242e', e: '#140608', n: '#3a3c4a', c: '#a0a0aa' },
  witch: { k: '#08060a', p: '#3e2a4e', g: '#7a8a6a', w: '#9a9a9a', e: '#140608', n: '#5a6a4a', q: '#2a1a36' },
  wolf: { k: '#060506', g: '#3a3434', e: '#140608', n: '#1a1414', w: '#d8d0c0', c: '#b0a8a0' },
};
const CREATURE_ROWS = { wisp: WISP_ROWS, witch: WITCH_ROWS, wolf: WOLF_ROWS };

// ---------- items ----------
const ITEM_ROWS = {
  can: ['..kkk..', '.kyyyk.', 'kyyyyyk', 'kyrrryk', 'kyyyyyk', 'kyyyyyk', '.kkkkk.'],
  holy: ['..kk...', '..kbk..', '.kbbbk.', 'kbwbbbk', 'kbbbbbk', '.kbbbk.', '..kkk..'],
  salt: ['.k...k.', 'kwkkkwk', 'kwwwwwk', 'kwwwwwk', 'kwwwwwk', '.kwwwk.', '..kkk..'],
  dagger: ['......k', '.....kw', '....kwk', '...kwk.', 'kykwk..', '.kyk...', 'k.k....'],
  incense: ['..p.p..', '...p...', '..kkk..', '.kvvvk.', 'kvvvvvk', '.kvvvk.', '..kkk..'],
  bread: ['.......', '.kkkkk.', 'kbbybbk', 'kbybybk', 'kbbbbbk', '.kkkkk.', '.......'],
};
const ITEM_PAL = { k: '#16100e', y: '#d4a040', r: '#8a3a2a', b: '#6aa0e0', w: '#eaeaf0', v: '#7a5a9a', p: '#c0b0d0', g: '#8a8a8a' };
const BREAD_PAL = Object.assign({}, ITEM_PAL, { b: '#b07a3a', y: '#e0b060' });

function buildArt() {
  ART.v = {}; for (const r of ROLES) ART.v[r] = villagerFrames(r);
  ART.ghost = spriteFrom(GHOST_ROWS, { k: '#8aa0b8', w: '#d0e0f0', e: '#2a3a50' });
  ART.ghostF = ART.ghost;
  ART.c = {}; ART.eyes = {};
  for (const c of CREATURES) {
    const rows = CREATURE_ROWS[c];
    ART.c[c] = [spriteFrom(rows, CREATURE_PAL[c]), spriteFrom(rows, CREATURE_PAL[c], true)];
    // second frame: shifted bottom for float / stride
    const alt = rows.slice(0, -2).concat(rows.slice(-1), ['']);
    ART.c[c].push(spriteFrom(alt, CREATURE_PAL[c]), spriteFrom(alt, CREATURE_PAL[c], true));
    ART.eyes[c] = { pos: findChars(rows, 'e'), w: Math.max(...rows.map(r => r.length)), h: rows.length };
  }
  ART.item = {};
  for (const k in ITEM_ROWS) ART.item[k] = spriteFrom(ITEM_ROWS[k], k === 'bread' ? BREAD_PAL : ITEM_PAL);
  // altar
  ART.altar = spriteFrom([
    '...kkkkkkkkkk...', '..kjjjjjjjjjjk..', '..kjzzzzzzzzjk..', '.kkkkkkkkkkkkkk.', '.kssssssssssssx.', '.ksrsssrsssrssx.',
    '.kssssssssssssx.', '.kssrsssssrsssx.', '.kssssssssssssx.', 'kkkkkkkkkkkkkkkk', 'kddddddddddddddk', '.kkkkkkkkkkkkkk.'],
    { k: '#141216', j: '#4a4650', z: '#1e1a18', s: '#6e6a74', r: '#8a3a2a', x: '#4a4650', d: '#3a3640' });
  ART.cage = spriteFrom([
    'kkkkkkkkkkkkkkkkkk', 'kiiiiiiiiiiiiiiiik', 'ki.i..i..i..i..i.k', 'ki.i..i..i..i..i.k', 'ki.i..i..i..i..i.k',
    'ki.i..i..i..i..i.k', 'ki.i..i..i..i..i.k', 'ki.i..i..i..i..i.k', 'ki.i..i..i..i..i.k', 'kiiiiiiiiiiiiiiiik', 'kkkkkkkkkkkkkkkkkk'],
    { k: '#141418', i: '#6a6a74' });
  ART.trap = spriteFrom(['k.k.k.k', 'kikikik', 'kiiiiik', 'kikikik', 'k.k.k.k'], { k: '#141418', i: '#8a8a94' });
  // HUD icons (data urls) for HTML
  ART.icon = {};
  const up = (cv, s) => { const c = mkCanvas(cv.width * s, cv.height * s), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(cv, 0, 0, c.width, c.height); return c.toDataURL(); };
  for (const k in ART.item) ART.icon[k] = up(ART.item[k], 4);
  for (const r of ROLES) ART.icon['role_' + r] = up(ART.v[r].front[0], 4);
  for (const c of CREATURES) ART.icon['cr_' + c] = up(ART.c[c][0], 3);
  ART.icon.ghost = up(ART.ghost, 4);
  ART.lightCache = new Map();
}

// ---------- light sprites (dithered radial) ----------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function lightSprite(r, col, strength) {
  r = Math.max(4, Math.round(r / 2) * 2);
  const key = r + '|' + col.join(',') + '|' + strength;
  let c = ART.lightCache.get(key);
  if (c) return c;
  const s = r * 2; c = mkCanvas(s, s);
  const x = c.getContext('2d'), img = x.createImageData(s, s), d = img.data;
  const steps = 7;
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const dd = Math.hypot(i - r + 0.5, j - r + 0.5) / r;
    if (dd >= 1) continue;
    let f = Math.pow(1 - dd, 1.35) * strength;
    const th = (BAYER[(j & 3) * 4 + (i & 3)] / 16 - 0.5) / steps;
    f = Math.max(0, Math.round((f + th) * steps) / steps);
    const o = (j * s + i) * 4;
    d[o] = col[0] * f; d[o + 1] = col[1] * f; d[o + 2] = col[2] * f; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  if (ART.lightCache.size > 400) ART.lightCache.clear();
  ART.lightCache.set(key, c);
  return c;
}

// ---------- static world layers ----------
function buildWorldLayers(map) {
  const W = map.w * TILE, H = map.h * TILE;
  const ground = mkCanvas(W, H), canopy = mkCanvas(W, H);
  const g = ground.getContext('2d'), cp = canopy.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const px = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; };
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h) ? T.FOREST : map.tiles[y * map.w + x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = x >> 3, ty = y >> 3, t = tileAt(tx, ty), n = hash2(x, y), n2 = hash2(x >> 2, y >> 2);
    let c;
    if (t === T.ROAD || t === T.WELL) {
      const row = Math.floor(y / 5), off = (row % 2) * 3, col = Math.floor((x + off) / 6), lx = (x + off) % 6, ly = y % 5, v = hash2(col, row + 999);
      c = [92 + v * 26, 86 + v * 22, 78 + v * 20];
      if (lx === 0 || ly === 0) c = [44, 40, 36]; else if (lx === 1 || ly === 1) c = shade(c, 1.12); else if (lx === 5 || ly === 4) c = shade(c, 0.8);
    } else if (t === T.PATH) {
      c = [96 + n * 18, 76 + n * 14, 52 + n * 10];
      if (n > 0.93) c = [70, 58, 44]; if (n2 > 0.85) c = shade(c, 0.9);
    } else if (t === T.CEM || t === T.GRAVE || t === T.FENCE) {
      c = [42 + n * 10, 50 + n * 10, 40 + n * 8]; if (n > 0.95) c = [64, 72, 54];
    } else if (t === T.WATER) {
      c = [26, 44, 62]; if ((y + Math.floor(x / 5)) % 5 === 0 && n > 0.4) c = [48, 74, 98];
      // shore
      if (tileAt(tx, ty - 1) !== T.WATER && (y & 7) < 2) c = [62, 70, 52];
    } else {
      c = [44 + n * 12, 70 + n * 14, 44 + n * 10];
      if (n2 > 0.8) c = shade(c, 1.07); if (n2 < 0.15) c = shade(c, 0.9);
      if (n > 0.975) c = [80, 112, 66]; if (n < 0.02) c = [30, 48, 32];
      if (n > 0.996) c = [190, 180, 120]; // tiny flowers
    }
    px(x, y, c);
  }
  // road edges
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    const t = tileAt(tx, ty); if (t !== T.ROAD) continue;
    if (tileAt(tx, ty - 1) === T.GRASS) for (let i = 0; i < 8; i++) px(tx * 8 + i, ty * 8, [32, 48, 34]);
    if (tileAt(tx, ty + 1) === T.GRASS) for (let i = 0; i < 8; i++) px(tx * 8 + i, ty * 8 + 7, [28, 40, 30]);
  }
  g.putImageData(img, 0, 0);

  // fences, graves, well
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    const t = tileAt(tx, ty), x0 = tx * 8, y0 = ty * 8;
    if (t === T.FENCE) {
      g.fillStyle = '#3a2a1c'; g.fillRect(x0, y0 + 3, 8, 2);
      g.fillStyle = '#5a422a'; g.fillRect(x0, y0 + 3, 8, 1);
      g.fillStyle = '#2a1e14'; g.fillRect(x0 + 3, y0 + 1, 2, 6);
      g.fillStyle = '#6a5034'; g.fillRect(x0 + 3, y0 + 1, 1, 5);
    } else if (t === T.GRAVE) {
      g.fillStyle = '#1c2a20'; g.fillRect(x0 + 1, y0 + 7, 7, 1);
      g.fillStyle = '#6e6e78'; g.fillRect(x0 + 2, y0 + 1, 5, 6); g.fillRect(x0 + 3, y0, 3, 1);
      g.fillStyle = '#9a9aa6'; g.fillRect(x0 + 3, y0 + 1, 3, 1); g.fillRect(x0 + 2, y0 + 2, 1, 4);
      g.fillStyle = '#44444c'; g.fillRect(x0 + 4, y0 + 2, 1, 4); g.fillRect(x0 + 3, y0 + 3, 3, 1);
    }
  }
  // well
  {
    const x0 = map.well.x - 8, y0 = map.well.y - 8;
    g.fillStyle = '#1a1816'; g.fillRect(x0 + 1, y0 + 14, 15, 3);
    g.fillStyle = '#5e5a62'; g.fillRect(x0, y0 + 2, 16, 13);
    g.fillStyle = '#8a8690'; g.fillRect(x0, y0 + 2, 16, 2);
    g.fillStyle = '#10141c'; g.fillRect(x0 + 3, y0 + 4, 10, 7);
    g.fillStyle = '#1e2a3a'; g.fillRect(x0 + 4, y0 + 7, 8, 3);
    g.fillStyle = '#4a3220'; g.fillRect(x0 + 1, y0 - 6, 2, 9); g.fillRect(x0 + 13, y0 - 6, 2, 9); g.fillRect(x0, y0 - 7, 16, 2);
    g.fillStyle = '#8a8a8a'; g.fillRect(x0 + 7, y0 - 5, 1, 7);
  }
  // altars (stone body; flame drawn live)
  for (const a of map.altars) g.drawImage(ART.altar, Math.round(a.x - 8), Math.round(a.y - 7));

  // buildings
  const windows = [];
  const roofs = [[122, 62, 54], [78, 78, 102], [104, 82, 50], [62, 90, 74]];
  for (const b of map.buildings) {
    const x0 = b.tx * 8, y0 = b.ty * 8, w = b.tw * 8, h = b.th * 8;
    // shadow
    g.fillStyle = 'rgba(8,14,10,0.55)'; g.fillRect(x0 + 4, y0 + h, w, 4);
    if (b.kind === 'house' || b.kind === 'mill') {
      const wallH = 9, roofH = h - wallH, R = roofs[b.roof];
      for (let j = 0; j < roofH; j++) for (let i = 0; i < w; i++) {
        let c = shade(R, j < roofH / 2 ? 1.12 : 0.8);
        if (j % 3 === 0) c = shade(c, 0.72); else if (((i + (Math.floor(j / 3) % 2) * 2) % 4) === 0) c = shade(c, 0.86);
        c = shade(c, 0.92 + hash2(x0 + i, y0 + j) * 0.16);
        if (j === Math.floor(roofH / 2)) c = shade(R, 1.3);
        if (i === 0) c = shade(c, 1.1); if (i === w - 1) c = shade(c, 0.72);
        g.fillStyle = rgbStr(c); g.fillRect(x0 + i, y0 + j, 1, 1);
      }
      for (let j = 0; j < wallH; j++) for (let i = 0; i < w; i++) {
        let c = b.kind === 'mill' ? [110, 104, 96] : [100, 74, 48];
        if (b.kind !== 'mill' && i % 5 === 0) c = [72, 52, 34];
        if (j === 0) c = [44, 30, 20];
        c = shade(c, 0.9 + hash2(i + x0, j + y0) * 0.16);
        g.fillStyle = rgbStr(c); g.fillRect(x0 + i, y0 + roofH + j, 1, 1);
      }
      g.fillStyle = '#100c0a'; g.strokeStyle = '#100c0a';
      g.fillRect(x0 - 1, y0 - 1, w + 2, 1); g.fillRect(x0 - 1, y0 + h, w + 2, 1); g.fillRect(x0 - 1, y0, 1, h); g.fillRect(x0 + w, y0, 1, h);
      // door
      const dx = Math.round(b.door.x) - 3;
      g.fillStyle = '#3a2414'; g.fillRect(dx, y0 + h - 8, 6, 8);
      g.fillStyle = '#24160c'; g.fillRect(dx, y0 + h - 8, 6, 1); g.fillRect(dx + 3, y0 + h - 7, 1, 7);
      g.fillStyle = '#c0a050'; g.fillRect(dx + 4, y0 + h - 4, 1, 1);
      // windows
      const wx = x0 + 5, wy = y0 + h - 7;
      g.fillStyle = '#12161e'; g.fillRect(wx, wy, 6, 5);
      g.fillStyle = '#4a3220'; g.fillRect(wx + 2, wy, 1, 5); g.fillRect(wx, wy + 2, 6, 1);
      if (b.lit) windows.push({ x: wx, y: wy, w: 6, h: 5, b: b.id });
      if (w > 56) { const wx2 = x0 + w - 11; g.fillStyle = '#12161e'; g.fillRect(wx2, wy, 6, 5); g.fillStyle = '#4a3220'; g.fillRect(wx2 + 2, wy, 1, 5); g.fillRect(wx2, wy + 2, 6, 1); if (b.lit) windows.push({ x: wx2, y: wy, w: 6, h: 5, b: b.id }); }
      // chimney
      if (b.kind === 'house') {
        const cx = x0 + w - 12; g.fillStyle = '#5c5652'; g.fillRect(cx, y0 + 2, 6, 7); g.fillStyle = '#88807a'; g.fillRect(cx, y0 + 2, 6, 1); g.fillStyle = '#141010'; g.fillRect(cx + 1, y0 + 3, 4, 2);
      }
    } else if (b.kind === 'church') {
      const wallH = 12, roofH = h - wallH;
      for (let j = 0; j < roofH; j++) for (let i = 0; i < w; i++) {
        let c = shade([70, 74, 92], j < roofH / 2 ? 1.1 : 0.78);
        if (j % 3 === 0) c = shade(c, 0.75); c = shade(c, 0.92 + hash2(x0 + i, y0 + j) * 0.14);
        if (j === Math.floor(roofH / 2)) c = [120, 124, 140];
        g.fillStyle = rgbStr(c); g.fillRect(x0 + i, y0 + j, 1, 1);
      }
      for (let j = 0; j < wallH; j++) for (let i = 0; i < w; i++) {
        const row = Math.floor(j / 3), off = (row % 2) * 3; let c = [118, 114, 120];
        if ((i + off) % 6 === 0 || j % 3 === 0) c = [78, 74, 82]; c = shade(c, 0.9 + hash2(i + x0, j) * 0.15);
        g.fillStyle = rgbStr(c); g.fillRect(x0 + i, y0 + roofH + j, 1, 1);
      }
      // steeple
      const sx = x0 + w / 2 - 8, sy = y0 - 10;
      g.fillStyle = '#0e0c10'; g.fillRect(sx - 1, sy - 1, 18, 30);
      g.fillStyle = '#7c7884'; g.fillRect(sx, sy, 16, 28);
      g.fillStyle = '#5a5662'; g.fillRect(sx + 12, sy, 4, 28);
      g.fillStyle = '#1a1620'; g.fillRect(sx + 5, sy + 6, 6, 8);
      g.fillStyle = '#c9a24a'; g.fillRect(sx + 6, sy + 9, 4, 4); g.fillRect(sx + 7, sy + 8, 2, 1);
      g.fillStyle = '#d8c070'; g.fillRect(sx + 7, sy - 8, 2, 8); g.fillRect(sx + 5, sy - 6, 6, 2);
      g.fillStyle = '#0e0c10'; g.fillRect(x0 - 1, y0 - 1, w + 2, 1); g.fillRect(x0 - 1, y0 + h, w + 2, 1); g.fillRect(x0 - 1, y0, 1, h); g.fillRect(x0 + w, y0, 1, h);
      // double door
      const dx = Math.round(b.door.x) - 5;
      g.fillStyle = '#3a2414'; g.fillRect(dx, y0 + h - 11, 10, 11); g.fillRect(dx + 1, y0 + h - 12, 8, 1);
      g.fillStyle = '#24160c'; g.fillRect(dx + 5, y0 + h - 11, 1, 11);
      // stained windows
      for (const wx of [x0 + 8, x0 + w - 14]) { windows.push({ x: wx, y: y0 + h - 10, w: 5, h: 7, b: b.id, stained: true }); }
    } else if (b.kind === 'crypt') {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const row = Math.floor(j / 4), off = (row % 2) * 4; let c = [86, 84, 92];
        if ((i + off) % 8 === 0 || j % 4 === 0) c = [52, 50, 58]; c = shade(c, 0.88 + hash2(i + x0, j + y0) * 0.18);
        if (j < 4) c = shade(c, 1.2);
        g.fillStyle = rgbStr(c); g.fillRect(x0 + i, y0 + j, 1, 1);
      }
      g.fillStyle = '#0a080c'; g.fillRect(x0 - 1, y0 - 1, w + 2, 1); g.fillRect(x0 - 1, y0 + h, w + 2, 1); g.fillRect(x0 - 1, y0, 1, h); g.fillRect(x0 + w, y0, 1, h);
      const dx = Math.round(b.door.x) - 6;
      g.fillStyle = '#050406'; g.fillRect(dx, y0 + h - 14, 12, 14); g.fillRect(dx + 2, y0 + h - 16, 8, 2);
      // skull
      g.fillStyle = '#c8c0b0'; g.fillRect(dx + 4, y0 + 3, 4, 3); g.fillRect(dx + 5, y0 + 6, 2, 1);
      g.fillStyle = '#0a080c'; g.fillRect(dx + 4, y0 + 4, 1, 1); g.fillRect(dx + 7, y0 + 4, 1, 1);
    }
  }
  // trees canopy (+ trunk & shadow on ground)
  const drawCanopy = (ctx, cx, cy, r, dark) => {
    const bl = [[0, 0, r], [-r * 0.55, r * 0.3, r * 0.7], [r * 0.55, r * 0.25, r * 0.7], [0, -r * 0.45, r * 0.72]];
    for (let y = Math.floor(-r * 1.5); y <= r * 1.2; y++) for (let x = Math.floor(-r * 1.4); x <= r * 1.4; x++) {
      let inn = false, on = false;
      for (const b of bl) { const dd = Math.hypot(x - b[0], y - b[1]); if (dd < b[2]) inn = true; if (dd < b[2] - 1.2) on = true; }
      if (!inn) continue;
      const hl = Math.hypot(x + r * 0.35, y + r * 0.45) / r;
      let c = hl < 0.45 ? [70, 110, 60] : hl < 0.9 ? [44, 80, 48] : [26, 52, 34];
      if (dark) c = shade(c, 0.78);
      const n = hash2(cx + x, cy + y); if (n > 0.8) c = shade(c, 1.18); if (n < 0.15) c = shade(c, 0.78);
      if (!on) c = [10, 20, 14];
      ctx.fillStyle = rgbStr(c); ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    }
  };
  for (const t of map.trees) {
    const cx = t.tx * 8 + 4, cy = t.ty * 8 + 4;
    g.fillStyle = 'rgba(8,16,10,0.6)'; g.beginPath(); g.ellipse(cx + 3, cy + 3, t.r + 1, 4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2618'; g.fillRect(cx - 1, cy - 2, 3, 6); g.fillStyle = '#5a3c24'; g.fillRect(cx - 1, cy - 2, 1, 6);
    drawCanopy(cp, cx, cy - 7, t.r, false);
  }
  for (const f of map.forest) drawCanopy(cp, f.x, f.y, f.r, true);
  // mill blades (on canopy so they overlap)
  for (const b of map.buildings) if (b.kind === 'mill') {
    const cx = b.tx * 8 + b.tw * 4, cy = b.ty * 8 + 12;
    cp.strokeStyle = '#4a3420'; cp.lineWidth = 2;
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; cp.beginPath(); cp.moveTo(cx, cy); cp.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); cp.stroke(); }
    cp.fillStyle = '#7a6a50';
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; for (let s = 6; s < 20; s += 2) cp.fillRect(Math.round(cx + Math.cos(a) * s + Math.cos(a + 1.57) * 2), Math.round(cy + Math.sin(a) * s + Math.sin(a + 1.57) * 2), 2, 2); }
    cp.fillStyle = '#2a2018'; cp.fillRect(cx - 2, cy - 2, 4, 4);
  }
  return { ground, canopy, windows };
}
