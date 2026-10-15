'use strict';
// ===== Village generator, collision and pathfinding =====
const TILE = 8, MAP_W = 100, MAP_H = 70;
const T = { GRASS: 0, ROAD: 1, PATH: 2, TREE: 3, BUILD: 4, WATER: 5, FENCE: 6, GRAVE: 7, CEM: 8, FOREST: 9, ALTAR: 10, WELL: 11 };
const SOLID = new Set([T.TREE, T.BUILD, T.WATER, T.FENCE, T.GRAVE, T.FOREST, T.ALTAR, T.WELL]);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function generateMap(seed, altarCount) {
  const rnd = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const W = MAP_W, H = MAP_H;
  const tiles = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.FOREST : tiles[idx(x, y)];
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[idx(x, y)] = v; };
  const fill = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, v); };
  const area = (x, y, w, h, ok) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!ok(get(x + i, y + j))) return false; return true; };

  // forest border
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d < 3 || (d === 3 && rnd() < 0.45)) set(x, y, T.FOREST);
  }
  // roads
  const rows = [13 + ri(-1, 1), 34 + ri(-2, 2), 55 + ri(-1, 1)];
  const cols = [18 + ri(-2, 2), 50 + ri(-3, 3), 82 + ri(-2, 2)];
  for (const r of rows) fill(cols[0], r, cols[2] - cols[0] + 2, 2, T.ROAD);
  for (const c of cols) fill(c, rows[0], 2, rows[2] - rows[0] + 2, T.ROAD);
  // dirt paths out to the forest edge
  fill(4, rows[1], cols[0] - 4, 2, T.PATH);
  fill(cols[2] + 2, rows[1], W - 6 - cols[2], 2, T.PATH);
  fill(cols[1], 4, 2, rows[0] - 4, T.PATH);
  fill(cols[1], rows[2] + 2, 2, H - 6 - rows[2], T.PATH);
  // central plaza with well
  const px = cols[1] - 4, py = rows[1] - 4;
  fill(px, py, 10, 10, T.ROAD);
  const well = { x: (cols[1] + 1) * TILE, y: (rows[1] + 1) * TILE };
  fill(cols[1], rows[1], 2, 2, T.WELL);

  const buildings = [];
  const canPlace = (x, y, w, h) => area(x - 1, y - 1, w + 2, h + 2, t => t === T.GRASS);
  function addBuilding(kind, x, y, w, h) {
    fill(x, y, w, h, T.BUILD);
    const b = { id: buildings.length, kind, tx: x, ty: y, tw: w, th: h, door: { x: (x + w / 2) * TILE, y: (y + h) * TILE + 5 }, roof: Math.floor(rnd() * 4), lit: rnd() < 0.45, looted: false, hider: -1 };
    buildings.push(b);
    return b;
  }
  // blocks between roads
  const blocks = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    blocks.push({ x: cols[i] + 2, y: rows[j] + 2, x2: cols[i + 1] - 1, y2: rows[j + 1] - 1 });
  }
  // shuffle roles of blocks
  const order = [0, 1, 2, 3].sort(() => rnd() - 0.5);
  const churchBlock = blocks[order[0]], cemBlock = blocks[order[1]];

  // church
  {
    const b = churchBlock, w = 12, h = 9;
    const cx = Math.floor((b.x + b.x2) / 2 - w / 2), cy = Math.floor((b.y + b.y2) / 2 - h / 2);
    const ch = addBuilding('church', cx, cy, w, h);
    ch.lit = true;
    fill(cx + w / 2 - 1, cy + h, 2, b.y2 - (cy + h) + 1, T.PATH);
  }
  // cemetery + crypt
  let crypt;
  {
    const b = cemBlock;
    const fx = b.x + 2, fy = b.y + 2, fw = b.x2 - b.x - 3, fh = b.y2 - b.y - 3;
    fill(fx, fy, fw, fh, T.CEM);
    for (let i = 0; i < fw; i++) { set(fx + i, fy, T.FENCE); set(fx + i, fy + fh - 1, T.FENCE); }
    for (let j = 0; j < fh; j++) { set(fx, fy + j, T.FENCE); set(fx + fw - 1, fy + j, T.FENCE); }
    // gates
    const gx = fx + Math.floor(fw / 2);
    fill(gx - 1, fy + fh - 1, 3, 1, T.PATH);
    fill(fx, fy + Math.floor(fh / 2), 1, 2, T.PATH);
    fill(fx + fw - 1, fy + Math.floor(fh / 2), 1, 2, T.PATH);
    const cw = 8, chh = 5;
    const cxx = gx - cw / 2, cyy = fy + 2;
    crypt = addBuilding('crypt', cxx, cyy, cw, chh);
    crypt.lit = false;
    fill(gx - 1, cyy + chh, 3, fh - chh - 3, T.PATH);
    // graves
    for (let y = fy + 2; y < fy + fh - 2; y += 3) for (let x = fx + 2; x < fx + fw - 2; x += 3) {
      if (get(x, y) === T.CEM && Math.abs(x - gx) > 2 && rnd() < 0.75 && !(x >= cxx - 1 && x <= cxx + cw && y <= cyy + chh)) set(x, y, T.GRAVE);
    }
  }
  // houses in remaining blocks + edges of church block
  function houseRow(b, top) {
    let x = b.x + ri(0, 2);
    while (x < b.x2 - 6) {
      const w = ri(7, 9), h = ri(5, 6);
      const y = top ? b.y + 1 : b.y2 - h;
      if (x + w <= b.x2 && canPlace(x, y, w, h)) { addBuilding('house', x, y, w, h); x += w + ri(3, 6); }
      else x += 2;
    }
  }
  for (const k of [2, 3]) { const b = blocks[order[k]]; houseRow(b, true); houseRow(b, false); }
  // outer strips: a few houses + mill + pond
  const strips = [
    { x: cols[0] + 2, y: 4, x2: cols[2] - 1, y2: rows[0] - 1 },
    { x: cols[0] + 2, y: rows[2] + 2, x2: cols[2] - 1, y2: H - 5 },
  ];
  const millStrip = strips[Math.floor(rnd() * 2)];
  {
    const b = millStrip, w = 6, h = 6;
    const mx = rnd() < 0.5 ? b.x + 3 : b.x2 - 10;
    const my = Math.floor((b.y + b.y2) / 2 - h / 2);
    if (canPlace(mx, my, w, h)) addBuilding('mill', mx, my, w, h).lit = false;
  }
  for (const b of strips) {
    let x = b.x + ri(4, 10);
    while (x < b.x2 - 8) {
      const w = ri(7, 8), h = 5;
      const y = b === strips[0] ? b.y2 - h : b.y + 1;
      if (canPlace(x, y, w, h)) { addBuilding('house', x, y, w, h); x += w + ri(5, 9); } else x += 3;
    }
  }
  // pond west or east side
  {
    const west = rnd() < 0.5;
    const cx = west ? ri(7, cols[0] - 5) : ri(cols[2] + 6, W - 8);
    const cy = rnd() < 0.5 ? ri(18, rows[1] - 5) : ri(rows[1] + 6, 50);
    const rx = ri(3, 5), ry = ri(2, 3);
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1 && get(cx + x, cy + y) === T.GRASS) set(cx + x, cy + y, T.WATER);
  }
  // side houses west/east strips
  for (const side of [0, 1]) {
    const x0 = side ? cols[2] + 3 : 5, x1 = side ? W - 5 : cols[0] - 1;
    let y = 6 + ri(0, 4);
    while (y < H - 12) {
      const w = ri(6, 7), h = 5;
      const x = side ? x0 + ri(0, Math.max(0, x1 - x0 - w)) : x0 + ri(0, Math.max(0, x1 - x0 - w));
      if (x + w < x1 + 1 && canPlace(x, y, w, h)) { addBuilding('house', x, y, w, h); y += h + ri(6, 10); } else y += 3;
    }
  }
  // doors must open onto walkable ground
  for (const b of buildings) {
    const dx = Math.floor(b.door.x / TILE), dy = b.ty + b.th;
    for (const ddx of [-1, 0]) { const t = get(dx + ddx, dy); if (t === T.FENCE || t === T.GRAVE || t === T.TREE) set(dx + ddx, dy, T.PATH); }
  }
  // altars: farthest point sampling across open ground
  const cand = [];
  for (let y = 8; y < H - 8; y += 2) for (let x = 8; x < W - 8; x += 2) {
    if (area(x - 2, y - 2, 6, 5, t => t === T.GRASS || t === T.PATH)) cand.push([x, y]);
  }
  const cryptC = [crypt.tx + crypt.tw / 2, crypt.ty + crypt.th];
  const plaza = [cols[1] + 1, rows[1] + 1];
  const altarTiles = [];
  for (let k = 0; k < altarCount; k++) {
    let best = null, bd = -1;
    for (const c of cand) {
      let d = Math.min(Math.hypot(c[0] - cryptC[0], c[1] - cryptC[1]) * 0.8, Math.hypot(c[0] - plaza[0], c[1] - plaza[1]) * 1.6 + 8);
      for (const a of altarTiles) d = Math.min(d, Math.hypot(c[0] - a[0], c[1] - a[1]));
      d += rnd() * 4;
      if (d > bd) { bd = d; best = c; }
    }
    if (best) { altarTiles.push(best); fill(best[0], best[1], 2, 1, T.ALTAR); }
  }
  const altars = altarTiles.map((a, i) => ({ id: i, x: (a[0] + 1) * TILE, y: (a[1] + 0.5) * TILE }));

  // trees: scattered in open grass, clear of roads, doors and altars
  const trees = [];
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    if (get(x, y) !== T.GRASS) continue;
    const near = area(x - 2, y - 2, 5, 5, t => t === T.GRASS || t === T.TREE || t === T.FOREST);
    if (!near) continue;
    let dens = 0.05 + 0.08 * (hash2(Math.floor(x / 9), Math.floor(y / 9)) > 0.6 ? 1 : 0);
    if (rnd() < dens) {
      let blocked = false;
      for (const t of trees) if (Math.abs(t.tx - x) < 3 && Math.abs(t.ty - y) < 3) { blocked = true; break; }
      if (!blocked) { set(x, y, T.TREE); trees.push({ tx: x, ty: y, r: 6 + Math.floor(rnd() * 5) }); }
    }
  }
  // forest canopy points
  const forest = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (get(x, y) === T.FOREST) forest.push({ x: x * TILE + 4 + (rnd() * 6 - 3), y: y * TILE + 4 + (rnd() * 6 - 3), r: 7 + Math.floor(rnd() * 6) });
  }

  // ensure connectivity from plaza; carve through trees/fences when needed
  const solidArr = new Uint8Array(W * H);
  const refreshSolid = () => { for (let i = 0; i < W * H; i++) solidArr[i] = SOLID.has(tiles[i]) ? 1 : 0; };
  refreshSolid();
  const startT = [cols[1] - 2, rows[1] - 2];
  function flood() {
    const seen = new Uint8Array(W * H), q = [idx(startT[0], startT[1])]; seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop(), cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = idx(nx, ny);
        if (!seen[n] && !solidArr[n]) { seen[n] = 1; q.push(n); }
      }
    }
    return seen;
  }
  const targets = buildings.map(b => [Math.floor(b.door.x / TILE), Math.floor(b.door.y / TILE)])
    .concat(altars.map(a => [Math.floor(a.x / TILE), Math.floor(a.y / TILE) + 1]));
  for (let pass = 0; pass < 6; pass++) {
    const seen = flood();
    let fixed = false;
    for (const [tx, ty] of targets) {
      if (seen[idx(tx, ty)]) continue;
      // walk toward plaza clearing trees / fences / graves
      let x = tx, y = ty;
      for (let s = 0; s < 200 && !seen[idx(x, y)]; s++) {
        if (Math.abs(x - startT[0]) > Math.abs(y - startT[1])) x += Math.sign(startT[0] - x); else y += Math.sign(startT[1] - y);
        const t = get(x, y);
        if (t === T.TREE || t === T.FENCE || t === T.GRAVE) { set(x, y, T.PATH); fixed = true; }
      }
    }
    refreshSolid();
    if (!fixed) break;
  }
  for (let i = trees.length - 1; i >= 0; i--) if (get(trees[i].tx, trees[i].ty) !== T.TREE) trees.splice(i, 1);

  // spots for oil cans and items lying around
  const seen = flood();
  const open = [];
  for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) {
    const t = get(x, y);
    if (seen[idx(x, y)] && (t === T.GRASS || t === T.PATH || t === T.ROAD || t === T.CEM) && area(x - 1, y - 1, 3, 3, q => !SOLID.has(q))) open.push([x, y]);
  }
  const looseSpots = [];
  for (let k = 0; k < 40 && open.length; k++) {
    const o = open[Math.floor(rnd() * open.length)];
    if (looseSpots.every(s => Math.hypot(s[0] - o[0], s[1] - o[1]) > 10)) looseSpots.push(o);
  }

  const cage = { x: crypt.door.x, y: crypt.door.y + 8 };
  const church = buildings.find(b => b.kind === 'church');
  return {
    seed, w: W, h: H, tiles, solid: solidArr, buildings, altars, trees, forest, well, crypt, cage, church,
    bell: { x: church.door.x, y: church.door.y },
    spawn: { x: (cols[1] - 2) * TILE, y: (rows[1] - 2) * TILE },
    monsterSpawn: { x: cage.x, y: cage.y + 6 },
    looseSpots: looseSpots.map(s => ({ x: s[0] * TILE + 4, y: s[1] * TILE + 4 })),
    open: open.map(s => ({ x: s[0] * TILE + 4, y: s[1] * TILE + 4 })),
    cols, rows,
  };
}

