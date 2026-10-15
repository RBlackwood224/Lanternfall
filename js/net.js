'use strict';
// ===== Online play over PeerJS (host-authoritative) =====
const NET = { mode: 'off', peer: null, conns: new Map(), myId: 1, code: null, nextId: 2, sendT: 0, inT: 0, snaps: [], hostConn: null, pendingEvents: [] };
const PEER_PREFIX = 'lanternfall-night-';
const NET_VER = 1;

function randomCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

function netHost(onReady, onError) {
  if (typeof Peer === 'undefined') { onError('nopeer'); return; }
  NET.mode = 'host'; NET.code = randomCode(); NET.myId = 1; NET.nextId = 2; NET.conns.clear();
  const peer = NET.peer = new Peer(PEER_PREFIX + NET.code, { debug: 0 });
  peer.on('open', () => onReady(NET.code));
  peer.on('error', err => { if (err.type === 'unavailable-id') { peer.destroy(); netHost(onReady, onError); } else onError(err.type || 'error'); });
  peer.on('connection', conn => {
    conn.on('data', d => hostOnData(conn, d));
    conn.on('close', () => hostOnClose(conn));
    conn.on('error', () => hostOnClose(conn));
  });
}
function hostOnData(conn, d) {
  if (!d || !d.t) return;
  if (d.t === 'hello') {
    if (d.v !== NET_VER) { conn.send({ t: 'reject', why: 'version' }); return; }
    if (LOBBY.players.filter(p => !p.ai).length >= 6) { conn.send({ t: 'reject', why: 'full' }); return; }
    const id = NET.nextId++;
    conn.pid = id;
    NET.conns.set(id, conn);
    const p = { id, name: String(d.name || 'Player').slice(0, 14), side: 'v', role: ROLES[(id - 1) % ROLES.length], creature: 'wisp', ready: false };
    LOBBY.players.push(p);
    conn.send({ t: 'welcome', id, code: NET.code });
    lobbyChanged();
    if (GAME.G && GAME.G.phase === 'play') conn.send({ t: 'start', opts: GAME.opts, spectate: true });
  } else if (d.t === 'pick') {
    const p = LOBBY.players.find(x => x.id === conn.pid); if (!p) return;
    if (d.side === 'm' && LOBBY.players.some(x => x.side === 'm' && x.id !== p.id) && LOBBY.settings.monster === 'choose') d.side = 'v';
    if (d.side) p.side = d.side;
    if (ROLES.includes(d.role)) p.role = d.role;
    if (CREATURES.includes(d.creature)) p.creature = d.creature;
    lobbyChanged();
  } else if (d.t === 'in') {
    const G = GAME.G; if (!G) return;
    const e = G.ents.find(x => x.id === conn.pid); if (!e || e.ai) return;
    const i = d.i;
    Object.assign(e.inp, { mx: clampN(i[0]), my: clampN(i[1]), sprint: !!i[2], aHeld: !!i[3], a: i[4] | 0, b: i[5] | 0, c: i[6] | 0, d: i[7] | 0, ping: i[8] | 0, pingN: i[9] | 0 });
  } else if (d.t === 'chat') {
    // quick-chat phrases are keys, every client translates them into its own language
  }
}
function clampN(v) { v = +v || 0; return Math.max(-1, Math.min(1, v)); }
function hostOnClose(conn) {
  if (!conn.pid) return;
  NET.conns.delete(conn.pid);
  const p = LOBBY.players.find(x => x.id === conn.pid);
  if (p) {
    LOBBY.players.splice(LOBBY.players.indexOf(p), 1);
    const G = GAME.G;
    if (G && G.phase === 'play') { const e = G.ents.find(x => x.id === conn.pid); if (e) { e.ai = true; e.aiLevel = 'normal'; ev(G, 'left', { name: e.name }); } }
    else toast(t('playerLeft', { name: p.name }));
  }
  lobbyChanged();
}
function hostBroadcast(msg) { for (const c of NET.conns.values()) if (c.open) c.send(msg); }
function lobbyChanged() {
  if (NET.mode === 'host') hostBroadcast({ t: 'lobby', l: lobbyPublic() });
  if (typeof renderLobby === 'function') renderLobby();
}
function lobbyPublic() { return { players: LOBBY.players.map(p => ({ id: p.id, name: p.name, side: p.side, role: p.role, creature: p.creature })), settings: LOBBY.settings }; }

// host: per-frame network work
function hostNetTick(dt) {
  if (NET.mode !== 'host' || !GAME.G) return;
  NET.sendT -= dt;
  if (NET.sendT <= 0) {
    NET.sendT = 1 / 20;
    const ev = NET.pendingEvents; NET.pendingEvents = [];
    hostBroadcast({ t: 's', s: snapshot(GAME.G), ev });
  }
}

