'use strict';
// ===== Computer-controlled villagers and creature =====
function aiState(e) {
  return e.aiS || (e.aiS = { think: 0, path: null, pathGoal: null, repath: 0, lastSeen: null, stuckT: 0, lx: e.x, ly: e.y, pressT: 0, lantT: 0, goal: null, hideT: 0, wander: null, scratchDoor: -1 });
}
function aiPress(e, key) { e.inp[key] = (e.inp[key] || 0) + 1; }
function aiMoveTo(G, e, gx, gy, dt, r) {
  const S = aiState(e);
  const d = Math.hypot(gx - e.x, gy - e.y);
  if (d < (r || 4)) { e.inp.mx = 0; e.inp.my = 0; return true; }
  // direct line when close & clear
  if (d < 40 && lineClear(G.map, e.x, e.y, gx, gy)) { e.inp.mx = (gx - e.x) / d; e.inp.my = (gy - e.y) / d; S.path = null; return false; }
  S.repath -= dt;
  const goalMoved = !S.pathGoal || Math.hypot(S.pathGoal.x - gx, S.pathGoal.y - gy) > 12;
  if (!S.path || S.repath <= 0 || goalMoved) {
    S.path = findPath(G.map, e.x, e.y, gx, gy);
    S.pathGoal = { x: gx, y: gy };
    S.repath = 0.8 + Math.random() * 0.5;
  }
  if (!S.path || !S.path.length) { e.inp.mx = (gx - e.x) / d; e.inp.my = (gy - e.y) / d; return false; }
  let wp = S.path[0];
  while (S.path.length > 1 && Math.hypot(wp.x - e.x, wp.y - e.y) < 5) { S.path.shift(); wp = S.path[0]; }
  // skip ahead if a later waypoint is directly visible
  if (S.path.length > 2 && lineClear(G.map, e.x, e.y, S.path[2].x, S.path[2].y)) { S.path.splice(0, 2); wp = S.path[0]; }
  const wd = Math.hypot(wp.x - e.x, wp.y - e.y) || 1;
  e.inp.mx = (wp.x - e.x) / wd; e.inp.my = (wp.y - e.y) / wd;
  // stuck handling
  if (Math.hypot(e.x - S.lx, e.y - S.ly) < 0.3) { S.stuckT += dt; if (S.stuckT > 0.8) { S.path = null; S.stuckT = 0; e.inp.mx += (Math.random() - 0.5) * 2; e.inp.my += (Math.random() - 0.5) * 2; } }
  else S.stuckT = 0;
  S.lx = e.x; S.ly = e.y;
  return false;
}
function faceTo(e, t) { const d = Math.hypot(t.x - e.x, t.y - e.y) || 1; e.fx = (t.x - e.x) / d; e.fy = (t.y - e.y) / d; }

function stepAI(G, dt) {
  for (const e of G.ents) {
    if (!e.ai) continue;
    e.inp.mx = 0; e.inp.my = 0; e.inp.aHeld = false; e.inp.sprint = false;
    if (e.side === 'v') aiVillager(G, e, dt); else aiMonster(G, e, dt);
  }
}

