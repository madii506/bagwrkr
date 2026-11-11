// bagwrkr intro: a time card and a clock run to 09:00, the card gets punched, the shift starts: posts fly into the bag and it fills up,
// payday sprays out of it, then you dive into the bag and land on the floor. All characters on a canvas; sound written in code.
(() => {
  'use strict';
  const el = document.getElementById('intro'), FX = window.ZFX, SND = FX.snd, RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const atHome = location.hash.replace(/^#\/?/, '') === '';
  window.ZI = { active: false };
  if (!el || !atHome || RM) { if (el) el.remove(); return; }
  window.ZI.active = true; document.documentElement.classList.add('pre-app');
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), GL = FX.GLY;
  const rnd = s => s[Math.floor(Math.random() * s.length)], ease = k => 1 - Math.pow(1 - k, 3), eio = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const T = { punch: 1.9, shift: 2.3, pay: 5.6, dive: 6.7, end: 7.9 };
  let W, H, D, fs, cw, ch, cols, rows, t0 = 0, done = false, raf = 0, shake = 0;
  function size() { D = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * D; cv.height = H * D; g.setTransform(D, 0, 0, D, 0, 0); fs = W < 700 ? 8 : clamp(Math.round(W / 128), 9, 13); cw = fs * .6; ch = fs * 1.15; cols = Math.ceil(W / cw); rows = Math.ceil(H / ch); }
  const txt = (s, x, y, a = 1, f = `400 ${fs}px JB, monospace`, col = '240,240,240') => { g.font = f; g.fillStyle = `rgba(${col},${a})`; g.fillText(s, x, y); };
  // ---------------------------------------------------------------- the clock: big seven-segment digits drawn with blocks
  const SEG = { 0: 'abcedf', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  function digit(n, x, y, s, a) { const on = SEG[n] || '', w = s * 3, h = s * 5; g.fillStyle = `rgba(245,245,245,${a})`; const R = (X, Y, ww, hh) => g.fillRect(x + X, y + Y, ww, hh);
    if (on.includes('a')) R(0, 0, w, s * .7); if (on.includes('g')) R(0, h / 2 - s * .35, w, s * .7); if (on.includes('d')) R(0, h - s * .7, w, s * .7);
    if (on.includes('f')) R(0, 0, s * .7, h / 2); if (on.includes('b')) R(w - s * .7, 0, s * .7, h / 2); if (on.includes('e')) R(0, h / 2, s * .7, h / 2); if (on.includes('c')) R(w - s * .7, h / 2, s * .7, h / 2); }
  function clockAt(sec, cx, y, s, a) { const hh = Math.floor(sec / 3600) % 24, mm = Math.floor(sec / 60) % 60, ss = sec % 60, str = [hh, mm, ss].map(v => String(v).padStart(2, '0')).join(':'); let w = 0; for (const c of str) w += c === ':' ? s * 1.6 : s * 4;
    let x = cx - w / 2; for (const c of str) { if (c === ':') { g.fillStyle = `rgba(245,245,245,${a * (sec % 2 ? .4 : 1)})`; g.fillRect(x + s * .4, y + s * 1.3, s * .7, s * .7); g.fillRect(x + s * .4, y + s * 3, s * .7, s * .7); x += s * 1.6; } else { digit(+c, x, y, s, a); x += s * 4; } } }
  // ---------------------------------------------------------------- the time card
  const CARD = ['┌────────────────────────────────────┐', '│  BAGWRKR · TIME CARD               │', '│                                    │', '│  worker     anon                   │', '│  coin       the one you hold       │', '│  pay        by the work you do     │', '│  ────────────────────────────────  │', '│  IN   --:--          OUT   never   │', '└────────────────────────────────────┘'];
  function card(cx, cy, a, punched, k) { const f = Math.min(1.7, Math.max(1, W / 900)), cw2 = cw * f, ch2 = ch * f, w = CARD[0].length * cw2, x0 = cx - w / 2, y0 = cy - CARD.length * ch2 / 2;
    CARD.forEach((l, i) => { let line = l; if (i === 7 && punched) line = l.replace('IN   --:--', 'IN   09:00'); txt(line, x0, y0 + i * ch2, a * (i === 1 ? 1 : .8), `${i === 1 ? 700 : 400} ${fs * f}px JB, monospace`); });
    if (punched) { const sx = x0 + 6 * cw2, sy = y0 + 7 * ch2, st = clamp(k, 0, 1), sc = (1 + (1 - ease(st)) * 2.2) * f; g.save(); g.translate(sx + 5 * cw2, sy + ch2 / 2); g.rotate(-.12); g.scale(sc, sc); g.strokeStyle = `rgba(255,255,255,${a * st})`; g.lineWidth = 1.6;
      g.strokeRect(-7 * cw, -ch * 1.1, 14 * cw, ch * 2.2); g.font = `700 ${fs * 1.25}px JB, monospace`; g.fillStyle = `rgba(255,255,255,${a * st})`; g.textAlign = 'center'; g.fillText('CLOCKED IN', 0, -ch * .55); g.textAlign = 'left'; g.restore(); } }
  // ---------------------------------------------------------------- the shift: posts fly into the bag
  const POSTS = ['gm. $BAG is the one', 'send it', 'ca in bio', 'we are so early', 'chart looks clean', 'raid in 5', 'thread 🧵 1/7', 'who is not holding this', 'bagworkers eat first', '↻ 41  ♥ 212', 'clocked in', 'this is my job now', 'cto energy', 'lfg', 'we ride at dawn', 'quote this', 'reply guy duty', 'shill shift: on'];
  let flyers = [], pts = 0, lastFly = 0, sprays = [];
  const bagPos = () => ({ x: W / 2, y: H * .47 });
  function fly(now) { const side = Math.random() < .5 ? -1 : 1, b = bagPos(); flyers.push({ s: rnd(POSTS), x: b.x + side * (W * .55 + Math.random() * W * .1), y: H * (.12 + Math.random() * .76), born: now, life: 900 + Math.random() * 600, side }); }
  // ---------------------------------------------------------------- one frame
  let punched = false, shifted = false, paid = false, dove = false, lastTick = 0, lastSec = -1, frozen = [], focus = null;
  function frame(now) { if (done) return; raf = requestAnimationFrame(frame); if (!t0) t0 = now; const t = (now - t0) / 1000;
    g.setTransform(D, 0, 0, D, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.textBaseline = 'top';
    if (shake > 0) { g.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= .86; if (shake < .3) shake = 0; }
    const b = bagPos();
    // 1. the clock runs to 09:00 and the card waits
    if (t < T.shift) { const k = clamp(t / T.punch, 0, 1), sec = 8 * 3600 + 59 * 60 + 52 + Math.min(8, Math.floor(ease(k) * 8)), s = Math.max(5, Math.min(W / 48, 15)), a = clamp(t / .5, 0, 1);
      if (sec !== lastSec) { lastSec = sec; SND.tick(.05, sec % 2 ? 2400 : 1800); }
      clockAt(sec, W / 2, H * .2, s, a * (t > T.punch ? 1 - clamp((t - T.punch) / .4, 0, 1) * .6 : 1));
      const rise = ease(clamp(t / .9, 0, 1)); card(W / 2, H * .6 + (1 - rise) * 60, a, t >= T.punch, (t - T.punch) / .22);
      if (!punched && t >= T.punch) { punched = true; shake = 14; SND.thump(.45); SND.blip(220, .08); }
      if (t > T.punch) { const fl = 1 - clamp((t - T.punch) / .25, 0, 1); g.fillStyle = `rgba(255,255,255,${fl * .12})`; g.fillRect(0, 0, W, H); }
      return; }
    // 2. the shift: the bag turns, posts fly in, the bag fills
    if (!shifted) { shifted = true; SND.whoosh(1.2, .09, true); SND.droneLevel(.1, 1.2); }
    const ks = clamp((t - T.shift) / (T.pay - T.shift), 0, 1), fill = .84 + .24 * eio(ks), turn = Math.sin(t * .9) * .55, intro = ease(clamp((t - T.shift) / .6, 0, 1));
    const scale = (W < 700 ? .55 : .62) * (.6 + .4 * intro) * (t > T.pay ? 1 + Math.sin(clamp((t - T.pay) / .35, 0, 1) * Math.PI) * .08 : 1);
    if (t < T.dive) { const gcols = Math.ceil(W / cw), grows = Math.ceil(H / ch), Bg = FX.bag3d(gcols, grows, turn, -.3, { scale, aspect: ch / cw, fill, cx: b.x / cw, cy: b.y / ch });
      g.font = `400 ${fs}px JB, monospace`; for (let L = 1; L <= 6; L++) { const lo = (L - 1) / 6, hi = L / 6; g.fillStyle = `rgba(240,240,240,${(.3 + hi * .62).toFixed(2)})`; for (let j = 0; j < Bg.out.length; j++) { const v = Bg.lum[j]; if (v <= lo || v > hi || v > 1) continue; g.fillText(Bg.out[j], (j % gcols) * cw, Math.floor(j / gcols) * ch); } }
      g.fillStyle = '#fff'; g.font = `700 ${fs}px JB, monospace`; for (let j = 0; j < Bg.out.length; j++) if (Bg.lum[j] > 1) g.fillText('@', (j % gcols) * cw, Math.floor(j / gcols) * ch); }
    if (t < T.pay) { if (now - lastFly > 140 - ks * 90) { lastFly = now; fly(now); }
      flyers = flyers.filter(f => { const k = (now - f.born) / f.life; if (k >= 1) { pts += 12 + Math.floor(Math.random() * 60); SND.tick(.03, 3000 + Math.random() * 3000); return false; } const e = eio(k), x = f.x + (b.x - f.x) * e, y = f.y + (b.y - f.y) * e;
        const a = Math.min(1, k * 3) * (1 - Math.max(0, (k - .8) / .2)); txt(k > .82 ? f.s.split('').map(c => c === ' ' ? ' ' : rnd(GL)).join('') : f.s, x - f.s.length * cw * .58, y, a * .85, `400 ${fs * 1.15}px JB, monospace`); return true; });
      const lab = 'work ' + pts.toLocaleString('en-US') + ' pts'; txt(lab, W / 2 - lab.length * cw * .7, H * .86, intro * .9, `600 ${fs * 1.4}px JB, monospace`); }
    // 3. payday: the bag throws money
    if (t >= T.pay && t < T.dive) { if (!paid) { paid = true; SND.thump(.35); SND.chime(); for (let i = 0; i < 160; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.6, v = 4 + Math.random() * 9; sprays.push({ x: b.x, y: b.y - 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: rnd('$$$$¢+*'), l: 1 }); } }
      sprays.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .35; p.l -= .012; if (p.l > 0) txt(p.c, p.x, p.y, p.l, `700 ${fs * 1.3}px JB, monospace`); });
      const line = 'work your bag. get paid for it.', k2 = clamp((t - T.pay - .15) / .6, 0, 1), n = Math.floor(line.length * k2); txt(line.slice(0, n) + (k2 < 1 ? '▌' : ''), W / 2 - line.length * cw * .65, H * .84, 1, `500 ${fs * 1.3}px JB, monospace`); }
    // 4. the dive: into the $
    if (t >= T.dive) { if (!dove) { dove = true; SND.whoosh(1.1, .16, true); const gcols = Math.ceil(W / cw), grows = Math.ceil(H / ch), Bg = FX.bag3d(gcols, grows, 0, -.3, { scale: W < 700 ? .55 : .62, aspect: ch / cw, fill: 1.08, cx: b.x / cw, cy: b.y / ch }); frozen = []; let sx = 0, sy = 0, n = 0;
        for (let j = 0; j < Bg.out.length; j++) { const v = Bg.lum[j]; if (!v) continue; const x = (j % gcols) * cw, y = Math.floor(j / gcols) * ch; frozen.push({ c: v > 1 ? '@' : Bg.out[j], x, y, v }); if (v > 1) { sx += x; sy += y; n++; } } focus = n ? { x: sx / n, y: sy / n } : { x: b.x, y: b.y }; }
      const k = clamp((t - T.dive) / (T.end - T.dive), 0, 1), z = Math.exp(eio(k) * 3.6), sizes = {};
      for (const p of frozen) { const x = focus.x + (p.x - focus.x) * z, y = focus.y + (p.y - focus.y) * z; if (x < -200 || y < -200 || x > W + 200 || y > H + 200) continue; const s = Math.min(180, Math.round(fs * Math.min(z, 12))); (sizes[s] = sizes[s] || []).push([p, x, y]); }
      for (const s in sizes) { g.font = `${s > fs * 3 ? 700 : 400} ${s}px JB, monospace`; for (const [p, x, y] of sizes[s]) { g.fillStyle = p.v > 1 ? `rgba(255,255,255,${1 - k * .4})` : `rgba(240,240,240,${((.3 + p.v * .6) * (1 - k * .6)).toFixed(3)})`; g.fillText(p.c, x, y); } }
      if (k > .62) { g.fillStyle = `rgba(0,0,0,${((k - .62) / .38).toFixed(3)})`; g.fillRect(-20, -20, W + 40, H + 40); }
      if (k >= 1) finish(); }
    g.setTransform(D, 0, 0, D, 0, 0); const kb = clamp(t / T.end, 0, 1); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, H - 1, W, 1); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(0, H - 1, W * kb, 1); }
  // ---------------------------------------------------------------- out, and onto the floor
  let S3 = null;
  function finish(skipped) { if (done) return; done = true; cancelAnimationFrame(raf); if (S3) S3.stop(); if (!skipped) SND.thump(.5); setTimeout(() => SND.chime(), skipped ? 0 : 120);
    SND.droneLevel(.035, 3); document.documentElement.classList.remove('pre-app'); window.ZI.active = false; if (window.ZI.onDone) window.ZI.onDone();
    el.classList.add('out'); setTimeout(() => el.remove(), 800); removeEventListener('keydown', key); }
  const key = e => { if (['Enter', 'Escape', ' '].includes(e.key)) { e.preventDefault(); SND.whoosh(.5, .1, true); finish(true); } };
  const paintSnd = () => { const b = el.querySelector('.snd'); if (b) b.textContent = SND.on ? 'sound on' : 'sound off'; };
  el.querySelector('.skip').onclick = e => { e.stopPropagation(); SND.wake(); finish(true); };
  el.querySelector('.snd').onclick = e => { e.stopPropagation(); SND.set(!SND.on); if (SND.on) SND.droneOn(.07); paintSnd(); };
  el.addEventListener('pointerdown', () => { SND.wake(); if (SND.on) SND.droneOn(.07); });
  addEventListener('keydown', key); addEventListener('resize', () => { if (!done) size(); });
  document.addEventListener('z-audio', () => { if (SND.on && !done) SND.droneOn(.07); });
  paintSnd(); size(); if (SND.on) { SND.wake(); SND.droneOn(.07); }
  // the 3D intro (a worker sits down at the PC) when the browser has WebGL; the ASCII one above when it doesn't
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (gl && !window.__no3d) { cv.style.display = 'none'; import('/assets/intro3d.js?v=b2').then(m => { if (done) return; S3 = m.run({ host: el, FX, SND, done: () => finish() }); }).catch(() => { cv.style.display = ''; raf = requestAnimationFrame(frame); }); }
  else raf = requestAnimationFrame(frame);
})();
