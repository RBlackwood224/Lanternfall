'use strict';
// ===== Keyboard, gamepads and touch =====
const INPUT = { keys: {}, latch: {}, padPrev: {}, touch: { on: false, stick: null, held: {} }, kbUsed: false, lastDevice: 'kb' };
const KEYMAP = {
  // physical key codes: on AZERTY keyboards these are Z/Q/S/D automatically
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'], a: ['KeyE', 'Space', 'Enter'], b: ['KeyQ'], c: ['KeyF'], d: ['KeyR'],
};
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  INPUT.keys[e.code] = true; INPUT.latch[e.code] = true; INPUT.lastDevice = 'kb';
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (typeof onGlobalKey === 'function') onGlobalKey(e);
});
window.addEventListener('keyup', e => { INPUT.keys[e.code] = false; });
window.addEventListener('blur', () => { INPUT.keys = {}; });
const keyDown = (name) => KEYMAP[name].some(k => INPUT.keys[k] || INPUT.latch[k]);

function padList() { const ps = navigator.getGamepads ? navigator.getGamepads() : []; return Array.from(ps || []).filter(p => p && p.connected); }
function padByIndex(i) { const ps = navigator.getGamepads ? navigator.getGamepads() : []; return ps && ps[i] && ps[i].connected ? ps[i] : null; }
const PB = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const btn = (p, i) => !!(p && p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));

// raw device state
function readDevice(dev) {
  const r = { mx: 0, my: 0, sprint: false, a: false, b: false, c: false, d: false, ping: 0, pause: false };
  if (dev === 'any') {
    // single player: keyboard, every controller and touch all drive the same character
    const devs = ['kb', 'touch'].concat(padList().map(p => 'pad' + p.index));
    for (const d of devs) {
      const s = readDevice(d);
      if (Math.hypot(s.mx, s.my) > Math.hypot(r.mx, r.my)) { r.mx = s.mx; r.my = s.my; if (d.startsWith('pad') && Math.hypot(s.mx, s.my) > 0.3) INPUT.lastDevice = 'pad'; }
      for (const k of ['sprint', 'a', 'b', 'c', 'd', 'pause']) if (s[k]) { r[k] = true; if (d.startsWith('pad')) INPUT.lastDevice = 'pad'; }
      if (s.ping && !r.ping) r.ping = s.ping;
    }
    return r;
  }
  if (dev === 'kb') {
    r.mx = (keyDown('right') ? 1 : 0) - (keyDown('left') ? 1 : 0);
    r.my = (keyDown('down') ? 1 : 0) - (keyDown('up') ? 1 : 0);
    r.sprint = keyDown('sprint'); r.a = keyDown('a'); r.b = keyDown('b'); r.c = keyDown('c'); r.d = keyDown('d');
    for (let i = 1; i <= 4; i++) if (INPUT.keys['Digit' + i] || INPUT.latch['Digit' + i]) r.ping = i;
  } else if (dev === 'touch') {
    const T = INPUT.touch;
    if (T.stick) { const dx = T.stick.x - T.stick.ox, dy = T.stick.y - T.stick.oy, l = Math.hypot(dx, dy), R0 = 46; if (l > 6) { r.mx = dx / Math.max(l, R0); r.my = dy / Math.max(l, R0); } }
    r.sprint = !!T.held.sprint || (T.stick && Math.hypot(T.stick.x - T.stick.ox, T.stick.y - T.stick.oy) > 70);
    r.a = !!T.held.a; r.b = !!T.held.b; r.c = !!T.held.c; r.d = !!T.held.d; r.ping = T.ping || 0;
  } else if (dev && dev.startsWith('pad')) {
    const p = padByIndex(+dev.slice(3)); if (!p) return r;
    let x = p.axes[0] || 0, y = p.axes[1] || 0;
    if (Math.hypot(x, y) < 0.22) { x = 0; y = 0; }
    r.mx = x; r.my = y;
    r.sprint = btn(p, PB.RT) || btn(p, PB.LT) || btn(p, PB.RB) || btn(p, PB.LB);
    r.a = btn(p, PB.A); r.b = btn(p, PB.X); r.c = btn(p, PB.Y); r.d = btn(p, PB.B);
    if (btn(p, PB.UP)) r.ping = 1; else if (btn(p, PB.RIGHT)) r.ping = 2; else if (btn(p, PB.DOWN)) r.ping = 3; else if (btn(p, PB.LEFT)) r.ping = 4;
    r.pause = btn(p, PB.START);
  }
  return r;
}

// converts raw device state into the sim input (press counters for edges)
class Controller {
  constructor(dev) { this.dev = dev; this.prev = {}; this.inp = blankInput(); }
  poll() {
    const r = readDevice(this.dev), p = this.prev, inp = this.inp;
    inp.mx = r.mx; inp.my = r.my; inp.sprint = r.sprint; inp.aHeld = r.a;
    for (const k of ['a', 'b', 'c', 'd']) if (r[k] && !p[k]) inp[k]++;
    if (r.ping && r.ping !== p.ping) { inp.ping = r.ping; inp.pingN++; }
    this.pausePressed = r.pause && !p.pause;
    this.prev = r;
    if (this.dev === 'touch' || this.dev === 'any') INPUT.touch.ping = 0;
    if (this.dev === 'kb' || this.dev === 'any') INPUT.latch = {};
    return inp;
  }
}

// which device pressed a "join" button just now (couch join screen)
function anyJoinPress() {
  const out = [];
  if (INPUT.latch.Space || INPUT.latch.Enter || INPUT.latch.KeyE) out.push('kb');
  delete INPUT.latch.Space; delete INPUT.latch.Enter; delete INPUT.latch.KeyE;
  for (const p of padList()) {
    const k = 'pad' + p.index, now = btn(p, PB.A) || btn(p, PB.START);
    if (now && !INPUT.padPrev['j' + k]) out.push(k);
    INPUT.padPrev['j' + k] = now;
  }
  return out;
}

