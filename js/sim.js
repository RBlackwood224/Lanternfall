'use strict';
// ===== Game rules / simulation (runs on the host or offline) =====
const ROLES = ['priest', 'smith', 'herbwoman', 'watchman', 'miller'];
const CREATURES = ['wisp', 'witch', 'wolf'];
const ROLE_COLOR = { priest: '#d8d2c2', smith: '#7a4e36', herbwoman: '#4e7e46', watchman: '#3e5e92', miller: '#c49438' };
const ROLE_CD = { priest: 45, smith: 35, herbwoman: 35, watchman: 45, miller: 30 };
const CREATURE_CD = { wisp: [16, 22, 26], witch: [18, 24, 20], wolf: [9, 28, 32] };
const AI_NAMES = ['Mira', 'Tobin', 'Ilka', 'Bram', 'Vera', 'Oskar', 'Lena', 'Pavel', 'Nora', 'Emil', 'Sári', 'Jules'];
const DUSK = 25;
const CAGE_TIME = 45;

function createGame(opts) {
  const vCount = opts.players.filter(p => p.side === 'v').length;
  const altarCount = Math.max(2, (opts.special === 'bloodmoon' ? 2 : 3) + (vCount >= 5 ? 1 : 0));
  const map = generateMap(opts.seed, altarCount);
  const rnd = mulberry32(opts.seed ^ 0x9e3779b9);
  const G = {
    map, rnd, seed: opts.seed, t: 0, nightLen: opts.nightLen || 360, special: opts.special || 'normal',
    difficulty: opts.difficulty || 'normal', phase: 'play', winner: null, endReason: null,
    altars: map.altars.map(a => ({ id: a.id, x: a.x, y: a.y, oil: 0, need: vCount >= 5 ? 4 : 3, lit: false })),
    items: [], ents: [], nextId: 1,
    fx: { salt: [], holy: [], iron: [], hex: [], fake: [], flare: [], proj: [], pings: [], noise: [] },
    bell: { uses: 3, cd: 0 }, revealT: 0, lightT: 0, nextLight: 10 + rnd() * 10,
    manifested: false, events: [], stats: { start: Date.now() },
  };
  // villagers spawn on the plaza, monster at the crypt
  let vi = 0;
  for (const p of opts.players) {
    if (p.side === 'm') {
      const m = { id: p.id, name: p.name, side: 'm', creature: p.creature || 'wisp', ai: !!p.ai, aiLevel: p.aiLevel || G.difficulty,
        x: map.monsterSpawn.x, y: map.monsterSpawn.y, fx: 1, fy: 0, hp: vCount >= 5 ? 5 : 4, maxHp: vCount >= 5 ? 5 : 4,
        carrying: -1, cd: [0, 0, 0], atkCd: 0, stunT: 0, rootT: 0, rageT: 0, dashT: 0, dvx: 0, dvy: 0,
        inLight: false, searchT: 0, searchDoor: -1, moving: false, walk: 0, inp: blankInput(), last: {} };
      G.ents.push(m);
    } else {
      const a = (vi++ / Math.max(1, vCount)) * Math.PI * 2;
      const v = { id: p.id, name: p.name, side: 'v', role: p.role || 'watchman', ai: !!p.ai, aiLevel: p.aiLevel || G.difficulty,
        x: map.spawn.x + Math.cos(a) * 10, y: map.spawn.y + Math.sin(a) * 10, fx: 0, fy: 1,
        state: 'ok', captures: 0, cageT: 0, oil: 100, lantern: 2, stamina: 100, cans: 0, item: null,
        abCd: 0, snuffT: 0, curseT: 0, slowT: 0, fearT: 0, markedT: 0, incenseT: 0, burstT: 0, healT: 0,
        struggle: 0, house: -1, act: null, actT: 0, noiseT: 0, moving: false, walk: 0,
        stats: { oil: 0, rescues: 0, heals: 0, stuns: 0 }, inp: blankInput(), last: {} };
      G.ents.push(v);
    }
    G.nextId = Math.max(G.nextId, p.id + 1);
  }
  // loose oil cans and items
  const spots = map.looseSpots.slice();
  const take = () => spots.length ? spots.splice(Math.floor(rnd() * spots.length), 1)[0] : map.open[Math.floor(rnd() * map.open.length)];
  addItem(G, 'can', map.well.x - 14, map.well.y + 4);
  for (let i = 0; i < 1 + Math.floor(vCount / 2); i++) { const s = take(); addItem(G, 'can', s.x, s.y); }
  for (const t of ['holy', 'salt', 'bread', 'incense', 'holy']) { const s = take(); addItem(G, t, s.x, s.y); }
  return G;
}
function blankInput() { return { mx: 0, my: 0, sprint: false, aHeld: false, a: 0, b: 0, c: 0, d: 0, ping: 0, pingN: 0 }; }
function addItem(G, type, x, y) { G.items.push({ id: G.nextId++, type, x, y }); }
function ev(G, k, p) { G.events.push(Object.assign({ k }, p || {})); }
function monster(G) { return G.ents.find(e => e.side === 'm'); }
function villagers(G) { return G.ents.filter(e => e.side === 'v'); }
function activeV(e) { return e.side === 'v' && (e.state === 'ok' || e.state === 'wounded'); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function pressed(e, key) { const v = e.inp[key] || 0, l = e.last[key] || 0; e.last[key] = v; return v !== l; }

function lanternRadius(G, v) {
  if (v.side !== 'v' || !activeV(v) || v.snuffT > 0 || v.oil <= 0 || v.lantern === 0) return 0;
  let r = v.lantern === 2 ? 54 : 30;
  if (v.role === 'watchman') r *= 1.2;
  if (v.curseT > 0) r *= 0.6;
  if (G.special === 'fog') r *= 0.82;
  return r;
}
// every real light in the world (fake wisp lights are listed separately)
function worldLights(G) {
  const L = [];
  for (const v of G.ents) { const r = lanternRadius(G, v); if (r > 0) L.push({ x: v.x + v.fx * 2, y: v.y - 2, r, kind: 'lantern', id: v.id }); }
  for (const a of G.altars) if (a.lit) L.push({ x: a.x, y: a.y, r: 62, kind: 'altar' });
  for (const b of G.map.buildings) if (b.lit) L.push({ x: b.door.x - (b.kind === 'church' ? 0 : 8), y: b.door.y + 2, r: b.kind === 'church' ? 30 : 20, kind: 'window' });
  for (const f of G.fx.flare) L.push({ x: f.x, y: f.y, r: 92, kind: 'flare' });
  for (const s of G.fx.holy) L.push({ x: s.x, y: s.y, r: 30, kind: 'holy' });
  return L;
}
function inAnyLight(G, x, y, lights) {
  for (const l of lights) { const r = l.kind === 'window' ? l.r * 0.8 : l.r * 0.85; if ((x - l.x) ** 2 + (y - l.y) ** 2 < r * r) return true; }
  return false;
}
// can the monster perceive this villager?
function monsterSees(G, m, v) {
  if (!activeV(v) && v.state !== 'carried') return false;
  if (v.state === 'carried') return true;
  if (G.lightT > 0) return true;
  if (v.markedT > 0) return true;
  const d = dist(m, v);
  if (v.incenseT > 0) return d < 22;
  if (lanternRadius(G, v) > 0) return true;
  if (G._lights && inAnyLight(G, v.x, v.y, G._lights)) return true;
  return d < (m.creature === 'wolf' ? 58 : 44);
}
function monsterVisibleToAll(G, m) {
  return G.manifested || G.revealT > 0 || G.lightT > 0 || m.inLight;
}

function monsterSpeed(G, m) {
  let s = { wisp: 64, witch: 60, wolf: 70 }[m.creature];
  if (G.manifested) s = m.creature === 'wolf' ? 52 : 48;
  else if (m.inStrong && m.rageT <= 0) s *= 0.6;
  else if (m.inLight && m.rageT <= 0) s *= 0.9;
  if (m.carrying >= 0) s *= 0.8;
  if (m.rageT > 0) s *= 1.4;
  if (G.t > G.nightLen - 90) s *= 1.12;
  if (G.special === 'bloodmoon') s *= 1.08;
  if (m.ai) s *= { easy: 0.84, normal: 0.95, hard: 1.04 }[m.aiLevel] || 1;
  return s;
}
function villagerSpeed(G, v) {
  let s = 44;
  if (v.sprinting) s = 70;
  if (v.burstT > 0) s *= 1.2;
  if (v.cans > 0) s *= 0.88;
  if (v.state === 'wounded') s *= 0.8;
  if (v.slowT > 0) s *= 0.5;
  if (v.fearT > 0) s *= 0.7;
  return s;
}

// ===== villager context action =====
function villagerContext(G, v) {
  const map = G.map;
  for (const c of G.ents) if (c.side === 'v' && c.state === 'caged' && dist(v, map.cage) < 18) return { k: 'rescue', hold: 2.5, target: c.id };
  for (const c of G.ents) if (c !== v && c.side === 'v' && c.state === 'wounded' && dist(v, c) < 13) return { k: 'heal', hold: 2.0, target: c.id };
  if (v.cans > 0) for (const a of G.altars) if (!a.lit && dist(v, a) < 17) return { k: 'pour', hold: 2.2, target: a.id };
  let bestItem = null, bd = 11;
  for (const it of G.items) { const d = dist(v, it); if (d < bd && (it.type !== 'can' || v.cans < (v.role === 'miller' ? 2 : 1))) { bd = d; bestItem = it; } }
  if (bestItem) return { k: 'pick', hold: 0, target: bestItem.id, type: bestItem.type };
  if (dist(v, map.bell) < 15 && G.bell.uses > 0) return { k: 'bell', hold: 0, ready: G.bell.cd <= 0 };
  for (const b of map.buildings) {
    if (b.kind === 'crypt') continue;
    if (dist(v, b.door) < 12) {
      if (!b.looted && b.kind !== 'church') return { k: 'search', hold: 2.2, target: b.id };
      if (b.hider < 0 && b.kind !== 'church') return { k: 'hide', hold: 0, target: b.id };
    }
  }
  if (v.cans > 0 && v.oil < 80) return { k: 'refill', hold: 1.4 };
  return null;
}

function rollLoot(G) {
  const r = G.rnd();
  if (r < 0.34) return 'can';
  if (r < 0.47) return 'holy';
  if (r < 0.58) return 'salt';
  if (r < 0.67) return 'incense';
  if (r < 0.80) return 'bread';
  return null;
}

function dropCans(G, v) {
  for (let i = 0; i < v.cans; i++) addItem(G, 'can', v.x + (i ? 6 : -4), v.y + 4);
  v.cans = 0;
}

function hitVillager(G, m, v) {
  if (v.state === 'ok') {
    v.state = 'wounded'; v.healT = 0;
    dropCans(G, v);
    const d = Math.max(1, dist(m, v));
    moveEntity(G.map, v, (v.x - m.x) / d * 10, (v.y - m.y) / d * 10, 3);
    ev(G, 'wounded', { id: v.id, x: v.x, y: v.y });
  } else if (v.state === 'wounded') {
    v.state = 'carried'; v.struggle = 0; v.act = null;
    dropCans(G, v);
    if (v.item) { addItem(G, v.item, v.x, v.y + 3); v.item = null; }
    m.carrying = v.id;
    ev(G, 'grabbed', { id: v.id, x: v.x, y: v.y });
  }
  m.atkCd = 1.1;
}
function stunMonster(G, m, t, src) {
  m.stunT = Math.max(m.stunT, t);
  if (m.carrying >= 0) {
    const v = G.ents.find(e => e.id === m.carrying);
    if (v) { v.state = 'wounded'; v.x = m.x + 6; v.y = m.y; if (collides(G.map, v.x, v.y, 3)) { v.x = m.x; v.y = m.y; } ev(G, 'freed', { id: v.id }); }
    m.carrying = -1;
  }
  m.dashT = 0;
  G.revealT = Math.max(G.revealT, Math.min(t, 2.5));
  ev(G, 'stunned', { x: m.x, y: m.y, src });
}
function damageMonster(G, m, src) {
  if (m.invT > 0) return;
  m.hp -= 1; m.invT = 2.5;
  stunMonster(G, m, 0.6, src);
  ev(G, 'mhit', { x: m.x, y: m.y, hp: m.hp });
  if (m.hp <= 0) endGame(G, 'v', 'banished');
}

function useItem(G, v) {
  const it = v.item; if (!it) return;
  const m = monster(G);
  if (it === 'holy') {
    G.fx.proj.push({ x: v.x, y: v.y - 2, vx: v.fx * 150, vy: v.fy * 150, t: 0.45, owner: v.id });
    ev(G, 'throw', { x: v.x, y: v.y });
  } else if (it === 'salt') {
    G.fx.salt.push({ x: v.x, y: v.y, r: 18, t: 12 });
    ev(G, 'salt', { x: v.x, y: v.y });
  } else if (it === 'incense') {
    v.incenseT = 15; ev(G, 'incense', { x: v.x, y: v.y });
  } else if (it === 'bread') {
    if (v.state === 'wounded') { v.state = 'ok'; ev(G, 'healed', { id: v.id }); }
    v.stamina = 100; ev(G, 'eat', { x: v.x, y: v.y });
  } else if (it === 'dagger') {
    if (v.atkCd > 0) return;
    v.atkCd = 0.9;
    ev(G, 'slash', { x: v.x + v.fx * 8, y: v.y + v.fy * 8 });
    if (m && dist(v, m) < 17 && !(m.invT > 0)) {
      if (G.manifested) { damageMonster(G, m, v.id); v.stats.stuns++; }
      else stunMonster(G, m, 0.6, v.id);
    }
    return; // dagger is kept
  }
  v.item = null;
}

function useRoleAbility(G, v) {
  if (v.abCd > 0) return;
  const r = v.role;
  if (r === 'priest') G.fx.holy.push({ x: v.x, y: v.y, r: 30, t: 7 });
  else if (r === 'smith') { if (G.fx.iron.length >= 3) G.fx.iron.shift(); G.fx.iron.push({ x: v.x, y: v.y + 2 }); }
  else if (r === 'herbwoman') G.revealT = Math.max(G.revealT, 3.5);
  else if (r === 'watchman') G.fx.flare.push({ x: v.x, y: v.y, t: 12 });
  else if (r === 'miller') v.burstT = 5;
  v.abCd = ROLE_CD[r];
  ev(G, 'ability', { id: v.id, role: r, x: v.x, y: v.y });
}

function useCreatureAbility(G, m, slot) {
  if (m.cd[slot] > 0 || m.stunT > 0) return;
  const c = m.creature, vs = villagers(G).filter(activeV);
  let ok = true;
  const nearest = (range, filt) => { let b = null, bd = range; for (const v of vs) { const d = dist(m, v); if (d < bd && (!filt || filt(v))) { bd = d; b = v; } } return b; };
  if (c === 'wisp') {
    if (slot === 0) { const t = nearest(84, v => lanternRadius(G, v) > 0); if (t) { t.snuffT = 7; ev(G, 'snuffed', { id: t.id, x: t.x, y: t.y }); } else ok = false; }
    if (slot === 1) {
      const names = vs.map(v => v.name); if (!names.length) ok = false;
      else { G.fx.pings.push({ x: m.x + m.fx * 30, y: m.y + m.fy * 30, kind: 1, name: names[Math.floor(G.rnd() * names.length)], t: 6, fake: true }); ev(G, 'mimic', { x: m.x, y: m.y }); }
    }
    if (slot === 2) { if (G.fx.fake.length >= 2) G.fx.fake.shift(); G.fx.fake.push({ x: m.x, y: m.y, t: 25 }); ev(G, 'wisplight', { x: m.x, y: m.y }); }
  } else if (c === 'witch') {
    if (slot === 0) { const t = nearest(92); if (t) { t.curseT = 12; ev(G, 'cursed', { id: t.id, x: t.x, y: t.y }); } else ok = false; }
    if (slot === 1) {
      let best = null, bd = 100;
      for (const it of G.items) if (it.type === 'can') { const d = dist(m, it); if (d < bd) { bd = d; best = it; } }
      if (best) { G.items.splice(G.items.indexOf(best), 1); ev(G, 'rats', { x: best.x, y: best.y }); }
      else {
        const a = G.altars.find(a => !a.lit && a.oil > 0 && dist(m, a) < 44);
        if (a) { a.oil--; ev(G, 'rats', { x: a.x, y: a.y, altar: a.id }); } else ok = false;
      }
    }
    if (slot === 2) { if (G.fx.hex.length >= 3) G.fx.hex.shift(); G.fx.hex.push({ x: m.x, y: m.y, t: 45 }); ev(G, 'hexset', { x: m.x, y: m.y }); }
  } else if (c === 'wolf') {
    if (slot === 0) { m.dashT = 0.28; const l = Math.hypot(m.fx, m.fy) || 1; m.dvx = m.fx / l * 250; m.dvy = m.fy / l * 250; ev(G, 'pounce', { x: m.x, y: m.y }); }
    if (slot === 1) { for (const v of vs) { v.markedT = 4.5; if (dist(m, v) < 130) v.fearT = 2.2; } ev(G, 'howl', { x: m.x, y: m.y }); }
    if (slot === 2) { m.rageT = 6; ev(G, 'rage', { x: m.x, y: m.y }); }
  }
  if (ok) m.cd[slot] = CREATURE_CD[c][slot] * (G.special === 'bloodmoon' ? 0.8 : 1);
}

function endGame(G, winner, reason) {
  if (G.phase === 'end') return;
  G.phase = 'end'; G.winner = winner; G.endReason = reason;
  ev(G, 'end', { winner, reason });
}

// ===== main tick =====
function stepGame(G, dt) {
  if (G.phase !== 'play') return;
  G.t += dt;
  const map = G.map, m = monster(G);
  const lights = worldLights(G);
  G._lights = lights;
  // timers
  G.revealT = Math.max(0, G.revealT - dt);
  G.bell.cd = Math.max(0, G.bell.cd - dt);
  if (G.special === 'storm') {
    G.lightT = Math.max(0, G.lightT - dt);
    G.nextLight -= dt;
    if (G.nextLight <= 0) { G.lightT = 0.35; G.nextLight = 13 + G.rnd() * 12; ev(G, 'thunder', {}); }
  }
  for (const k of ['salt', 'holy', 'hex', 'fake', 'flare', 'pings']) {
    const arr = G.fx[k];
    for (let i = arr.length - 1; i >= 0; i--) { arr[i].t -= dt; if (arr[i].t <= 0) arr.splice(i, 1); }
  }
  for (let i = G.fx.noise.length - 1; i >= 0; i--) { G.fx.noise[i].t -= dt; if (G.fx.noise[i].t <= 0) G.fx.noise.splice(i, 1); }
  if (G.t > G.nightLen - 90 && !G._predawn) { G._predawn = true; ev(G, 'predawn', {}); }
  if (G.t > DUSK && !G._night) { G._night = true; ev(G, 'nightfalls', {}); }

  // projectiles
  for (let i = G.fx.proj.length - 1; i >= 0; i--) {
    const p = G.fx.proj[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
    let hit = false;
    if (m && Math.hypot(p.x - m.x, p.y - (m.y - 4)) < 10) {
      stunMonster(G, m, 2.6, p.owner); hit = true;
      const o = G.ents.find(e => e.id === p.owner); if (o) o.stats.stuns++;
    }
    if (hit || p.t <= 0 || isSolidPx(map, p.x, p.y)) { G.fx.proj.splice(i, 1); ev(G, 'splash', { x: p.x, y: p.y }); }
  }

  for (const v of G.ents) if (v.side === 'v') stepVillager(G, v, dt, m);
  if (m) stepMonster(G, m, dt, lights);

  // altars complete?
  if (!G.manifested && G.altars.every(a => a.lit)) {
    G.manifested = true;
    for (const a of G.altars) addItem(G, 'dagger', a.x, a.y + 10);
    ev(G, 'manifest', {});
  }
  // win checks
  const vs = villagers(G);
  if (!vs.some(v => v.state === 'ok' || v.state === 'wounded' || v.state === 'hidden')) endGame(G, 'm', 'allcaught');
  else if (G.t >= G.nightLen) endGame(G, 'v', 'dawn');
}

function stepVillager(G, v, dt, m) {
  const map = G.map, inp = v.inp;
  const pa = pressed(v, 'a'), pb = pressed(v, 'b'), pc = pressed(v, 'c'), pd = pressed(v, 'd'), pp = pressed(v, 'pingN');
  for (const k of ['snuffT', 'curseT', 'slowT', 'fearT', 'markedT', 'incenseT', 'burstT', 'abCd', 'atkCd']) v[k] = Math.max(0, (v[k] || 0) - dt);
  if (pp && inp.ping && (activeV(v) || v.state === 'ghost')) {
    G.fx.pings = G.fx.pings.filter(p => p.from !== v.id);
    G.fx.pings.push({ x: v.x, y: v.y, kind: inp.ping, name: v.name, from: v.id, t: 6 });
    ev(G, 'ping', { kind: inp.ping, id: v.id });
  }
  v.moving = false;
  if (v.state === 'carried') {
    const mm = m && m.carrying === v.id ? m : null;
    if (!mm) { v.state = 'wounded'; return; }
    v.x = mm.x; v.y = mm.y - 6;
    v.struggle = Math.max(0, v.struggle - dt * 6);
    if (pa) v.struggle += v.ai ? 5 : 7;
    if (v.struggle >= 100) { stunMonster(G, mm, 1.6, v.id); ev(G, 'escaped', { id: v.id }); }
    return;
  }
  if (v.state === 'caged') {
    v.x = map.cage.x + ((v.id * 7) % 9) - 4; v.y = map.cage.y;
    v.cageT -= dt;
    if (v.cageT <= 0) { v.state = 'ghost'; ev(G, 'ghost', { id: v.id }); }
    return;
  }
  if (v.state === 'hidden') {
    const b = map.buildings[v.house];
    v.x = b.door.x; v.y = b.door.y - 2;
    if (pa || Math.hypot(inp.mx, inp.my) > 0.5) { v.state = 'ok-exit'; }
    if (v.state === 'ok-exit') { v.state = v.wasWounded ? 'wounded' : 'ok'; b.hider = -1; v.house = -1; v.y = b.door.y + 3; ev(G, 'unhide', { id: v.id }); }
    return;
  }
  if (v.state === 'ghost') {
    const l = Math.hypot(inp.mx, inp.my);
    if (l > 0.1) { const s = 58 * Math.min(1, l); v.x += inp.mx / Math.max(1, l) * s * dt; v.y += inp.my / Math.max(1, l) * s * dt; v.moving = true; v.fx = inp.mx; v.fy = inp.my; }
    v.x = Math.max(24, Math.min(map.w * TILE - 24, v.x)); v.y = Math.max(24, Math.min(map.h * TILE - 24, v.y));
    if (pa && v.abCd <= 0 && m && dist(v, m) < 64) { G.revealT = Math.max(G.revealT, 3); v.abCd = 20; ev(G, 'chill', { x: m.x, y: m.y, id: v.id }); }
    return;
  }
  // ---- active villager ----
  if (v.state === 'wounded') { v.healT += dt; if (v.healT > 60) { v.state = 'ok'; ev(G, 'healed', { id: v.id }); } }
  // movement
  const l = Math.hypot(inp.mx, inp.my);
  v.sprinting = false;
  const holding = v.act && v.act.hold > 0;
  if (l > 0.15 && !holding) {
    const nx = inp.mx / Math.max(1, l), ny = inp.my / Math.max(1, l);
    v.fx = inp.mx / l; v.fy = inp.my / l;
    if (inp.sprint && (v.stamina > 1 || v.burstT > 0)) v.sprinting = true;
    const sp = villagerSpeed(G, v) * Math.min(1, l);
    moveEntity(map, v, nx * sp * dt, ny * sp * dt, 3);
    v.moving = true; v.walk += dt * (v.sprinting ? 12 : 8);
  }
  const stamMax = v.role === 'miller' ? 130 : 100;
  if (v.sprinting && v.burstT <= 0) v.stamina = Math.max(0, v.stamina - 26 * dt);
  else if (!v.sprinting) v.stamina = Math.min(stamMax, v.stamina + 13 * dt);
  if (v.sprinting && v.incenseT <= 0) { v.noiseT -= dt; if (v.noiseT <= 0) { v.noiseT = 0.45; G.fx.noise.push({ x: v.x, y: v.y, t: 0.8 }); } }
  // salt / holy zones don't affect villagers; hex traps do
  for (let i = G.fx.hex.length - 1; i >= 0; i--) {
    const h = G.fx.hex[i];
    if (Math.hypot(v.x - h.x, v.y - h.y) < 12) { v.slowT = 4; v.markedT = 5; G.fx.hex.splice(i, 1); ev(G, 'hexed', { id: v.id, x: h.x, y: h.y }); }
  }
  // lantern
  if (pc) { v.lantern = (v.lantern + 2) % 3; ev(G, 'lantern', { id: v.id, l: v.lantern }); }
  const lr = lanternRadius(G, v);
  if (lr > 0) v.oil = Math.max(0, v.oil - dt * (v.lantern === 2 ? 0.85 : 0.3) * (v.curseT > 0 ? 3 : 1));
  if (v.oil <= 0 && !v._outWarned) { v._outWarned = true; ev(G, 'oilout', { id: v.id }); }
  if (v.oil > 0) v._outWarned = false;
  // items & abilities
  if (pb) useItem(G, v);
  if (pd) useRoleAbility(G, v);
  // context action
  const ctx = villagerContext(G, v);
  v.ctx = ctx;
  if (!ctx || (v.act && (v.act.k !== ctx.k || v.act.target !== ctx.target))) { v.act = null; v.actT = 0; }
  if (ctx) {
    if (ctx.hold === 0) {
      if (pa) doInstant(G, v, ctx);
    } else if (inp.aHeld) {
      if (!v.act) { v.act = ctx; v.actT = 0; ev(G, 'actstart', { id: v.id, a: ctx.k }); }
      v.actT += dt;
      if (v.actT >= ctx.hold) { finishAction(G, v, ctx); v.act = null; v.actT = 0; }
    } else { v.act = null; v.actT = 0; }
  }
}

function doInstant(G, v, ctx) {
  const map = G.map;
  if (ctx.k === 'pick') {
    const it = G.items.find(i => i.id === ctx.target); if (!it) return;
    if (it.type === 'can') { v.cans++; G.items.splice(G.items.indexOf(it), 1); }
    else { if (v.item) addItem(G, v.item, v.x, v.y + 4); v.item = it.type; G.items.splice(G.items.indexOf(it), 1); }
    ev(G, 'pick', { id: v.id, type: it.type });
  } else if (ctx.k === 'bell') {
    if (G.bell.cd > 0) return;
    G.bell.uses--; G.bell.cd = 12;
    G.revealT = Math.max(G.revealT, 5);
    const m = monster(G);
    if (m && dist(m, map.bell) < 115) { if (G.manifested) damageMonster(G, m, v.id); else stunMonster(G, m, 2.0, v.id); }
    ev(G, 'bell', { id: v.id, x: map.bell.x, y: map.bell.y });
  } else if (ctx.k === 'hide') {
    const b = map.buildings[ctx.target]; if (b.hider >= 0) return;
    b.hider = v.id; v.house = b.id; v.wasWounded = v.state === 'wounded'; v.state = 'hidden'; v.act = null;
    ev(G, 'hide', { id: v.id });
  }
}
function finishAction(G, v, ctx) {
  const map = G.map;
  if (ctx.k === 'rescue') {
    const c = G.ents.find(e => e.id === ctx.target);
    if (c && c.state === 'caged') { c.state = 'wounded'; c.healT = 0; c.x = map.cage.x + 8; c.y = map.cage.y + 8; v.stats.rescues++; ev(G, 'rescued', { id: c.id, by: v.id }); }
  } else if (ctx.k === 'heal') {
    const c = G.ents.find(e => e.id === ctx.target);
    if (c && c.state === 'wounded') { c.state = 'ok'; v.stats.heals++; ev(G, 'healed', { id: c.id, by: v.id }); }
  } else if (ctx.k === 'pour') {
    const a = G.altars[ctx.target];
    if (a && !a.lit && v.cans > 0) {
      v.cans--; a.oil++; v.stats.oil++;
      if (a.oil >= a.need) { a.lit = true; ev(G, 'altarlit', { a: a.id, by: v.id, n: G.altars.filter(x => x.lit).length, of: G.altars.length }); }
      else ev(G, 'poured', { a: a.id, x: a.x, y: a.y });
    }
  } else if (ctx.k === 'search') {
    const b = map.buildings[ctx.target]; if (b.looted) return;
    b.looted = true;
    const loot = rollLoot(G);
    if (loot) addItem(G, loot, b.door.x + 4, b.door.y + 3);
    ev(G, 'searched', { id: v.id, loot });
  } else if (ctx.k === 'refill') {
    v.cans--; v.oil = 100; ev(G, 'refill', { id: v.id });
  }
}

function stepMonster(G, m, dt, lights) {
  const map = G.map, inp = m.inp;
  const pa = pressed(m, 'a'), pb = pressed(m, 'b'), pc = pressed(m, 'c'), pd = pressed(m, 'd');
  m.atkCd = Math.max(0, m.atkCd - dt); m.stunT = Math.max(0, m.stunT - dt); m.rootT = Math.max(0, m.rootT - dt); m.rageT = Math.max(0, m.rageT - dt);
  for (let i = 0; i < 3; i++) m.cd[i] = Math.max(0, m.cd[i] - dt);
  m.inLight = inAnyLight(G, m.x, m.y, lights);
  m.inStrong = m.inLight && inAnyLight(G, m.x, m.y, lights.filter(l => l.kind !== 'lantern'));
  m.invT = Math.max(0, (m.invT || 0) - dt);
  m.moving = false;
  if (m.stunT > 0) return;
  // holy ground and salt push the creature out
  for (const z of G.fx.holy.concat(G.fx.salt)) {
    const d = Math.hypot(m.x - z.x, m.y - z.y);
    if (d < z.r + 4) {
      const nx = (m.x - z.x) / (d || 1), ny = (m.y - z.y) / (d || 1);
      moveEntity(map, m, nx * 60 * dt, ny * 60 * dt, 4);
      if (d < z.r * 0.6 && m.carrying >= 0) stunMonster(G, m, 0.5, -1);
    }
  }
  // iron traps
  for (let i = G.fx.iron.length - 1; i >= 0; i--) {
    const tr = G.fx.iron[i];
    if (Math.hypot(m.x - tr.x, m.y - tr.y) < 7) { m.rootT = 2.6; G.revealT = Math.max(G.revealT, 3); G.fx.iron.splice(i, 1); ev(G, 'trapped', { x: tr.x, y: tr.y }); }
  }
  // abilities
  if (pb) useCreatureAbility(G, m, 0);
  if (pc) useCreatureAbility(G, m, 1);
  if (pd) useCreatureAbility(G, m, 2);
  // movement
  if (m.dashT > 0) {
    m.dashT -= dt;
    moveEntity(map, m, m.dvx * dt, m.dvy * dt, 4); m.moving = true;
    if (G.t > DUSK && m.carrying < 0) for (const v of G.ents) if (activeV(v) && dist(m, v) < 12) { hitVillager(G, m, v); m.dashT = 0; break; }
  } else if (m.rootT <= 0) {
    const l = Math.hypot(inp.mx, inp.my);
    if (l > 0.15) {
      m.fx = inp.mx / l; m.fy = inp.my / l;
      const sp = monsterSpeed(G, m) * Math.min(1, l);
      moveEntity(map, m, inp.mx / Math.max(1, l) * sp * dt, inp.my / Math.max(1, l) * sp * dt, 4);
      m.moving = true; m.walk += dt * 9;
    }
  }
  // attack / search
  m.ctx = null;
  let target = null, td = 14;
  if (m.carrying < 0) for (const v of G.ents) if (activeV(v)) { const d = dist(m, v); if (d < td) { td = d; target = v; } }
  if (target) m.ctx = { k: G.t < DUSK ? 'tooearly' : 'attack' };
  if (pa && target && m.atkCd <= 0) {
    if (G.t < DUSK) ev(G, 'tooearly', { id: m.id });
    else { hitVillager(G, m, target); ev(G, 'claw', { x: target.x, y: target.y }); }
  }
  if (!target && m.carrying < 0) {
    const door = map.buildings.find(b => b.kind !== 'crypt' && b.kind !== 'church' && dist(m, b.door) < 13);
    if (door) {
      m.ctx = { k: 'msearch' };
      if (inp.aHeld) {
        if (m.searchDoor !== door.id) { m.searchDoor = door.id; m.searchT = 0; ev(G, 'scratch', { x: door.door.x, y: door.door.y, b: door.id }); }
        m.searchT += dt;
        const need = m.creature === 'wolf' ? 1.0 : 2.4;
        m.ctx.p = m.searchT / need;
        if (m.searchT >= need) {
          m.searchT = 0; m.searchDoor = -1;
          if (door.hider >= 0) {
            const v = G.ents.find(e => e.id === door.hider);
            door.hider = -1;
            if (v) { v.state = v.wasWounded ? 'wounded' : 'ok'; v.house = -1; v.x = door.door.x; v.y = door.door.y + 4; ev(G, 'found', { id: v.id }); if (G.t >= DUSK) hitVillager(G, m, v); }
          } else ev(G, 'empty', { b: door.id });
        }
      } else { m.searchT = 0; m.searchDoor = -1; }
    }
  }
  if (m.carrying >= 0) {
    m.ctx = { k: 'carry' };
    if (dist(m, map.cage) < 16) {
      const v = G.ents.find(e => e.id === m.carrying);
      m.carrying = -1;
      if (v) {
        v.captures++;
        if (v.captures >= 2) { v.state = 'ghost'; v.x = map.cage.x; v.y = map.cage.y; ev(G, 'ghost', { id: v.id }); }
        else { v.state = 'caged'; v.cageT = CAGE_TIME; ev(G, 'caged', { id: v.id }); }
      }
    }
  }
}

// ===== snapshot (host -> clients) =====
const R1 = v => Math.round(v * 10) / 10;
function snapshot(G) {
  return {
    t: R1(G.t), ph: G.phase, w: G.winner, er: G.endReason, mf: G.manifested ? 1 : 0, rv: R1(G.revealT), lt: R1(G.lightT),
    bell: [G.bell.uses, R1(G.bell.cd)],
    al: G.altars.map(a => [a.oil, a.lit ? 1 : 0]),
    it: G.items.map(i => [i.id, i.type, Math.round(i.x), Math.round(i.y)]),
    b: G.map.buildings.map(b => (b.looted ? 1 : 0) + (b.hider >= 0 ? 2 : 0)),
    e: G.ents.map(e => e.side === 'v'
      ? { i: e.id, x: R1(e.x), y: R1(e.y), fx: R1(e.fx), fy: R1(e.fy), s: e.state, mv: e.moving ? 1 : 0, sp: e.sprinting ? 1 : 0, o: Math.round(e.oil), l: e.lantern,
          st: Math.round(e.stamina), c: e.cans, it: e.item, ab: R1(e.abCd), sn: R1(e.snuffT), cu: R1(e.curseT), mk: R1(e.markedT), inc: R1(e.incenseT), sl: R1(e.slowT),
          ct: R1(e.cageT), cap: e.captures, sg: Math.round(e.struggle), ac: e.act ? e.act.k : null, at: e.act ? R1(e.actT / e.act.hold) : 0, cx: e.ctx ? e.ctx.k : null, cxr: e.ctx ? (e.ctx.ready === false ? 0 : 1) : 1, ci: e.ctx && e.ctx.type ? e.ctx.type : null, h: e.house, bu: R1(e.burstT), at2: R1(e.atkCd), stt: e.stats }
      : { i: e.id, x: R1(e.x), y: R1(e.y), fx: R1(e.fx), fy: R1(e.fy), mv: e.moving ? 1 : 0, hp: e.hp, mh: e.maxHp, ca: e.carrying, cd: e.cd.map(R1), ak: R1(e.atkCd), sn: R1(e.stunT), ro: R1(e.rootT), ra: R1(e.rageT), da: e.dashT > 0 ? 1 : 0, il: e.inLight ? 1 : 0, cx: e.ctx ? e.ctx.k : null, cp: e.ctx && e.ctx.p ? R1(e.ctx.p) : 0 }),
    fx: {
      salt: G.fx.salt.map(z => [Math.round(z.x), Math.round(z.y), z.r, R1(z.t)]),
      holy: G.fx.holy.map(z => [Math.round(z.x), Math.round(z.y), z.r, R1(z.t)]),
      iron: G.fx.iron.map(z => [Math.round(z.x), Math.round(z.y)]),
      hex: G.fx.hex.map(z => [Math.round(z.x), Math.round(z.y), R1(z.t)]),
      fake: G.fx.fake.map(z => [Math.round(z.x), Math.round(z.y), R1(z.t)]),
      flare: G.fx.flare.map(z => [Math.round(z.x), Math.round(z.y), R1(z.t)]),
      proj: G.fx.proj.map(z => [Math.round(z.x), Math.round(z.y)]),
      pings: G.fx.pings.map(z => [Math.round(z.x), Math.round(z.y), z.kind, z.name, R1(z.t), z.fake ? 1 : 0]),
      noise: G.fx.noise.map(z => [Math.round(z.x), Math.round(z.y), R1(z.t)]),
    },
  };
}