// ===== collision =====
function isSolidPx(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
  return map.solid[ty * map.w + tx] === 1;
}
function collides(map, x, y, r) {
  return isSolidPx(map, x - r, y - r) || isSolidPx(map, x + r, y - r) || isSolidPx(map, x - r, y + r) || isSolidPx(map, x + r, y + r);
}
function moveEntity(map, e, dx, dy, r) {
  if (!collides(map, e.x + dx, e.y, r)) e.x += dx;
  else if (dx !== 0) { // slide around corners
    if (!collides(map, e.x + dx, e.y - 2, r) && !collides(map, e.x, e.y - 2, r)) e.y -= Math.abs(dx) * 0.5;
    else if (!collides(map, e.x + dx, e.y + 2, r) && !collides(map, e.x, e.y + 2, r)) e.y += Math.abs(dx) * 0.5;
  }
  if (!collides(map, e.x, e.y + dy, r)) e.y += dy;
  else if (dy !== 0) {
    if (!collides(map, e.x - 2, e.y + dy, r) && !collides(map, e.x - 2, e.y, r)) e.x -= Math.abs(dy) * 0.5;
    else if (!collides(map, e.x + 2, e.y + dy, r) && !collides(map, e.x + 2, e.y, r)) e.x += Math.abs(dy) * 0.5;
  }
}
function lineClear(map, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(d / 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolidPx(map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

// ===== A* pathfinding on the tile grid =====
function findPath(map, sx, sy, gx, gy, maxNodes = 4000) {
  const W = map.w, H = map.h;
  let s = [Math.floor(sx / TILE), Math.floor(sy / TILE)];
  let g = [Math.floor(gx / TILE), Math.floor(gy / TILE)];
  const solid = (x, y) => x < 0 || y < 0 || x >= W || y >= H || map.solid[y * W + x];
  if (solid(g[0], g[1])) { // goal inside a solid: pick nearest open neighbour
    let best = null, bd = 1e9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!solid(g[0] + dx, g[1] + dy)) {
      const d = Math.abs(dx) + Math.abs(dy); if (d < bd) { bd = d; best = [g[0] + dx, g[1] + dy]; }
    }
    if (!best) return null; g = best;
  }
  if (solid(s[0], s[1])) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!solid(s[0] + dx, s[1] + dy)) { s = [s[0] + dx, s[1] + dy]; break; }
  }
  const N = W * H, start = s[1] * W + s[0], goal = g[1] * W + g[0];
  if (start === goal) return [{ x: gx, y: gy }];
  const gScore = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [];
  const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const hfn = n => { const x = n % W, y = (n / W) | 0; const dx = Math.abs(x - g[0]), dy = Math.abs(y - g[1]); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
  gScore[start] = 0; push(start, hfn(start));
  let count = 0, found = false;
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
  while (heap.length && count++ < maxNodes) {
    const [, c] = pop();
    if (c === goal) { found = true; break; }
    if (closed[c]) continue; closed[c] = 1;
    const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (solid(nx, ny)) continue;
      if (dx && dy && (solid(cx + dx, cy) || solid(cx, cy + dy))) continue;
      const n = ny * W + nx;
      const ng = gScore[c] + cost;
      if (ng < gScore[n]) { gScore[n] = ng; came[n] = c; push(n, ng + hfn(n)); }
    }
  }
  if (!found) return null;
  const path = [];
  for (let c = goal; c !== start && c !== -1; c = came[c]) path.push({ x: (c % W) * TILE + 4, y: ((c / W) | 0) * TILE + 4 });
  path.reverse();
  if (path.length) path[path.length - 1] = { x: gx, y: gy };
  return path;
}