// ---------------- villagers ----------------
function aiVillager(G, v, dt) {
  const S = aiState(v), m = monster(G), map = G.map;
  const lvl = { easy: 0.6, normal: 1, hard: 1.3 }[v.aiLevel] || 1;
  S.pressT -= dt; S.lantT -= dt;
  if (v.state === 'carried') { if (S.pressT <= 0) { aiPress(v, 'a'); S.pressT = 0.32 / lvl; } return; }
  if (v.state === 'caged') return;
  if (v.state === 'ghost') {
    if (m) { aiMoveTo(G, v, m.x + 20, m.y - 10, dt, 10); if (dist(v, m) < 60 && v.abCd <= 0 && S.pressT <= 0) { aiPress(v, 'a'); S.pressT = 1; } }
    return;
  }
  // perception
  const seen = m && (monsterVisibleToAll(G, m) || dist(v, m) < 34 || (v.role === 'herbwoman' && dist(v, m) < 110));
  if (seen) S.lastSeen = { x: m.x, y: m.y, t: G.t };
  const known = S.lastSeen && G.t - S.lastSeen.t < 4 ? S.lastSeen : null;
  const mStunned = m && m.stunT > 0.4;
  const dangerD = known && !mStunned ? Math.hypot(known.x - v.x, known.y - v.y) : 999;
  const danger = dangerD < 80 && G.t > DUSK - 3;

  if (v.state === 'hidden') {
    S.hideT += dt;
    if (S.hideT > 7 && dangerD > 90) { aiPress(v, 'a'); S.hideT = 0; }
    return;
  }
  // ---- immediate reactions ----
  if (danger && m) {
    if (v.item === 'holy' && dangerD < 48) { faceTo(v, m); aiPress(v, 'b'); }
    else if (v.item === 'salt' && dangerD < 30) aiPress(v, 'b');
    else if (v.item === 'incense' && v.incenseT <= 0) aiPress(v, 'b');
    if (v.abCd <= 0 && ((v.role === 'priest' && dangerD < 34) || (v.role === 'watchman' && dangerD < 60) || (v.role === 'miller') || (v.role === 'smith' && dangerD < 40))) aiPress(v, 'd');
  }
  if (v.item === 'bread' && v.state === 'wounded') aiPress(v, 'b');
  if (v.role === 'herbwoman' && v.abCd <= 0 && m && dist(v, m) < 100 && !seen && G.t > DUSK) aiPress(v, 'd');
  // lantern management
  let wantL = v.oil > 30 ? 2 : 1;
  if (danger && v.incenseT > 0) wantL = 1;
  if (v.lantern !== wantL && S.lantT <= 0) { aiPress(v, 'c'); S.lantT = 0.25; }

  // stand still while a friend bandages us
  if (v.state === 'wounded' && !danger && villagers(G).some(o => o.act && o.act.k === 'heal' && o.act.target === v.id)) return;
  // ---- goals ----
  S.think -= dt;
  if (S.think <= 0 || !S.goal) { S.think = 0.4 / lvl + Math.random() * 0.2; S.goal = chooseVillagerGoal(G, v, m, known, danger, dangerD); }
  const g = S.goal;
  if (!g) return;
  if (g.k === 'flee') v.inp.sprint = v.stamina > 10;
  const arrived = aiMoveTo(G, v, g.x, g.y, dt, g.r || 5);
  if (g.k === 'manifestHunt' && m && dist(v, m) < 16) { faceTo(v, m); if (v.atkCd <= 0) aiPress(v, 'b'); }
  if (g.ctx) {
    const ctx = v.ctx;
    if (ctx && ctx.k === g.ctx && (!g.target || ctx.target === g.target)) {
      v.inp.mx = 0; v.inp.my = 0;
      if (ctx.hold > 0) v.inp.aHeld = true;
      else if (S.pressT <= 0) { aiPress(v, 'a'); S.pressT = 0.3; S.think = 0; }
    } else if (arrived && S.pressT <= 0) { S.think = 0; }
  }
  if (g.k === 'wander' && arrived) S.think = 0;
}

