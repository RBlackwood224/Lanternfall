'use strict';
// ===== Game lifecycle and main loop =====
const GAME = { G: null, opts: null, mode: 'off', locals: [], paused: false, acc: 0, ended: false, attract: null, spectate: false, stepT: 0, beatPrev: 0, whisperT: 5 };
const STEP = 1 / 60;

function startGame(opts, flags) {
  flags = flags || {};
  GAME.attract = null;
  GAME.opts = opts;
  GAME.G = createGame(opts);
  GAME.ended = false; GAME.paused = false; GAME.acc = 0; INPUT.latch = {};
  GAME.spectate = !!flags.spectate;
  GAME.mode = NET.mode === 'host' ? 'host' : NET.mode === 'client' ? 'client' : (flags.couch ? 'couch' : 'solo');
  // translate AI creature name into this player's language
  for (const e of GAME.G.ents) if (e.side === 'm' && e.ai) e.name = t('cr_' + e.creature);
  if (GAME.mode === 'couch') GAME.locals = COUCH.slots.map((s, i) => ({ id: i + 1, ctrl: new Controller(s.dev) }));
  else if (GAME.spectate) GAME.locals = [];
  else GAME.locals = [{ id: GAME.mode === 'solo' ? 1 : NET.myId, ctrl: new Controller('any') }];
  for (const l of GAME.locals) { const e = GAME.G.ents.find(x => x.id === l.id); if (e) e.inp = l.ctrl.inp; }
  setWorld(GAME.G);
  hideScreens(); screenStack = [];
  $('hud').classList.remove('hidden'); document.body.classList.add('ingame');
  HUD.last = {}; $('announce').innerHTML = '';
  touchLabels(); applyI18n();
  audioInit(); ambienceStart(); musicStart();
  const me = myEntity();
  if (me) {
    if (me.side === 'v') announce(t('role_' + me.role) + ' — ' + t('roleD_' + me.role), 'big');
    else announce(t('cr_' + me.creature) + ' — ' + t('crD_' + me.creature), 'big');
  } else if (GAME.spectate) announce(t('spectating'));
  if (GAME.G.special !== 'normal') announce(t('sp_' + GAME.G.special) + ': ' + t('spD_' + GAME.G.special));
}
function myEntity() { if (!GAME.G || !GAME.locals.length) return null; return GAME.G.ents.find(e => e.id === GAME.locals[0].id) || null; }

function quitToMenu() {
  if (NET.mode !== 'off') netClose();
  GAME.G = null; GAME.locals = []; GAME.mode = 'off';
  $('hud').classList.add('hidden'); document.body.classList.remove('ingame');
  ambienceStop(); musicStop();
  startAttract();
  screenStack = []; show('scrTitle', false);
}
function backToLobby() {
  GAME.G = null; GAME.locals = [];
  $('hud').classList.add('hidden'); document.body.classList.remove('ingame');
  ambienceStop(); musicStop();
  startAttract();
  screenStack = ['scrTitle', 'scrOnline']; show('scrLobby', false); renderLobby();
}
function pauseGame() {
  if (!GAME.G || GAME.ended) return;
  if (GAME.mode === 'solo' || GAME.mode === 'couch') GAME.paused = true;
  show('scrPause', false);
}
function resumeGame() { GAME.paused = false; hideScreens(); screenStack = []; }
function onGlobalKey(e) {
  if (e.code === 'Escape') {
    if (GAME.G && !GAME.ended) { const cur = currentScreen(); if (!cur) pauseGame(); else if (cur === 'scrPause') resumeGame(); else menuBack(); }
    else menuBack();
  }
  if (e.code === 'F11') { e.preventDefault(); toggleFullscreen(); }
}
function onPadStart() { if (GAME.G && !GAME.ended) { const cur = currentScreen(); if (!cur) pauseGame(); else if (cur === 'scrPause') resumeGame(); } }

function onGameEnd(G) {
  if (GAME.ended) return;
  GAME.ended = true;
  const me = myEntity();
  const won = G.winner === (me ? me.side : 'v');
  if (won) SFX.win(); else SFX.lose();
  announce(t(G.winner === 'v' ? 'win_v' : 'win_m'), 'big ' + (won ? 'good' : 'bad'));
  setTimeout(() => { if (GAME.G === G) showEnd(G); }, 2600);
}