// ---------------- client ----------------
function netJoin(code, name, onJoined, onError) {
  if (typeof Peer === 'undefined') { onError('nopeer'); return; }
  NET.mode = 'client'; NET.code = code.toUpperCase();
  const peer = NET.peer = new Peer(undefined, { debug: 0 });
  let opened = false;
  const to = setTimeout(() => { if (!opened) onError('timeout'); }, 12000);
  peer.on('open', () => {
    const conn = NET.hostConn = peer.connect(PEER_PREFIX + NET.code, { reliable: true });
    conn.on('open', () => { opened = true; clearTimeout(to); conn.send({ t: 'hello', name, v: NET_VER }); });
    conn.on('data', d => clientOnData(d, onJoined, onError));
    conn.on('close', () => { if (NET.mode === 'client') clientLost(); });
    conn.on('error', () => onError('conn'));
  });
  peer.on('error', err => { clearTimeout(to); onError(err.type === 'peer-unavailable' ? 'noroom' : (err.type || 'error')); });
}
function clientOnData(d, onJoined, onError) {
  if (!d || !d.t) return;
  if (d.t === 'welcome') { NET.myId = d.id; onJoined(); }
  else if (d.t === 'reject') onError(d.why);
  else if (d.t === 'lobby') { LOBBY.players = d.l.players; LOBBY.settings = d.l.settings; if (typeof renderLobby === 'function') renderLobby(); }
  else if (d.t === 'start') { NET.snaps = []; startGame(d.opts, { spectate: !!d.spectate }); }
  else if (d.t === 's') clientSnapshot(d.s, d.ev);
  else if (d.t === 'tolobby') { backToLobby(); }
}
function clientLost() {
  NET.mode = 'off';
  if (NET.peer) try { NET.peer.destroy(); } catch (e) { }
  showError(t('hostLost'));
}
function clientSendPick(side, role, creature) { if (NET.hostConn && NET.hostConn.open) NET.hostConn.send({ t: 'pick', side, role, creature }); }
function clientNetTick(dt, ctrlInp) {
  if (NET.mode !== 'client' || !NET.hostConn || !NET.hostConn.open || !ctrlInp) return;
  NET.inT -= dt;
  if (NET.inT <= 0) {
    NET.inT = 1 / 30;
    const i = ctrlInp;
    NET.hostConn.send({ t: 'in', i: [Math.round(i.mx * 100) / 100, Math.round(i.my * 100) / 100, i.sprint ? 1 : 0, i.aHeld ? 1 : 0, i.a, i.b, i.c, i.d, i.ping, i.pingN] });
  }
}
function netClose() {
  NET.mode = 'off';
  for (const c of NET.conns.values()) try { c.close(); } catch (e) { }
  NET.conns.clear();
  if (NET.hostConn) try { NET.hostConn.close(); } catch (e) { }
  NET.hostConn = null;
  if (NET.peer) try { NET.peer.destroy(); } catch (e) { }
  NET.peer = null;
}