function chooseVillagerGoal(G, v, m, known, danger, dangerD) {
  const map = G.map, vs = villagers(G);
  // flee
  if (danger) {
    // wounded and near a free house: hide
    if (v.state === 'wounded' || dangerD < 30) {
      for (const b of map.buildings) if (b.kind === 'house' && b.looted && b.hider < 0 && dist(v, b.door) < 26 && Math.hypot(b.door.x - known.x, b.door.y - known.y) > dist(v, b.door)) return { k: 'hide', x: b.door.x, y: b.door.y, ctx: 'hide', target: b.id };
    }
    if (G.manifested && v.item === 'dagger') return { k: 'manifestHunt', x: known.x, y: known.y, r: 8 };
    let best = null, bs = -1e9;
    const cands = [];
    for (const a of G.altars) if (a.lit) cands.push({ x: a.x, y: a.y + 12, bonus: 50 });
    for (const o of vs) if (o !== v && activeV(o)) cands.push({ x: o.x, y: o.y, bonus: 20 });
    if (map.bell && G.bell.uses > 0 && G.bell.cd <= 0) cands.push({ x: map.bell.x, y: map.bell.y + 4, bonus: 30, bell: true });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; cands.push({ x: v.x + Math.cos(a) * 70, y: v.y + Math.sin(a) * 70, bonus: 0 }); }
    for (const c of cands) {
      if (collides(map, c.x, c.y, 3)) continue;
      const away = Math.hypot(c.x - known.x, c.y - known.y), near = Math.hypot(c.x - v.x, c.y - v.y);
      // don't run through the monster
      const dirOk = ((c.x - v.x) * (known.x - v.x) + (c.y - v.y) * (known.y - v.y)) < near * dangerD * 0.3;
      const s = away - near * 0.35 + c.bonus + (dirOk ? 0 : -80);
      if (s > bs) { bs = s; best = c; }
    }
    if (best) return best.bell ? { k: 'flee', x: best.x, y: best.y, ctx: 'bell' } : { k: 'flee', x: best.x, y: best.y, r: 8 };
  }
  // manifested: grab a dagger and hunt
  if (G.manifested) {
    if (v.item !== 'dagger') {
      let b = null, bd = 1e9; for (const it of G.items) if (it.type === 'dagger') { const d = dist(v, it); if (d < bd) { bd = d; b = it; } }
      if (b) return { k: 'getDagger', x: b.x, y: b.y, ctx: 'pick', target: b.id };
    } else if (m) return { k: 'manifestHunt', x: (known || m).x, y: (known || m).y, r: 8 };
  }
  // rescue caged friends (nearest two helpers)
  const caged = vs.filter(o => o.state === 'caged');
  if (caged.length) {
    const helpers = vs.filter(activeV).sort((a, b) => dist(a, map.cage) - dist(b, map.cage)).slice(0, 2);
    const guard = known && Math.hypot(known.x - map.cage.x, known.y - map.cage.y) < 50;
    if (helpers.includes(v) && (!guard || caged.some(c => c.cageT < 15))) return { k: 'rescue', x: map.cage.x, y: map.cage.y - 2, ctx: 'rescue' };
  }
  // heal nearby wounded friend
  for (const o of vs) if (o !== v && o.state === 'wounded' && dist(v, o) < 70) return { k: 'heal', x: o.x, y: o.y, ctx: 'heal', target: o.id };
  // ring the bell when the creature carries someone nearby
  if (m && m.carrying >= 0 && G.bell.uses > 0 && G.bell.cd <= 0 && dist(v, map.bell) < 90 && dist(m, map.bell) < 120) return { k: 'bell', x: map.bell.x, y: map.bell.y + 4, ctx: 'bell' };
  // lantern refill
  if (v.cans > 0 && v.oil < 18) return { k: 'refill', x: v.x, y: v.y, ctx: 'refill' };
  // carry oil to an altar
  if (v.cans > 0) {
    let b = null, bd = 1e9;
    for (const a of G.altars) if (!a.lit) { let d = dist(v, a); if (known && Math.hypot(known.x - a.x, known.y - a.y) < 50) d += 150; if (d < bd) { bd = d; b = a; } }
    if (b) {
      if (v.role === 'smith' && v.abCd <= 0 && dist(v, b) < 30 && !G.fx.iron.some(t => Math.hypot(t.x - b.x, t.y - b.y) < 40)) aiPress(v, 'd');
      return { k: 'pour', x: b.x, y: b.y + 10, ctx: 'pour', target: b.id };
    }
  }
  // pick useful items close by
  let bi = null, bid = 90;
  for (const it of G.items) {
    const d = dist(v, it);
    const want = it.type === 'can' ? v.cans < (v.role === 'miller' ? 2 : 1) && !G.manifested : (!v.item && it.type !== 'dagger') || (it.type === 'dagger' && v.item !== 'dagger');
    // avoid items other villagers are already heading to
    const taken = vs.some(o => o !== v && o.aiS && o.aiS.goal && o.aiS.goal.target === it.id && dist(o, it) < d);
    if (want && !taken && d < bid) { bid = d; bi = it; }
  }
  if (bi) return { k: 'pick', x: bi.x, y: bi.y, ctx: 'pick', target: bi.id };
  // search unlooted houses (prefer close, avoid known danger)
  if (v.cans < 1) {
    let bb = null, bbd = 1e9;
    for (const b of map.buildings) {
      if (b.looted || b.kind === 'church' || b.kind === 'crypt') continue;
      let d = dist(v, b.door);
      if (known && Math.hypot(known.x - b.door.x, known.y - b.door.y) < 60) d += 200;
      if (vs.some(o => o !== v && o.aiS && o.aiS.goal && o.aiS.goal.target === b.id && o.aiS.goal.k === 'search')) d += 120;
      if (d < bbd) { bbd = d; bb = b; }
    }
    if (bb) return { k: 'search', x: bb.door.x, y: bb.door.y + 2, ctx: 'search', target: bb.id };
    // pick up any can at all
    let c = null, cd = 1e9; for (const it of G.items) if (it.type === 'can') { const d = dist(v, it); if (d < cd) { cd = d; c = it; } }
    if (c) return { k: 'pick', x: c.x, y: c.y, ctx: 'pick', target: c.id };
  }
  // wander around a lit altar / near friends
  const S = aiState(v);
  if (!S.wander || dist(v, S.wander) < 10 || G.rnd() < 0.05) {
    const p = G.map.open[Math.floor(G.rnd() * G.map.open.length)];
    const anchor = G.altars.find(a => a.lit) || G.map.spawn;
    S.wander = G.rnd() < 0.6 ? { x: anchor.x + (G.rnd() - 0.5) * 60, y: anchor.y + 14 + (G.rnd() - 0.5) * 40 } : p;
    if (collides(map, S.wander.x, S.wander.y, 3)) S.wander = p;
  }
  return { k: 'wander', x: S.wander.x, y: S.wander.y, r: 8 };
}

