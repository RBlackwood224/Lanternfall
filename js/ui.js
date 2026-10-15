'use strict';
// ===== Menus, lobby, HUD =====
const $ = id => document.getElementById(id);
const SET = { sfx: 8, mus: 6, name: '', solo: { side: 'v', role: 'watchman', creature: 'random', ai: 3, aiM: 4, diff: 'normal', len: 360, special: 'normal' }, couch: { ai: 2, diff: 'normal', len: 360, special: 'normal' } };
const LOBBY = { players: [], settings: { monster: 'choose', ai: 2, diff: 'normal', len: 360, special: 'normal' } };
let screenStack = [];
let KEYNAMES = {};

function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem('lf_settings') || '{}'); Object.assign(SET, s); SET.solo = Object.assign({ side: 'v', role: 'watchman', creature: 'random', ai: 3, aiM: 4, diff: 'normal', len: 360, special: 'normal' }, s.solo || {}); SET.couch = Object.assign({ ai: 2, diff: 'normal', len: 360, special: 'normal' }, s.couch || {}); } catch (e) { }
}
function saveSettings() { try { localStorage.setItem('lf_settings', JSON.stringify(SET)); } catch (e) { } }

function show(id, push) {
  const cur = document.querySelector('.screen.active');
  if (cur && push !== false && cur.id !== id) screenStack.push(cur.id);
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  const scr = $(id);
  if (scr && INPUT.lastDevice === 'pad') { const f = focusables()[0]; if (f) setTimeout(() => f.focus(), 30); }
  if (id === 'scrHowto') renderHowto();
  if (id === 'scrSettings') syncSettingsUI();
  if (id === 'scrSolo') renderSolo();
  if (id === 'scrCouch') { INPUT.latch = {}; renderCouch(); }
}
function hideScreens() { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); }
function currentScreen() { const s = document.querySelector('.screen.active'); return s ? s.id : null; }
function menuBack() {
  const cur = currentScreen();
  if (!cur) return;
  if (cur === 'scrPause') { resumeGame(); return; }
  if (cur === 'scrTitle' || cur === 'scrEnd') return;
  if (cur === 'scrLobby') { leaveLobby(); return; }
  const prev = screenStack.pop() || 'scrTitle';
  show(prev, false);
}
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 2600); }
function showError(msg) { toast(msg); if (GAME.G) quitToMenu(); }

function fillSelect(sel, opts, val) {
  sel.innerHTML = '';
  for (const [v, label] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); }
  sel.value = String(val);
}
const diffOpts = () => [['easy', t('d_easy')], ['normal', t('d_normal')], ['hard', t('d_hard')]];
const lenOpts = () => [[240, t('min', { n: 4 })], [360, t('min', { n: 6 })], [480, t('min', { n: 8 })]];
const spOpts = () => ['normal', 'storm', 'fog', 'bloodmoon'].map(s => [s, t('sp_' + s)]);