// ---------- event presentation (sounds + messages, all in the local language) ----------
function nameOf(G, id) { const e = G.ents.find(x => x.id === id); return e ? e.name : '?'; }
function handleEvent(G, e) {
  if (G !== GAME.G) return;
  const me = myEntity();
  const lx = me ? me.x : R.cam.x + R.VW / 2, ly = me ? me.y : R.cam.y + R.VH / 2;
  const isMe = me && e.id === me.id, mon = me && me.side === 'm', vil = me && me.side === 'v';
  const P = n => playAt(n, e.x, e.y, lx, ly);
  switch (e.k) {
    case 'altarlit': SFX.altarlit(); R.flashT = 0.25; announce(t('ev_altarlit', { name: nameOf(G, e.by), n: e.n, of: e.of }), 'good'); break;
    case 'poured': P('pour'); break;
    case 'manifest': SFX.manifest(); R.shake = 3; announce(t('ev_manifest'), 'big'); break;
    case 'wounded': P('wounded'); if (isMe) R.shake = 2.5; break;
    case 'grabbed': P('grabbed'); announce(t('ev_grabbed', { name: nameOf(G, e.id) }), 'bad'); if (isMe) R.shake = 3; break;
    case 'escaped': announce(t('ev_escaped', { name: nameOf(G, e.id) }), 'good'); break;
    case 'caged': SFX.caged(1, 0); announce(t('ev_caged', { name: nameOf(G, e.id) }), 'bad'); break;
    case 'ghost': SFX.ghost(); announce(t('ev_ghost', { name: nameOf(G, e.id) }), 'bad'); break;
    case 'rescued': SFX.rescued(); announce(t('ev_rescued', { name: nameOf(G, e.id) }), 'good'); break;
    case 'healed': if (isMe || (me && e.by === me.id)) SFX.healed(1, 0); break;
    case 'bell': P('bell'); SFX.bell(0.6, 0); announce(t('ev_bell'), 'big'); break;
    case 'nightfalls': SFX.nightfalls(); announce(t('ev_nightfalls'), 'big'); break;
    case 'predawn': SFX.predawn(); announce(t('ev_predawn'), 'big'); break;
    case 'thunder': SFX.thunder(); break;
    case 'snuffed': P('snuffed'); if (isMe) announce(t('ev_snuffed'), 'bad'); break;
    case 'cursed': if (isMe) { SFX.hexed(1, 0); announce(t('ev_cursed'), 'bad'); } break;
    case 'hexed': if (isMe) { SFX.hexed(1, 0); announce(t('ev_hexed'), 'bad'); } else if (mon) { SFX.hexed(0.6, 0); announce(t('ev_hexed')); } break;
    case 'trapped': P('trapped'); announce(t('ev_trapped'), mon ? 'bad' : 'good'); break;
    case 'found': announce(t('ev_found', { name: nameOf(G, e.id) }), 'bad'); break;
    case 'empty': if (mon) announce(t('ev_empty')); break;
    case 'oilout': if (isMe) announce(t('ev_oilout'), 'bad'); break;
    case 'mhit': P('mhit'); announce(t('ev_mhit'), mon ? 'bad' : 'good'); break;
    case 'searched': if (isMe) { SFX.pick(1, 0); announce(e.loot ? t('ev_loot', { item: t('it_' + e.loot) }) : t('ev_nothing')); } break;
    case 'pick': if (isMe) SFX.pick(1, 0); break;
    case 'stunned': P('stunned'); if (mon) R.shake = 1.5; break;
    case 'howl': P('howl'); if (vil) { SFX.howl(0.5, 0); announce(t('ev_howl'), 'bad'); } break;
    case 'rats': P('rats'); if (mon) announce(t('ev_rats')); break;
    case 'mimic': if (mon) announce(t('ev_mimic')); else SFX.ping(); break;
    case 'ping': if (!mon) SFX.ping(); break;
    case 'scratch': P('scratch'); break;
    case 'claw': P('claw'); break;
    case 'throw': P('throw'); break;
    case 'splash': P('splash'); break;
    case 'salt': P('salt'); break;
    case 'ability': P('ability'); break;
    case 'lantern': if (isMe) SFX.lantern(1); break;
    case 'refill': if (isMe) SFX.pour(1, 0); break;
    case 'chill': announce(t('ev_chill', { name: nameOf(G, e.id) }), 'good'); SFX.ghost(); break;
    case 'tooearly': if (isMe || mon) { SFX.denied(); announce(t('ev_tooearly')); } break;
    case 'left': announce(t('ev_left', { name: e.name })); break;
    case 'pounce': case 'rage': P('claw'); break;
    case 'end': onGameEnd(G); break;
  }
}