// apply a host snapshot onto the local copy of the game
function clientSnapshot(s, events) {
  const G = GAME.G; if (!G) return;
  const now = performance.now();
  G.t = s.t; G.manifested = !!s.mf; G.revealT = s.rv; G.lightT = s.lt;
  G.bell.uses = s.bell[0]; G.bell.cd = s.bell[1];
  s.al.forEach((a, i) => { if (G.altars[i]) { G.altars[i].oil = a[0]; G.altars[i].lit = !!a[1]; } });
  G.items = s.it.map(i => ({ id: i[0], type: i[1], x: i[2], y: i[3] }));
  s.b.forEach((f, i) => { const b = G.map.buildings[i]; if (b) { b.looted = !!(f & 1); b.hider = (f & 2) ? 1 : -1; } });
  const posMap = {};
  for (const se of s.e) {
    const e = G.ents.find(x => x.id === se.i); if (!e) continue;
    posMap[se.i] = [se.x, se.y];
    const isMe = e.id === NET.myId;
    if (!isMe || e._px === undefined) { e._px = undefined; }
    e.sx = se.x; e.sy = se.y;
    if (!isMe) { e.fx = se.fx; e.fy = se.fy; }
    e.moving = !!se.mv;
    if (e.side === 'v') {
      Object.assign(e, { state: se.s, sprinting: !!se.sp, oil: se.o, lantern: se.l, stamina: se.st, cans: se.c, item: se.it, abCd: se.ab, snuffT: se.sn, curseT: se.cu, markedT: se.mk, incenseT: se.inc, slowT: se.sl, cageT: se.ct, captures: se.cap, struggle: se.sg, house: se.h, burstT: se.bu, atkCd: se.at2, stats: se.stt });
      e.ctxK = se.cx; e.ctxReady = se.cxr; e.ctxItem = se.ci; e.actFrac = se.ac ? se.at : 0;
    } else {
      Object.assign(e, { hp: se.hp, maxHp: se.mh, carrying: se.ca, cd: se.cd, atkCd: se.ak, stunT: se.sn, rootT: se.ro, rageT: se.ra, inLight: !!se.il });
      e.ctxK = se.cx; e.searchFrac = se.cp;
      e.dashing = !!se.da;
    }
  }
  const f = s.fx;
  G.fx.salt = f.salt.map(z => ({ x: z[0], y: z[1], r: z[2], t: z[3] }));
  G.fx.holy = f.holy.map(z => ({ x: z[0], y: z[1], r: z[2], t: z[3] }));
  G.fx.iron = f.iron.map(z => ({ x: z[0], y: z[1] }));
  G.fx.hex = f.hex.map(z => ({ x: z[0], y: z[1], t: z[2] }));
  G.fx.fake = f.fake.map(z => ({ x: z[0], y: z[1], t: z[2] }));
  G.fx.flare = f.flare.map(z => ({ x: z[0], y: z[1], t: z[2] }));
  G.fx.proj = f.proj.map(z => ({ x: z[0], y: z[1] }));
  G.fx.pings = f.pings.map(z => ({ x: z[0], y: z[1], kind: z[2], name: z[3], t: z[4], fake: !!z[5] }));
  G.fx.noise = f.noise.map(z => ({ x: z[0], y: z[1], t: z[2] }));
  NET.snaps.push({ time: now, pos: posMap });
  while (NET.snaps.length > 6) NET.snaps.shift();
  if (events) for (const e of events) handleEvent(G, e);
  if (s.ph === 'end' && G.phase !== 'end') { G.phase = 'end'; G.winner = s.w; G.endReason = s.er; onGameEnd(G); }
}
// smooth positions on the client: interpolate others ~100ms behind, predict ourselves
function clientInterpolate(G, dt, myInp) {
  const S = NET.snaps; if (!S.length) return;
  const rt = performance.now() - 100;
  let a = S[0], b = S[S.length - 1];
  for (let i = 0; i < S.length - 1; i++) if (S[i].time <= rt && S[i + 1].time >= rt) { a = S[i]; b = S[i + 1]; break; }
  const k = b.time > a.time ? Math.max(0, Math.min(1, (rt - a.time) / (b.time - a.time))) : 1;
  for (const e of G.ents) {
    const pa = a.pos[e.id], pb = b.pos[e.id];
    if (!pb) continue;
    if (e.id === NET.myId && myInp) {
      // prediction
      if (e.rx === undefined) { e.rx = pb[0]; e.ry = pb[1]; }
      const free = e.side === 'v' ? (e.state === 'ok' || e.state === 'wounded') && !(e.actFrac > 0) : (e.stunT <= 0 && e.rootT <= 0 && !e.dashing);
      const ghost = e.side === 'v' && e.state === 'ghost';
      if (free || ghost) {
        const l = Math.hypot(myInp.mx, myInp.my);
        if (l > 0.15) {
          let sp = ghost ? 58 : e.side === 'v' ? (myInp.sprint && e.stamina > 1 ? 70 : 44) * (e.cans > 0 ? 0.88 : 1) * (e.state === 'wounded' ? 0.8 : 1) * (e.slowT > 0 ? 0.5 : 1) : monsterSpeed(G, e);
          sp *= Math.min(1, l);
          const tmp = { x: e.rx, y: e.ry };
          if (ghost) { tmp.x += myInp.mx / Math.max(1, l) * sp * dt; tmp.y += myInp.my / Math.max(1, l) * sp * dt; }
          else moveEntity(G.map, tmp, myInp.mx / Math.max(1, l) * sp * dt, myInp.my / Math.max(1, l) * sp * dt, e.side === 'v' ? 3 : 4);
          e.rx = tmp.x; e.ry = tmp.y; e.fx = myInp.mx / l; e.fy = myInp.my / l;
          e.walk = (e.walk || 0) + dt * 8;
        }
      }
      const sx = e.sx, sy = e.sy, err = Math.hypot(sx - e.rx, sy - e.ry);
      if (err > 28 || !(free || ghost)) { e.rx += (sx - e.rx) * Math.min(1, dt * 12); e.ry += (sy - e.ry) * Math.min(1, dt * 12); if (err > 60) { e.rx = sx; e.ry = sy; } }
      else { e.rx += (sx - e.rx) * Math.min(1, dt * 2.5); e.ry += (sy - e.ry) * Math.min(1, dt * 2.5); }
      e.x = e.rx; e.y = e.ry;
    } else {
      const p0 = pa || pb;
      e.rx = p0[0] + (pb[0] - p0[0]) * k; e.ry = p0[1] + (pb[1] - p0[1]) * k;
      if (e.moving) e.walk = (e.walk || 0) + dt * 8;
      e.x = e.rx; e.y = e.ry;
    }
  }
}