// ---------------- creature ----------------
function aiMonster(G, m, dt) {
  const S = aiState(m), map = G.map;
  const lvl = { easy: 0.65, normal: 1, hard: 1.35 }[m.aiLevel] || 1;
  S.pressT -= dt;
  if (m.stunT > 0 || m.dashT > 0) return;
  const vs = villagers(G);
  // carrying a victim: straight to the crypt
  if (m.carrying >= 0) { aiMoveTo(G, m, map.cage.x, map.cage.y, dt, 6); return; }
  // perceive
  const visible = vs.filter(v => monsterSees(G, m, v));
  S.think -= dt;
  if (S.think <= 0 || !S.mode) {
    S.think = 0.35 / lvl;
    pickMonsterTarget(G, m, S, visible, vs);
  }
  const tgt = S.target != null ? G.ents.find(e => e.id === S.target) : null;
  const ab = (slot) => { if (m.cd[slot] <= 0 && S.pressT <= 0) { aiPress(m, ['b', 'c', 'd'][slot]); S.pressT = 0.3; } };

  if (S.mode === 'flee' && S.fleeFrom) {
    const d = Math.hypot(m.x - S.fleeFrom.x, m.y - S.fleeFrom.y) || 1;
    aiMoveTo(G, m, m.x + (m.x - S.fleeFrom.x) / d * 80, m.y + (m.y - S.fleeFrom.y) / d * 80, dt, 6);
    if (m.creature === 'wolf' && m.cd[2] <= 0) ab(2);
    return;
  }
  if (S.mode === 'hunt' && tgt) {
    const d = dist(m, tgt);
    aiMoveTo(G, m, tgt.x, tgt.y, dt, 3);
    if (d < 14 && m.atkCd <= 0 && G.t >= DUSK && S.pressT <= 0) { aiPress(m, 'a'); S.pressT = 0.18 / lvl; }
    if (G.t >= DUSK - 2) {
      if (m.creature === 'wisp') {
        if (d < 80 && lanternRadius(G, tgt) > 0) ab(0);
        if (d > 90 && G.rnd() < 0.01 * lvl) ab(1);
      } else if (m.creature === 'witch') {
        if (d < 90) ab(0);
      } else if (m.creature === 'wolf') {
        if (d > 22 && d < 64 && lineClear(map, m.x, m.y, tgt.x, tgt.y)) { faceTo(m, tgt); ab(0); }
        if (m.inLight) ab(2);
      }
    }
    return;
  }
  if (S.mode === 'search' && S.door != null) {
    const b = map.buildings[S.door];
    const arrived = aiMoveTo(G, m, b.door.x, b.door.y + 2, dt, 5);
    if (arrived || dist(m, b.door) < 11) { m.inp.mx = 0; m.inp.my = 0; m.inp.aHeld = true; }
    return;
  }
  // roam / ambush / sabotage
  if (!S.roam || dist(m, S.roam) < 10) S.roam = pickRoam(G, m, S);
  aiMoveTo(G, m, S.roam.x, S.roam.y, dt, 6);
  if (m.creature === 'wisp' && G.rnd() < 0.004 * lvl) ab(2);
  if (m.creature === 'wisp' && G.t > DUSK && G.rnd() < 0.004 * lvl) ab(1);
  if (m.creature === 'witch') {
    if (G.items.some(it => it.type === 'can' && dist(m, it) < 100) || G.altars.some(a => !a.lit && a.oil > 0 && dist(m, a) < 44)) ab(1);
    if (G.rnd() < 0.006 * lvl && G.altars.some(a => !a.lit && dist(m, a) < 50)) ab(2);
  }
  if (m.creature === 'wolf' && G.t > DUSK && visible.length === 0 && G.rnd() < 0.01 * lvl) ab(1);
}