// ---------- attract mode behind the menus ----------
function startAttract() {
  const cr = CREATURES[Math.floor(Math.random() * 3)];
  const players = [];
  for (let i = 0; i < 4; i++) players.push({ id: 10 + i, name: AI_NAMES[i], side: 'v', role: ROLES[i], ai: true, aiLevel: 'normal' });
  players.push({ id: 50, name: t('cr_' + cr), side: 'm', creature: cr, ai: true, aiLevel: 'normal' });
  const G = createGame({ seed: (Math.random() * 1e9) | 0, players, nightLen: 300, special: ['normal', 'fog', 'storm'][Math.floor(Math.random() * 3)], difficulty: 'normal' });
  G.t = DUSK + 2; G._night = true;
  GAME.attract = { G, follow: 0, followT: 0 };
  setWorld(G);
}

// ---------- main loop ----------
let lastTs = 0, hudT = 0, stepSnd = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016); lastTs = ts;
  pollMenuPads(dt);
  couchPoll();
  const G = GAME.G;
  if (G) {
    // local input
    for (const l of GAME.locals) {
      l.ctrl.poll();
      if (l.ctrl.pausePressed) onPadStart();
    }
    if (currentScreen() && currentScreen() !== 'scrEnd') for (const l of GAME.locals) { l.ctrl.inp.mx = 0; l.ctrl.inp.my = 0; l.ctrl.inp.aHeld = false; }
    if (GAME.mode === 'couch' && GAME.locals.length === 2) couchLeash(G);
    if (GAME.mode !== 'client') {
      if (!GAME.paused) {
        GAME.acc += dt;
        let n = 0;
        while (GAME.acc >= STEP && n++ < 5) {
          GAME.acc -= STEP;
          stepAI(G, STEP);
          stepGame(G, STEP);
          if (G.events.length) {
            const evs = G.events; G.events = [];
            for (const e of evs) handleEvent(G, e);
            if (GAME.mode === 'host') NET.pendingEvents.push(...evs);
          }
        }
      }
      hostNetTick(dt);
      // progress rings for local entities
      for (const e of G.ents) { e.actFrac = e.act && e.act.hold ? e.actT / e.act.hold : 0; if (e.side === 'm') e.searchFrac = e.ctx && e.ctx.p ? e.ctx.p : 0; }
    } else {
      const inp = GAME.locals[0] ? GAME.locals[0].ctrl.inp : null;
      clientNetTick(dt, inp);
      clientInterpolate(G, dt, inp);
    }
    const me = myEntity();
    let cams = GAME.locals.map(l => G.ents.find(e => e.id === l.id)).filter(Boolean);
    if (!cams.length) { const alive = G.ents.find(e => e.side === 'v' && (e.state === 'ok' || e.state === 'wounded')) || G.ents[0]; cams = [alive]; }
    if (cams.length > 1) cams = cams.filter(e => e.state !== 'ghost' && e.state !== 'caged').concat([]).slice(0, 2), cams = cams.length ? cams : [me];
    renderGame(G, me, dt, cams);
    hudT -= dt;
    if (hudT <= 0) { hudT = 1 / 15; updateHUD(G, me); }
    presentationTick(G, me, dt);
  } else if (GAME.attract) {
    const A = GAME.attract, AG = A.G;
    stepAI(AG, dt); stepGame(AG, dt); AG.events = [];
    if (AG.phase === 'end' || AG.t > AG.nightLen - 5) startAttract();
    A.followT -= dt;
    if (A.followT <= 0) { A.followT = 9; A.follow = (A.follow + 1) % AG.ents.length; }
    const f = AG.ents[A.follow] || AG.ents[0];
    renderGame(AG, null, dt, [f.state === 'caged' || f.state === 'hidden' ? monster(AG) : f]);
  }
  requestAnimationFrame(frame);
}
// keep both couch players on one screen
function couchLeash(G) {
  const [a, b] = GAME.locals.map(l => G.ents.find(e => e.id === l.id));
  if (!a || !b) return;
  const maxX = R.VW - 50, maxY = R.VH - 50;
  for (const [e, o, l] of [[a, b, GAME.locals[0]], [b, a, GAME.locals[1]]]) {
    const dx = e.x - o.x, dy = e.y - o.y, inp = l.ctrl.inp;
    if (o.state === 'ghost' || o.state === 'caged' || e.state === 'ghost') continue;
    if (Math.abs(dx) > maxX && Math.sign(inp.mx) === Math.sign(dx)) inp.mx = 0;
    if (Math.abs(dy) > maxY && Math.sign(inp.my) === Math.sign(dy)) inp.my = 0;
  }
}
function presentationTick(G, me, dt) {
  ambienceTick(dt);
  // heartbeat
  if (R.beatK > 0) {
    const ph = Math.floor(R.beat);
    if (ph !== GAME.beatPrev) { GAME.beatPrev = ph; SFX.heartbeat(Math.min(1, 0.25 + R.beatK)); }
    GAME.whisperT -= dt;
    if (R.beatK > 0.55 && GAME.whisperT <= 0) { GAME.whisperT = 4 + Math.random() * 6; SFX.whisper(R.beatK, Math.random() * 2 - 1); }
  }
  // footsteps
  if (me && me.moving && (me.side === 'm' || me.state === 'ok' || me.state === 'wounded')) {
    stepSnd -= dt;
    if (stepSnd <= 0) { stepSnd = me.sprinting ? 0.22 : 0.34; SFX.step(me.side === 'm' ? 0.6 : 1, 0); }
  }
}