async function loadKeyNames() {
  try { if (navigator.keyboard && navigator.keyboard.getLayoutMap) { const m = await navigator.keyboard.getLayoutMap(); for (const k of ['KeyE', 'KeyQ', 'KeyF', 'KeyR', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) if (m.get(k)) KEYNAMES[k] = m.get(k).toUpperCase(); } } catch (e) { }
}
function kn(code) { return KEYNAMES[code] || code.replace('Key', ''); }
function btnLabel(slot) {
  const dev = INPUT.lastDevice;
  if (dev === 'pad') return { a: 'A', b: 'X', c: 'Y', d: 'B' }[slot];
  if (dev === 'touch') return '';
  return kn({ a: 'KeyE', b: 'KeyQ', c: 'KeyF', d: 'KeyR' }[slot]);
}

// ---------------- title ----------------
function renderTitle() {
  const box = $('titleLangs'); box.innerHTML = '';
  for (const l in LANGS) {
    const b = document.createElement('button'); b.textContent = LANGS[l]; if (l === LANG) b.classList.add('sel');
    b.onclick = () => { setLang(l); }; box.appendChild(b);
  }
}
function setLang(l) {
  LANG = l; try { localStorage.setItem('lf_lang', l); } catch (e) { }
  applyI18n(); renderTitle();
  const cur = currentScreen(); if (cur) show(cur, false);
  if (cur === 'scrLobby') renderLobby();
  touchLabels(); HUD.last = {};
}

// ---------------- solo setup ----------------
function card(icon, name, desc, sel, onClick) {
  const d = document.createElement('div'); d.className = 'card' + (sel ? ' sel' : ''); d.tabIndex = 0; d.dataset.nav = '';
  d.innerHTML = (icon ? `<img src="${icon}" alt="">` : '<b style="font-size:26px">?</b>') + `<b>${name}</b>` + (desc ? `<small>${desc}</small>` : '');
  d.onclick = onClick; return d;
}
function renderSolo() {
  const S = SET.solo;
  document.querySelectorAll('#soloSide button').forEach(b => { b.classList.toggle('sel', b.dataset.v === S.side); b.onclick = () => { S.side = b.dataset.v; if (S.side === 'm' && S.creature === 'random') S.creature = 'wisp'; saveSettings(); renderSolo(); }; });
  const roles = $('soloRoles'); roles.innerHTML = '';
  $('soloRoleWrap').style.display = S.side === 'v' ? '' : 'none';
  for (const r of ROLES) roles.appendChild(card(ART.icon['role_' + r], t('role_' + r), t('roleD_' + r), S.role === r, () => { S.role = r; saveSettings(); renderSolo(); }));
  const crs = $('soloCreatures'); crs.innerHTML = '';
  for (const c of (S.side === 'v' ? ['random'] : []).concat(CREATURES)) {
    crs.appendChild(card(c === 'random' ? null : ART.icon['cr_' + c], c === 'random' ? '?' : t('cr_' + c), c === 'random' ? '' : t('crD_' + c), S.creature === c, () => { S.creature = c; saveSettings(); renderSolo(); }));
  }
  const aiN = S.side === 'v' ? [0, 1, 2, 3, 4, 5] : [2, 3, 4, 5, 6];
  fillSelect($('soloAi'), aiN.map(n => [n, String(n)]), S.side === 'v' ? S.ai : S.aiM);
  $('soloAi').onchange = e => { if (S.side === 'v') S.ai = +e.target.value; else S.aiM = +e.target.value; saveSettings(); };
  fillSelect($('soloDiff'), diffOpts(), S.diff); $('soloDiff').onchange = e => { S.diff = e.target.value; saveSettings(); };
  fillSelect($('soloLen'), lenOpts(), S.len); $('soloLen').onchange = e => { S.len = +e.target.value; saveSettings(); };
  fillSelect($('soloSpecial'), spOpts(), S.special); $('soloSpecial').onchange = e => { S.special = e.target.value; saveSettings(); $('soloSpecialD').textContent = t('spD_' + S.special); };
  $('soloSpecialD').textContent = t('spD_' + S.special);
}
function soloOpts() {
  const S = SET.solo, players = [];
  const seed = (Math.random() * 1e9) | 0;
  const nm = SET.name || 'Player';
  if (S.side === 'v') {
    players.push({ id: 1, name: nm, side: 'v', role: S.role });
    const others = ROLES.filter(r => r !== S.role);
    for (let i = 0; i < S.ai; i++) players.push({ id: 10 + i, name: AI_NAMES[i], side: 'v', role: others[i % others.length], ai: true, aiLevel: S.diff });
    const cr = S.creature === 'random' ? CREATURES[Math.floor(Math.random() * 3)] : S.creature;
    players.push({ id: 50, name: t('cr_' + cr), side: 'm', creature: cr, ai: true, aiLevel: S.diff });
  } else {
    players.push({ id: 1, name: nm, side: 'm', creature: S.creature === 'random' ? 'wisp' : S.creature });
    for (let i = 0; i < S.aiM; i++) players.push({ id: 10 + i, name: AI_NAMES[i], side: 'v', role: ROLES[i % ROLES.length], ai: true, aiLevel: S.diff });
  }
  return { seed, players, nightLen: S.len, special: S.special, difficulty: S.diff };
}

// ---------------- couch ----------------
const COUCH = { slots: [] };
function renderCouch() {
  const C = SET.couch, box = $('couchSlots'); box.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const s = COUCH.slots[i], d = document.createElement('div'); d.className = 'cslot' + (s ? ' on' : '');
    if (!s) d.innerHTML = `<b>${t('p', { n: i + 1 })}</b><small>${t('pressJoin')}</small>`;
    else {
      d.innerHTML = `<img src="${ART.icon['role_' + s.role]}" style="width:28px;image-rendering:pixelated"><b>${t('p', { n: i + 1 })} · ${s.dev === 'kb' ? '⌨' : '🎮 ' + (+s.dev.slice(3) + 1)}</b>`;
      const sel = document.createElement('select'); fillSelect(sel, ROLES.map(r => [r, t('role_' + r)]), s.role);
      sel.onchange = e => { s.role = e.target.value; renderCouch(); }; d.appendChild(sel);
    }
    box.appendChild(d);
  }
  fillSelect($('couchAi'), [0, 1, 2, 3, 4].map(n => [n, String(n)]), C.ai); $('couchAi').onchange = e => { C.ai = +e.target.value; saveSettings(); };
  fillSelect($('couchDiff'), diffOpts(), C.diff); $('couchDiff').onchange = e => { C.diff = e.target.value; saveSettings(); };
  fillSelect($('couchLen'), lenOpts(), C.len); $('couchLen').onchange = e => { C.len = +e.target.value; saveSettings(); };
  fillSelect($('couchSpecial'), spOpts(), C.special); $('couchSpecial').onchange = e => { C.special = e.target.value; saveSettings(); };
  $('couchStart').disabled = COUCH.slots.length === 0;
}
function couchPoll() {
  if (currentScreen() !== 'scrCouch') return;
  for (const dev of anyJoinPress()) {
    if (COUCH.slots.some(s => s.dev === dev) || COUCH.slots.length >= 2) continue;
    if (dev === 'kb' && document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement.id === 'couchStart') continue;
    const used = COUCH.slots.map(s => s.role);
    COUCH.slots.push({ dev, role: ROLES.find(r => !used.includes(r)) });
    SND.ctx && SFX.pick(1, 0);
    renderCouch();
  }
}
function couchOpts() {
  const C = SET.couch, players = [];
  COUCH.slots.forEach((s, i) => players.push({ id: i + 1, name: t('p', { n: i + 1 }), side: 'v', role: s.role }));
  const used = COUCH.slots.map(s => s.role), others = ROLES.filter(r => !used.includes(r));
  for (let i = 0; i < C.ai; i++) players.push({ id: 10 + i, name: AI_NAMES[i], side: 'v', role: others[i % others.length], ai: true, aiLevel: C.diff });
  const cr = CREATURES[Math.floor(Math.random() * 3)];
  players.push({ id: 50, name: t('cr_' + cr), side: 'm', creature: cr, ai: true, aiLevel: C.diff });
  return { seed: (Math.random() * 1e9) | 0, players, nightLen: C.len, special: C.special, difficulty: C.diff };
}