function pickMonsterTarget(G, m, S, visible, vs) {
  const map = G.map;
  S.mode = 'roam'; S.target = null;
  // when banishment is possible, avoid dagger carriers while weak
  if (G.manifested) {
    const armed = vs.filter(v => activeV(v) && v.item === 'dagger' && dist(m, v) < 70);
    if (armed.length && (m.hp <= 1 || armed.length >= 2)) { S.mode = 'flee'; S.fleeFrom = armed[0]; return; }
  }
  // hunt
  let best = null, bs = 1e9;
  for (const v of visible) {
    if (!activeV(v)) continue;
    let s = dist(m, v);
    const friends = vs.filter(o => o !== v && activeV(o) && dist(o, v) < 50).length;
    s += friends * 35;
    if (v.state === 'wounded') s -= 40;
    if (G.manifested && v.item === 'dagger') s += 80;
    for (const a of G.altars) if (a.lit && dist(v, a) < 55) s += 60;
    for (const z of G.fx.holy) if (Math.hypot(v.x - z.x, v.y - z.y) < z.r + 8) s += 200;
    if (S.target === v.id) s -= 25; // stick to target
    if (s < bs) { bs = s; best = v; }
  }
  if (best && (bs < 240 || G.difficulty === 'hard')) {
    S.mode = 'hunt'; S.target = best.id; S.lastTarget = { x: best.x, y: best.y, id: best.id, t: G.t };
    return;
  }
  // lost a target near a house? search it
  if (S.lastTarget && G.t - S.lastTarget.t < 8) {
    const t = G.ents.find(e => e.id === S.lastTarget.id);
    if (t && t.state === 'hidden') {
      const b = map.buildings[t.house];
      if (b && dist(m, b.door) < 120) { S.mode = 'search'; S.door = b.id; return; }
    }
  }
  // camp the cage while someone is locked inside
  if (vs.some(v => v.state === 'caged') && G.rnd() < 0.6) { S.mode = 'roam'; S.roam = { x: map.cage.x + (G.rnd() - 0.5) * 70, y: map.cage.y + 10 + G.rnd() * 40 }; return; }
}
function pickRoam(G, m, S) {
  const map = G.map;
  // noises first
  const n = G.fx.noise.slice().sort((a, b) => dist(m, a) - dist(m, b))[0];
  if (n && G.rnd() < 0.8) return { x: n.x, y: n.y };
  // altars that have oil in them attract the creature
  const ax = G.altars.filter(a => !a.lit).sort((a, b) => b.oil - a.oil);
  if (ax.length && G.rnd() < 0.55) { const a = ax[Math.floor(G.rnd() * Math.min(2, ax.length))]; return { x: a.x + (G.rnd() - 0.5) * 50, y: a.y + 14 + (G.rnd() - 0.5) * 30 }; }
  // a random unlooted house might hide someone
  const hs = map.buildings.filter(b => b.kind === 'house' && b.hider >= 0);
  if (hs.length && G.rnd() < 0.25) { const b = hs[0]; S.mode = 'search'; S.door = b.id; return { x: b.door.x, y: b.door.y }; }
  return map.open[Math.floor(G.rnd() * map.open.length)];
}