// ---- gamepad menu navigation ----
let navRepeat = 0;
function pollMenuPads(dt) {
  navRepeat -= dt;
  for (const p of padList()) {
    const k = 'm' + p.index, pr = INPUT.padPrev[k] || {};
    const st = { up: btn(p, PB.UP) || p.axes[1] < -0.6, down: btn(p, PB.DOWN) || p.axes[1] > 0.6, left: btn(p, PB.LEFT) || p.axes[0] < -0.6, right: btn(p, PB.RIGHT) || p.axes[0] > 0.6, a: btn(p, PB.A), b: btn(p, PB.B), start: btn(p, PB.START) };
    for (const d of ['up', 'down', 'left', 'right']) {
      if (st[d] && (!pr[d] || navRepeat <= 0)) { menuMove(d); navRepeat = pr[d] ? 0.12 : 0.35; INPUT.lastDevice = 'pad'; }
    }
    if (st.a && !pr.a) { menuActivate(); INPUT.lastDevice = 'pad'; }
    if (st.b && !pr.b) menuBack();
    if (st.start && !pr.start && typeof onPadStart === 'function') onPadStart();
    INPUT.padPrev[k] = st;
  }
}
function focusables() {
  const scr = document.querySelector('.screen.active');
  if (!scr) return [];
  return Array.from(scr.querySelectorAll('button:not([disabled]), select, input, [data-nav]')).filter(el => el.offsetParent !== null);
}
function menuMove(dir) {
  const els = focusables(); if (!els.length) return;
  const cur = document.activeElement;
  if (!els.includes(cur)) { els[0].focus(); return; }
  if (cur.tagName === 'SELECT' && (dir === 'left' || dir === 'right')) {
    const i = cur.selectedIndex + (dir === 'right' ? 1 : -1);
    if (i >= 0 && i < cur.options.length) { cur.selectedIndex = i; cur.dispatchEvent(new Event('change')); }
    return;
  }
  if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
    cur.value = +cur.value + (dir === 'right' ? 1 : -1) * (+cur.step || 1); cur.dispatchEvent(new Event('input')); return;
  }
  const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bs = 1e9;
  for (const el of els) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, dx = x - cx, dy = y - cy;
    let ok = dir === 'up' ? dy < -4 : dir === 'down' ? dy > 4 : dir === 'left' ? dx < -4 : dx > 4;
    if (!ok) continue;
    const s = (dir === 'up' || dir === 'down') ? Math.abs(dy) + Math.abs(dx) * 2.5 : Math.abs(dx) + Math.abs(dy) * 2.5;
    if (s < bs) { bs = s; best = el; }
  }
  if (best) { best.focus(); SFX.click && SND.ctx && SFX.click(); }
}
function menuActivate() {
  const el = document.activeElement;
  if (el && (el.tagName === 'BUTTON' || el.dataset.nav !== undefined)) el.click();
  else { const els = focusables(); if (els[0]) els[0].focus(); }
}

// ---- touch controls ----
function initTouch() {
  const zone = document.getElementById('touchStick'), knob = document.getElementById('stickKnob'), base = document.getElementById('stickBase');
  const T = INPUT.touch;
  const show = () => { if (!T.on) { T.on = true; document.body.classList.add('touch'); } };
  window.addEventListener('touchstart', () => { show(); INPUT.lastDevice = 'touch'; }, { passive: true });
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    const tt = e.changedTouches[0];
    T.stick = { id: tt.identifier, ox: tt.clientX, oy: tt.clientY, x: tt.clientX, y: tt.clientY };
    base.style.display = 'block'; base.style.left = tt.clientX + 'px'; base.style.top = tt.clientY + 'px';
    knob.style.left = tt.clientX + 'px'; knob.style.top = tt.clientY + 'px';
  }, { passive: false });
  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const tt of e.changedTouches) if (T.stick && tt.identifier === T.stick.id) {
      T.stick.x = tt.clientX; T.stick.y = tt.clientY;
      const dx = tt.clientX - T.stick.ox, dy = tt.clientY - T.stick.oy, l = Math.hypot(dx, dy), m = Math.min(l, 56);
      knob.style.left = (T.stick.ox + (l ? dx / l * m : 0)) + 'px'; knob.style.top = (T.stick.oy + (l ? dy / l * m : 0)) + 'px';
    }
  }, { passive: false });
  const end = e => { for (const tt of e.changedTouches) if (T.stick && tt.identifier === T.stick.id) { T.stick = null; base.style.display = 'none'; knob.style.left = '-200px'; } };
  zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
  document.querySelectorAll('[data-tb]').forEach(el => {
    const k = el.dataset.tb;
    el.addEventListener('touchstart', e => { e.preventDefault(); T.held[k] = true; el.classList.add('down'); if (k === 'ping') document.getElementById('pingWheel').classList.toggle('open'); }, { passive: false });
    const up = e => { e.preventDefault(); T.held[k] = false; el.classList.remove('down'); };
    el.addEventListener('touchend', up, { passive: false }); el.addEventListener('touchcancel', up, { passive: false });
  });
  document.querySelectorAll('[data-pw]').forEach(el => {
    el.addEventListener('touchstart', e => { e.preventDefault(); T.ping = +el.dataset.pw; document.getElementById('pingWheel').classList.remove('open'); }, { passive: false });
    el.addEventListener('click', () => { T.ping = +el.dataset.pw; document.getElementById('pingWheel').classList.remove('open'); });
  });
}