// ---------- boot ----------
function boot() {
  loadSettings();
  LANG = detectLang();
  buildArt();
  initRenderer();
  initTouch();
  initOnlineUI();
  initSettingsUI();
  loadKeyNames();
  applyI18n(); renderTitle();
  setVolumes(SET.sfx / 10, SET.mus / 10);
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    audioInit(); SFX.click && SND.ctx && SFX.click();
    const g = b.dataset.go;
    if (g === 'back') { menuBack(); return; }
    if (g === 'title') { screenStack = []; show('scrTitle', false); return; }
    if (g === 'couch') COUCH.slots = [];
    show('scr' + g.charAt(0).toUpperCase() + g.slice(1));
  }));
  $('soloStart').onclick = () => { audioInit(); startGame(soloOpts(), {}); };
  $('couchStart').onclick = () => { if (!COUCH.slots.length) return; audioInit(); startGame(couchOpts(), { couch: true }); };
  $('btnResume').onclick = resumeGame;
  $('btnQuit').onclick = quitToMenu;
  $('pauseBtn').onclick = pauseGame;
  $('btnRematch').onclick = () => {
    if (GAME.mode === 'host') hostStartGame();
    else if (GAME.mode === 'couch') startGame(couchOpts(), { couch: true });
    else startGame(soloOpts(), {});
  };
  $('btnEndMenu').onclick = () => {
    if (GAME.mode === 'host') { hostBroadcast({ t: 'tolobby' }); backToLobby(); }
    else quitToMenu();
  };
  document.addEventListener('pointerdown', () => audioInit(), { once: true });
  document.addEventListener('keydown', () => audioInit(), { once: true });
  startAttract();
  show('scrTitle', false);
  const room = new URLSearchParams(location.search).get('room');
  if (room) { show('scrOnline'); $('joinCode').value = room.toUpperCase().slice(0, 5); $('netName').focus(); }
  requestAnimationFrame(frame);
}
window.addEventListener('load', boot);