// ---------------- online ----------------
function initOnlineUI() {
  $('netName').value = SET.name || '';
  $('netName').oninput = e => { SET.name = e.target.value.trim().slice(0, 14); saveSettings(); };
  $('joinCode').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  $('btnHost').onclick = () => {
    const name = SET.name || 'Host';
    $('netStatus').textContent = t('connecting');
    netHost(code => {
      LOBBY.players = [{ id: 1, name, side: 'v', role: SET.solo.role || 'watchman', creature: 'wisp' }];
      $('netStatus').textContent = '';
      show('scrLobby'); renderLobby();
    }, err => { $('netStatus').textContent = t('err_' + err) || t('err_error'); netClose(); });
  };
  $('btnJoin').onclick = () => {
    const code = $('joinCode').value.trim(); if (code.length < 4) return;
    $('netStatus').textContent = t('connecting');
    netJoin(code, SET.name || 'Player', () => { $('netStatus').textContent = ''; show('scrLobby'); renderLobby(); },
      err => { $('netStatus').textContent = t('err_' + err) !== 'err_' + err ? t('err_' + err) : t('err_error'); netClose(); });
  };
  $('btnCopy').onclick = () => {
    const url = location.origin + location.pathname + '?room=' + NET.code;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast(t('linkCopied')), () => toast(url));
  };
  $('btnLeave').onclick = leaveLobby;
  $('btnLobbyStart').onclick = () => { if (NET.mode === 'host') hostStartGame(); };
  const pick = () => {
    const me = LOBBY.players.find(p => p.id === NET.myId); if (!me) return;
    const side = document.querySelector('#lobSide button.sel') ? document.querySelector('#lobSide button.sel').dataset.v : me.side;
    if (NET.mode === 'host') { me.side = side; me.role = $('lobRole').value; me.creature = $('lobCreature').value; if (side === 'm' && LOBBY.settings.monster === 'choose') LOBBY.players.forEach(p => { if (p !== me && p.side === 'm') p.side = 'v'; }); lobbyChanged(); }
    else clientSendPick(side, $('lobRole').value, $('lobCreature').value);
  };
  document.querySelectorAll('#lobSide button').forEach(b => b.onclick = () => { document.querySelectorAll('#lobSide button').forEach(x => x.classList.toggle('sel', x === b)); pick(); });
  $('lobRole').onchange = pick; $('lobCreature').onchange = pick;
  const hs = () => {
    if (NET.mode !== 'host') return;
    Object.assign(LOBBY.settings, { monster: $('lobMM').value, ai: +$('lobAi').value, diff: $('lobDiff').value, len: +$('lobLen').value, special: $('lobSpecial').value });
    lobbyChanged();
  };
  for (const id of ['lobMM', 'lobAi', 'lobDiff', 'lobLen', 'lobSpecial']) $(id).onchange = hs;
}
function renderLobby() {
  if (currentScreen() !== 'scrLobby') return;
  $('lobbyCode').textContent = NET.code || '';
  const ul = $('lobbyPlayers'); ul.innerHTML = '';
  const st = LOBBY.settings;
  for (const p of LOBBY.players) {
    const li = document.createElement('li');
    const icon = p.side === 'm' ? ART.icon['cr_' + p.creature] : ART.icon['role_' + p.role];
    const sideTxt = p.side === 'm' ? t('cr_' + p.creature) : t('role_' + p.role);
    li.innerHTML = `<img src="${icon}" alt=""><span></span><span class="tag"></span>`;
    li.children[1].textContent = p.name + (p.id === NET.myId ? ` (${t('you')})` : '') + (p.id === 1 ? ' ★' : '');
    li.children[2].textContent = sideTxt;
    ul.appendChild(li);
  }
  const me = LOBBY.players.find(p => p.id === NET.myId);
  if (me) {
    document.querySelectorAll('#lobSide button').forEach(b => b.classList.toggle('sel', b.dataset.v === me.side));
    fillSelect($('lobRole'), ROLES.map(r => [r, t('role_' + r)]), me.role);
    fillSelect($('lobCreature'), CREATURES.map(c => [c, t('cr_' + c)]), me.creature);
  }
  $('lobSide').parentElement.style.display = st.monster === 'choose' ? '' : 'none';
  const isHost = NET.mode === 'host';
  fillSelect($('lobMM'), ['choose', 'random', 'rotate', 'ai'].map(m => [m, t('mm_' + m)]), st.monster);
  fillSelect($('lobAi'), [0, 1, 2, 3, 4, 5].map(n => [n, String(n)]), st.ai);
  fillSelect($('lobDiff'), diffOpts(), st.diff);
  fillSelect($('lobLen'), lenOpts(), st.len);
  fillSelect($('lobSpecial'), spOpts(), st.special);
  for (const id of ['lobMM', 'lobAi', 'lobDiff', 'lobLen', 'lobSpecial']) $(id).disabled = !isHost;
  $('btnLobbyStart').style.display = isHost ? '' : 'none';
  $('lobWait').style.display = isHost ? 'none' : '';
  $('btnCopy').style.display = isHost ? '' : 'none';
}
function leaveLobby() { netClose(); LOBBY.players = []; show('scrOnline', false); screenStack = ['scrTitle']; }
let rotateIdx = 0;
function hostStartGame() {
  const st = LOBBY.settings, humans = LOBBY.players.slice();
  let mId = -1;
  if (st.monster === 'choose') { const p = humans.find(p => p.side === 'm'); if (p) mId = p.id; }
  else if (st.monster === 'random' && humans.length > 1) mId = humans[Math.floor(Math.random() * humans.length)].id;
  else if (st.monster === 'rotate' && humans.length > 1) { mId = humans[rotateIdx % humans.length].id; rotateIdx++; }
  const players = [];
  for (const p of humans) {
    if (p.id === mId) players.push({ id: p.id, name: p.name, side: 'm', creature: p.creature || 'wisp' });
    else players.push({ id: p.id, name: p.name, side: 'v', role: p.role });
  }
  const used = players.filter(p => p.side === 'v').map(p => p.role);
  const free = ROLES.filter(r => !used.includes(r)).concat(ROLES);
  const vHumans = players.filter(p => p.side === 'v').length;
  const aiN = Math.max(mId < 0 ? 0 : (vHumans === 0 ? 2 : 0), Math.min(st.ai, 7 - vHumans));
  for (let i = 0; i < aiN; i++) players.push({ id: 10 + i, name: AI_NAMES[i], side: 'v', role: free[i % free.length], ai: true, aiLevel: st.diff });
  if (mId < 0) { const cr = CREATURES[Math.floor(Math.random() * 3)]; players.push({ id: 50, name: 'creature', side: 'm', creature: cr, ai: true, aiLevel: st.diff }); }
  const opts = { seed: (Math.random() * 1e9) | 0, players, nightLen: st.len, special: st.special, difficulty: st.diff };
  hostBroadcast({ t: 'start', opts });
  startGame(opts, {});
}

// ---------------- how to / settings ----------------
let htPage = 0;
function renderHowto() {
  const pages = t('howtoPages');
  htPage = Math.max(0, Math.min(pages.length - 1, htPage));
  $('htTitle').textContent = pages[htPage][0]; $('htText').textContent = pages[htPage][1];
  $('htDots').innerHTML = pages.map((_, i) => `<i class="${i === htPage ? 'on' : ''}"></i>`).join('');
  $('keysKb').textContent = t('keysKb', { move: kn('KeyW') + kn('KeyA') + kn('KeyS') + kn('KeyD'), sprint: 'Shift', a: kn('KeyE') + '/Space', b: kn('KeyQ'), c: kn('KeyF'), d: kn('KeyR') });
  $('keysPad').textContent = t('keysPad');
  $('keysKbM').textContent = t('keysKbM', { a: kn('KeyE'), b: kn('KeyQ'), c: kn('KeyF'), d: kn('KeyR') }) + ' · ' + t('keysPadM');
}
function syncSettingsUI() {
  fillSelect($('setLang'), Object.entries(LANGS), LANG);
  $('setSfx').value = SET.sfx; $('setMus').value = SET.mus;
}
function initSettingsUI() {
  $('setLang').onchange = e => setLang(e.target.value);
  $('setSfx').oninput = e => { SET.sfx = +e.target.value; setVolumes(SET.sfx / 10, SET.mus / 10); saveSettings(); };
  $('setMus').oninput = e => { SET.mus = +e.target.value; setVolumes(SET.sfx / 10, SET.mus / 10); saveSettings(); };
  $('btnFs').onclick = toggleFullscreen;
  $('htPrev').onclick = () => { htPage--; renderHowto(); };
  $('htNext').onclick = () => { htPage++; renderHowto(); };
}
function toggleFullscreen() {
  const d = document.documentElement;
  if (!document.fullscreenElement) { (d.requestFullscreen || d.webkitRequestFullscreen || (() => { })).call(d); try { screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }
  else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
}

// ---------------- HUD ----------------
const HUD = { last: {}, annT: 0 };
function setText(id, txt) { if (HUD.last[id] !== txt) { HUD.last[id] = txt; $(id).textContent = txt; } }
function setHTML(id, h) { if (HUD.last['h' + id] !== h) { HUD.last['h' + id] = h; $(id).innerHTML = h; } }
function announce(msg, cls) {
  const box = $('announce'), d = document.createElement('div');
  d.className = 'ann ' + (cls || ''); d.textContent = msg; box.appendChild(d);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => d.remove(), 4600);
}
function touchLabels() {
  const me = GAME.G && GAME.locals[0] ? GAME.G.ents.find(e => e.id === GAME.locals[0].id) : null;
  if (me && me.side === 'm') {
    $('tbA').textContent = t('btn_attack');
    CREATURES.includes(me.creature) && ['tbB', 'tbC', 'tbD'].forEach((id, i) => $(id).textContent = t('ab_' + me.creature + '_' + i));
  } else { $('tbA').textContent = t('btn_action'); $('tbB').textContent = t('btn_item'); $('tbC').textContent = t('btn_lantern'); $('tbD').textContent = t('btn_ability'); }
}
const HOLD_KEYS = new Set(['rescue', 'heal', 'pour', 'search', 'refill', 'msearch']);
function ctxOf(e) {
  if (e.ctx !== undefined && GAME.mode !== 'client') {
    if (!e.ctx) return null;
    return { k: e.ctx.k, ready: e.ctx.ready !== false, item: e.ctx.type };
  }
  if (!e.ctxK) return null;
  return { k: e.ctxK, ready: e.ctxReady !== 0, item: e.ctxItem };
}
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function updateHUD(G, me) {
  // top: dawn + altars
  const left = G.nightLen - G.t;
  $('dawnFill').style.width = Math.min(100, G.t / G.nightLen * 100) + '%';
  setText('dawnTxt', fmtTime(left));
  setHTML('altarRow', G.altars.map(a => `<div class="altarI ${a.lit ? 'lit' : ''}"><span class="pp">${a.lit ? '' : a.oil + '/' + a.need}</span><div class="fl"></div><div class="st"></div></div>`).join(''));
  // team
  const vs = G.ents.filter(e => e.side === 'v');
  setHTML('teamList', vs.map(v => `<div class="tm ${v.state} ${me && v.id === me.id ? 'me' : ''}"><img src="${v.state === 'ghost' ? ART.icon.ghost : ART.icon['role_' + v.role]}" alt="">${escapeHtml(v.name)} · ${t('st_' + (v.state === 'hidden' ? 'hidden' : v.state))}${v.state === 'caged' ? ' ' + Math.ceil(v.cageT) : ''}</div>`).join(''));
  if (!me) { $('vHud').classList.add('hidden'); $('mHud').classList.add('hidden'); $('prompt').classList.remove('on'); setText('bigHint', t('spectating')); return; }
  const isM = me.side === 'm';
  $('vHud').classList.toggle('hidden', isM); $('mHud').classList.toggle('hidden', !isM);
  let hint = '', warn = false;
  if (!isM) {
    $('oilFill').style.width = me.oil + '%';
    $('stamFill').style.width = Math.min(100, me.stamina) + '%';
    setText('lantIcon', ['○', '◐', '●'][lanternRadius(G, me) > 0 ? me.lantern : 0]);
    setText('cansTxt', me.cans > 0 ? '🛢'.repeat(0) + '× ' + me.cans + ' ' + t('it_can') : '');
    const it = $('slotItem');
    const itemKey = me.item || '';
    if (HUD.last.item !== itemKey) { HUD.last.item = itemKey; it.querySelector('img').src = me.item ? ART.icon[me.item] : ''; it.querySelector('img').style.visibility = me.item ? 'visible' : 'hidden'; it.querySelector('.nm').textContent = me.item ? t('it_' + me.item) : ''; }
    it.querySelector('.k').textContent = btnLabel('b');
    const ab = $('slotAb');
    if (HUD.last.role !== me.role + LANG) { HUD.last.role = me.role + LANG; ab.querySelector('img').src = ART.icon['role_' + me.role]; ab.querySelector('.nm').textContent = t('rab_' + me.role); }
    ab.querySelector('.k').textContent = btnLabel('d');
    ab.querySelector('.cd').style.height = (me.abCd > 0 ? Math.min(100, me.abCd / ROLE_CD[me.role] * 100) : 0) + '%';
    if (me.state === 'carried') { hint = t('struggle', { k: btnLabel('a') || t('btn_action') }); warn = true; }
    else if (me.state === 'caged') hint = t('cagedHint', { s: Math.ceil(me.cageT) });
    else if (me.state === 'ghost') hint = t('ghostHint', { k: btnLabel('a') || t('btn_action') });
    else if (me.state === 'hidden') hint = t('hiddenHint');
  } else {
    $('mHp').style.display = G.manifested ? '' : 'none';
    if (G.manifested) setHTML('mHp', `<label>${t('hud_hp')}</label><div class="hearts">${Array.from({ length: me.maxHp }, (_, i) => `<i class="${i < me.hp ? '' : 'off'}"></i>`).join('')}</div>`);
    for (let i = 0; i < 3; i++) {
      const el = $('mAb' + i);
      el.querySelector('.k').textContent = btnLabel(['b', 'c', 'd'][i]);
      el.querySelector('.nm').textContent = t('ab_' + me.creature + '_' + i);
      el.querySelector('.cd').style.height = Math.min(100, (me.cd[i] || 0) / CREATURE_CD[me.creature][i] * 100) + '%';
      if (HUD.last['mi' + i] !== me.creature) { HUD.last['mi' + i] = me.creature; el.style.backgroundImage = `url(${ART.icon['cr_' + me.creature]})`; el.style.backgroundSize = '22px'; el.style.backgroundRepeat = 'no-repeat'; el.style.backgroundPosition = 'center 10px'; el.style.imageRendering = 'pixelated'; }
    }
    if (me.stunT > 0) { hint = '✷ ✷ ✷'; }
  }
  if (INPUT.touch.on) {
    document.body.classList.toggle('monster', isM);
    const cdFrac = isM ? me.cd.map((c, i) => (c || 0) / CREATURE_CD[me.creature][i]) : [0, 0, me.abCd > 0 ? me.abCd / ROLE_CD[me.role] : 0];
    ['b', 'c', 'd'].forEach((k, i) => {
      const el = document.querySelector('.tb[data-tb=' + k + ']');
      const f = Math.min(1, cdFrac[i] || 0);
      el.style.background = f > 0 ? `conic-gradient(rgba(0,0,0,0.65) ${f * 360}deg, rgba(20,16,12,0.55) 0)` : '';
      if (!isM && k === 'b') el.classList.toggle('empty', !me.item);
    });
  }
  setText('bigHint', hint);
  $('bigHint').classList.toggle('warn', warn);
  // context prompt
  const c = ctxOf(me);
  let p = '';
  if (c && (me.side === 'm' || me.state === 'ok' || me.state === 'wounded')) {
    let label;
    if (c.k === 'pick') label = t('ctx_pick', { item: t('it_' + c.item) });
    else if (c.k === 'bell') label = c.ready ? t('ctx_bell', { n: G.bell.uses }) : t('ctx_bellcd');
    else label = t('ctx_' + c.k);
    const k = btnLabel('a');
    if (c.k === 'carry' || c.k === 'tooearly') p = label;
    else p = (k ? `<b>[${k}]</b> ` : '') + (HOLD_KEYS.has(c.k) ? t('hold') + ': ' : '') + escapeHtml(label);
  } else if (me.side === 'v' && me.item && (me.state === 'ok' || me.state === 'wounded')) {
    const k = btnLabel('b'); p = (k ? `<b>[${k}]</b> ` : '') + escapeHtml(t('it_' + me.item)) + ' — ' + escapeHtml(t('itD_' + me.item));
  }
  if (p !== HUD.last.prompt) { HUD.last.prompt = p; $('prompt').innerHTML = p; $('prompt').classList.toggle('on', !!p); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------- end screen ----------------
function showEnd(G) {
  const me = GAME.locals.length ? G.ents.find(e => e.id === GAME.locals[0].id) : null;
  const mySide = me ? me.side : 'v';
  const won = G.winner === mySide;
  $('endTitle').textContent = (won ? t('youWin') : t('youLose')) + ' — ' + t(G.winner === 'v' ? 'win_v' : 'win_m');
  $('endTitle').style.color = won ? '#ffcf6a' : '#ff7060';
  $('endReason').textContent = t('reason_' + G.endReason) + ' ' + t('nightLasted', { t: fmtTime(G.t) });
  const vs = G.ents.filter(e => e.side === 'v');
  let h = `<tr><th></th><th>${t('stat_oil')}</th><th>${t('stat_rescues')}</th><th>${t('stat_heals')}</th><th>${t('stat_stuns')}</th></tr>`;
  for (const v of vs) { const s = v.stats || {}; h += `<tr><td>${escapeHtml(v.name)} · ${t('role_' + v.role)}</td><td>${s.oil || 0}</td><td>${s.rescues || 0}</td><td>${s.heals || 0}</td><td>${s.stuns || 0}</td></tr>`; }
  const m = monster(G); if (m) h += `<tr><td colspan="5">${t('cr_' + m.creature)}${m.ai ? '' : ' · ' + escapeHtml(m.name)}</td></tr>`;
  $('endStats').innerHTML = h;
  const client = GAME.mode === 'client';
  $('btnRematch').style.display = client ? 'none' : '';
  $('btnRematch').textContent = t('rematch');
  $('btnEndMenu').textContent = GAME.mode === 'host' ? t('toLobby') : t('quit');
  show('scrEnd', false);
  if (client) $('endReason').textContent += ' — ' + t('waitingHost');
}
