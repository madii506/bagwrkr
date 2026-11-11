// bagwrkr intro, in 3D and without a word: a dark room at night, a worker in a hard hat walks in, pulls out the chair and sits down,
// the monitor wakes up and boots the floor (the bag fills, the work bars climb), and the camera pushes over his shoulder into the screen.
import * as THREE from './vendor/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { EffectComposer } from './vendor/EffectComposer.js';
import { RenderPass } from './vendor/RenderPass.js';
import { UnrealBloomPass } from './vendor/UnrealBloomPass.js';
import { OutputPass } from './vendor/OutputPass.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), mix = (a, b, k) => a + (b - a) * k;
const eio = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, eout = k => 1 - Math.pow(1 - k, 3), span = (t, a, b) => clamp((t - a) / (b - a));
const T = { walk: [0.5, 3.2], turn: [3.0, 3.6], sit: [3.5, 4.5], power: 4.7, boot: [4.9, 7.0], push: [6.6, 8.6], end: 8.7 };

export function run({ host, FX, SND, done }) {
  const mobile = innerWidth < 700, W0 = innerWidth, H0 = innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.75)); renderer.setSize(W0, H0); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.domElement.className = 'i3d'; host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000); scene.fog = new THREE.FogExp2(0x000000, .085);
  const cam = new THREE.PerspectiveCamera(mobile ? 58 : 42, W0 / H0, .05, 60);
  const M = (c, r = .75, m = .05, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
  const add = (geo, mat, x, y, z, parent = scene, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };

  // ---------------------------------------------------------------- the room
  add(new THREE.PlaneGeometry(30, 30), M(0x0b0b0b, .55, .25), 0, 0, 0, scene, false).rotation.x = -Math.PI / 2;
  add(new THREE.PlaneGeometry(14, 6), M(0x090909, .9), 0, 3, -1.75, scene, false);
  add(new THREE.PlaneGeometry(14, 6), M(0x080808, .9), 3.2, 3, 2, scene, false).rotation.y = -Math.PI / 2;
  // a window onto a city at night, the only light before the screen comes on
  const city = document.createElement('canvas'); city.width = 512; city.height = 340; { const g = city.getContext('2d'); const sky = g.createLinearGradient(0, 0, 0, 340); sky.addColorStop(0, '#05070c'); sky.addColorStop(1, '#0d1018'); g.fillStyle = sky; g.fillRect(0, 0, 512, 340);
    for (let i = 0; i < 26; i++) { const w = 18 + Math.random() * 42, h = 60 + Math.random() * 220, x = Math.random() * 512; g.fillStyle = '#07080b'; g.fillRect(x, 340 - h, w, h); for (let k = 0; k < h / 9; k++) for (let j = 0; j < w / 7; j++) if (Math.random() < .23) { g.fillStyle = `rgba(255,${210 + Math.random() * 40 | 0},${150 + Math.random() * 80 | 0},${.35 + Math.random() * .6})`; g.fillRect(x + 2 + j * 7, 340 - h + 4 + k * 9, 3, 4); } } }
  const cityT = new THREE.CanvasTexture(city); cityT.colorSpace = THREE.SRGBColorSpace;
  const win = add(new THREE.PlaneGeometry(1.9, 1.25), new THREE.MeshBasicMaterial({ map: cityT, toneMapped: false, color: 0x8c8c8c }), -1.9, 1.75, -1.73, scene, false);
  for (const [w, h, x, y] of [[2, .05, -1.9, 2.4], [2, .05, -1.9, 1.1], [.05, 1.3, -2.87, 1.75], [.05, 1.3, -.93, 1.75], [.04, 1.3, -1.9, 1.75]]) add(new THREE.BoxGeometry(w, h, .06), M(0x161616, .7), x, y, -1.71);

  // ---------------------------------------------------------------- the desk, the monitor, the keyboard, a lamp, and a bag in a hard hat
  const deskM = M(0x151515, .45, .2);
  add(new RoundedBoxGeometry(1.9, .05, .8, 3, .015), deskM, 0, .75, -1.05);
  for (const x of [-.88, .88]) add(new THREE.BoxGeometry(.04, .73, .72), M(0x101010, .6), x, .365, -1.05);
  const mon = new THREE.Group(); mon.position.set(0, 0, -1.25); scene.add(mon);
  add(new THREE.BoxGeometry(.24, .015, .17), M(0x1a1a1a, .4, .4), 0, .785, 0, mon); add(new THREE.CylinderGeometry(.018, .022, .32, 16), M(0x1d1d1d, .35, .6), 0, .94, 0, mon);
  add(new RoundedBoxGeometry(1.12, .66, .035, 3, .012), M(0x0e0e0e, .4, .3), 0, 1.16, .03, mon);
  const SW = 1024, SH = 600, scr = document.createElement('canvas'); scr.width = SW; scr.height = SH; const sg = scr.getContext('2d'); sg.fillStyle = '#000'; sg.fillRect(0, 0, SW, SH);
  const scrT = new THREE.CanvasTexture(scr); scrT.colorSpace = THREE.SRGBColorSpace; scrT.anisotropy = 8;
  const screen = add(new THREE.PlaneGeometry(1.07, .61), new THREE.MeshBasicMaterial({ map: scrT, toneMapped: false }), 0, 1.16, .049, mon, false);
  const led = add(new THREE.SphereGeometry(.005, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5040, toneMapped: false }), .5, .845, .05, mon, false);
  const kb = add(new RoundedBoxGeometry(.46, .018, .15, 2, .006), M(0x131313, .5, .2), 0, .785, -.82);
  const keysC = document.createElement('canvas'); keysC.width = 256; keysC.height = 84; const kg = keysC.getContext('2d'); const keysT = new THREE.CanvasTexture(keysC);
  const keyTop = add(new THREE.PlaneGeometry(.44, .135), new THREE.MeshBasicMaterial({ map: keysT, transparent: true, toneMapped: false }), 0, .7951, -.82, scene, false); keyTop.rotation.x = -Math.PI / 2;
  const drawKeys = lit => { kg.clearRect(0, 0, 256, 84); for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) { const on = lit && Math.random() < .06; kg.fillStyle = on ? 'rgba(255,255,255,.9)' : 'rgba(40,40,40,.95)'; kg.fillRect(4 + c * 16.6, 4 + r * 16, 13.5, 12.5); } keysT.needsUpdate = true; }; drawKeys(false);
  add(new RoundedBoxGeometry(.06, .02, .1, 2, .008), M(0x161616, .4, .2), .38, .785, -.8);
  // the lamp
  const lamp = new THREE.Group(); lamp.position.set(-.82, .775, -1.32); scene.add(lamp); const lm = M(0x1c1c1c, .35, .7);
  add(new THREE.CylinderGeometry(.08, .09, .02, 24), lm, 0, 0, 0, lamp); add(new THREE.CylinderGeometry(.009, .009, .5, 8), lm, 0, .25, 0, lamp);
  const head = add(new THREE.ConeGeometry(.075, .13, 24, 1, true), M(0x1c1c1c, .4, .6, { side: THREE.DoubleSide }), .06, .5, .04, lamp); head.rotation.z = .9; head.rotation.x = -.4;
  const bulb = add(new THREE.SphereGeometry(.024, 12, 12), new THREE.MeshBasicMaterial({ color: 0x222222, toneMapped: false }), .09, .47, .06, lamp, false);
  const lampL = new THREE.SpotLight(0xfff0dc, 0, 3.2, .75, .7, 2); lampL.position.set(-.7, 1.22, -1.22); lampL.target.position.set(-.25, .75, -.85); lampL.castShadow = !mobile; lampL.shadow.mapSize.set(1024, 1024); scene.add(lampL, lampL.target);
  // the bag on the desk, in its hard hat
  const bag = new THREE.Group(); bag.position.set(.66, .775, -1.05); bag.rotation.y = -.5; scene.add(bag); const bm = M(0x9a9a9a, .9);
  add(new THREE.SphereGeometry(.085, 24, 18), bm, 0, .08, 0, bag).scale.set(1, .95, 1); add(new THREE.CylinderGeometry(.028, .045, .05, 18), bm, 0, .17, 0, bag); add(new THREE.CylinderGeometry(.05, .03, .03, 18), bm, 0, .2, 0, bag);
  add(new THREE.SphereGeometry(.052, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0xb0b0b0, .5), 0, .215, 0, bag); add(new THREE.CylinderGeometry(.075, .075, .006, 24), M(0xb0b0b0, .5), 0, .215, 0, bag);
  const dollar = document.createElement('canvas'); dollar.width = dollar.height = 64; { const g = dollar.getContext('2d'); g.fillStyle = '#111'; g.font = '700 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 32, 34); }
  const dm = add(new THREE.PlaneGeometry(.07, .07), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(dollar), transparent: true }), 0, .075, .086, bag, false);

  // ---------------------------------------------------------------- the chair
  const chair = new THREE.Group(); chair.position.set(.25, 0, .45); chair.rotation.y = .5; scene.add(chair); const cm = M(0x121212, .55, .15);
  for (let i = 0; i < 5; i++) { const leg = add(new THREE.BoxGeometry(.035, .03, .3), cm, 0, .07, 0, chair); leg.rotation.y = i / 5 * Math.PI * 2; leg.translateZ(.15); add(new THREE.SphereGeometry(.025, 10, 8), cm, Math.sin(i / 5 * Math.PI * 2) * .29, .03, Math.cos(i / 5 * Math.PI * 2) * .29, chair); }
  add(new THREE.CylinderGeometry(.025, .03, .36, 14), M(0x1a1a1a, .3, .7), 0, .26, 0, chair);
  add(new RoundedBoxGeometry(.5, .08, .48, 3, .03), cm, 0, .47, 0, chair);
  const back = add(new RoundedBoxGeometry(.46, .58, .06, 3, .03), cm, 0, .86, .24, chair); back.rotation.x = -.12;

  // ---------------------------------------------------------------- the worker: a mannequin in a hard hat, faces -z
  const body = M(0x2c2c2c, .8, .05), hatM = M(0xe6e6e6, .45, .05);
  const man = new THREE.Group(); scene.add(man); const hips = new THREE.Group(); man.add(hips);
  add(new RoundedBoxGeometry(.32, .14, .18, 3, .05), body, 0, 0, 0, hips);
  const torso = new THREE.Group(); hips.add(torso); add(new THREE.CapsuleGeometry(.16, .3, 6, 16), body, 0, .3, 0, torso).scale.set(1.15, 1, .75);
  const headG = new THREE.Group(); headG.position.set(0, .63, 0); torso.add(headG); add(new THREE.CylinderGeometry(.045, .05, .08, 12), body, 0, -.06, 0, headG); add(new THREE.SphereGeometry(.105, 20, 16), body, 0, .06, 0, headG);
  add(new THREE.SphereGeometry(.118, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, .1, 0, headG); const brim = add(new THREE.CylinderGeometry(.165, .165, .012, 28), hatM, 0, .1, -.02, headG); brim.scale.set(1, 1, 1.12);
  add(new THREE.BoxGeometry(.02, .02, .2), hatM, 0, .215, 0, headG);
  const limb = (parent, x, y, r1, l1, r2, l2) => { const s = new THREE.Group(); s.position.set(x, y, 0); parent.add(s); add(new THREE.CapsuleGeometry(r1, l1, 4, 12), body, 0, -l1 / 2 - r1 * .6, 0, s);
    const j = new THREE.Group(); j.position.set(0, -l1 - r1 * 1.2, 0); s.add(j); add(new THREE.CapsuleGeometry(r2, l2, 4, 12), body, 0, -l2 / 2 - r2 * .6, 0, j); return [s, j]; };
  const [shL, elL] = limb(torso, -.215, .5, .048, .24, .042, .22), [shR, elR] = limb(torso, .215, .5, .048, .24, .042, .22);
  const [hipL, knL] = limb(hips, -.095, -.04, .07, .34, .056, .36), [hipR, knR] = limb(hips, .095, -.04, .07, .34, .056, .36);
  for (const k of [knL, knR]) add(new RoundedBoxGeometry(.1, .06, .2, 2, .02), body, 0, -.45, -.05, k);
  // poses: stand (walking) and sit (hands on the keyboard)
  const pose = (walk, sit, typing, t) => { const w = Math.sin(walk), stand = 1 - sit;
    hips.position.set(0, mix(.93, .56, eio(sit)) + Math.abs(Math.cos(walk)) * .02 * stand, mix(0, .07, sit));
    hipL.rotation.x = mix(w * .45, 1.5, sit); hipR.rotation.x = mix(-w * .45, 1.5, sit); knL.rotation.x = mix(-Math.max(0, -w) * .7, -1.55, sit); knR.rotation.x = mix(-Math.max(0, w) * .7, -1.55, sit);
    shL.rotation.x = mix(-w * .35, 1.05 + Math.sin(t * 19) * .03 * typing, sit); shR.rotation.x = mix(w * .35, 1.05 + Math.sin(t * 17 + 1) * .03 * typing, sit); shL.rotation.z = mix(.06, .03, sit); shR.rotation.z = mix(-.06, -.03, sit);
    elL.rotation.x = mix(.15, .55, sit); elR.rotation.x = mix(.15, .55, sit); torso.rotation.x = mix(.02, -.1, sit); headG.rotation.x = mix(0, .1, sit); };

  // ---------------------------------------------------------------- light
  scene.add(new THREE.AmbientLight(0xffffff, .09)); const back2 = new THREE.DirectionalLight(0xb8c8ff, .55); back2.position.set(2.5, 2.4, -2.5); scene.add(back2);
  const moon = new THREE.DirectionalLight(0x8fa3c4, .7); moon.position.set(-3, 3.2, -2.6); moon.target.position.set(.3, 0, .3); moon.castShadow = !mobile; moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 }); scene.add(moon, moon.target);
  const glow = new THREE.PointLight(0xdfe8ff, 0, 4.5, 2); glow.position.set(0, 1.18, -.9); scene.add(glow);
  const rim = new THREE.PointLight(0xffffff, 0, 6, 2); rim.position.set(.9, 1.9, 1.6); scene.add(rim);

  // ---------------------------------------------------------------- the screen: it powers on and boots the floor
  let bootPts = 0; const bars = Array.from({ length: 9 }, () => ({ v: 0, to: .2 + Math.random() * .8 })), dots = [];
  function drawScreen(t) { const k = span(t, T.power, T.power + .3), b = span(t, T.boot[0], T.boot[1]); sg.globalAlpha = 1; sg.fillStyle = '#000'; sg.fillRect(0, 0, SW, SH);
    if (t < T.power) { sg.fillStyle = 'rgba(255,255,255,.02)'; sg.fillRect(0, 0, SW, SH); scrT.needsUpdate = true; return; }
    if (k < 1) { const h = Math.max(2, SH * eout(k) * .9), w = SW * Math.min(1, k * 3); sg.fillStyle = '#fff'; sg.fillRect((SW - w) / 2, (SH - h) / 2, w, Math.max(2, h * (1 - k) + 2)); scrT.needsUpdate = true; return; }
    // the floor booting: a top bar, the bag on the left filling up, work bars on the right, a ticker of dots at the bottom
    sg.fillStyle = 'rgba(255,255,255,.08)'; sg.fillRect(0, 40, SW, 1); sg.fillRect(0, SH - 40, SW, 1); sg.fillStyle = '#fff'; sg.fillRect(28, 16, 12, 12); for (let i = 0; i < 6; i++) { sg.fillStyle = i === 0 ? '#fff' : 'rgba(255,255,255,.25)'; sg.fillRect(70 + i * 70, 19, 46, 6); }
    const fs = 9, cw = fs * .6, ch = fs * 1.1, cols = 64, rows = 46, fill = .82 + .26 * eio(b), B = FX.bag3d(cols, rows, Math.sin(t * .9) * .5, -.3, { scale: .9, aspect: ch / cw, fill, cy: rows * .52 });
    sg.font = `400 ${fs}px JB, monospace`; sg.textBaseline = 'top'; const ox = 60, oy = 62;
    for (let j = 0; j < B.out.length; j++) { const v = B.lum[j]; if (!v) continue; sg.fillStyle = v > 1 ? '#fff' : `rgba(240,240,240,${(.3 + v * .6).toFixed(2)})`; sg.fillText(v > 1 ? '@' : B.out[j], ox + (j % cols) * cw, oy + Math.floor(j / cols) * ch); }
    bars.forEach((x, i) => { x.v += ((b > i / 12 ? x.to : 0) - x.v) * .08; const y = 80 + i * 50; sg.fillStyle = 'rgba(255,255,255,.12)'; sg.fillRect(470, y, 480, 22); sg.fillStyle = i % 3 === 0 ? '#8af0b4' : '#fff'; sg.fillRect(470, y, 480 * x.v, 22); sg.fillStyle = 'rgba(255,255,255,.5)'; sg.fillRect(440, y + 6, 14, 10); });
    if (Math.random() < .5) dots.push({ x: SW, s: 2 + Math.random() * 4 }); dots.forEach(d => { d.x -= 6; sg.fillStyle = 'rgba(255,255,255,.55)'; sg.fillRect(d.x, SH - 24, d.s * 3, d.s); }); while (dots.length && dots[0].x < -20) dots.shift();
    // a little scanline shimmer
    sg.fillStyle = 'rgba(255,255,255,.025)'; for (let y = (t * 120) % 6; y < SH; y += 6) sg.fillRect(0, y, SW, 1); scrT.needsUpdate = true; }

  // ---------------------------------------------------------------- the camera, in four moves
  const KEYS = [[0, [3.7, 2.05, 4.6], [.7, .95, -.2], 40], [3.0, [2.3, 1.65, 2.9], [.1, .95, -.5], 40], [4.4, [1.3, 1.48, 1.8], [-.05, 1.05, -.95], 40], [6.6, [.45, 1.36, .8], [-.1, 1.13, -1.15], 38], [8.6, [-.29, 1.17, -.98], [-.29, 1.17, -1.25], 34]];
  const camAt = t => { let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++; const [t0, p0, l0, f0] = KEYS[i], [t1, p1, l1, f1] = KEYS[i + 1], k = eio(span(t, t0, t1));
    return { p: p0.map((v, j) => mix(v, p1[j], k)), l: l0.map((v, j) => mix(v, l1[j], k)), f: mix(f0, f1, k) }; };
  // the walk: from the doorway on the right to the chair
  const path = t => { const k = span(t, T.walk[0], T.walk[1]); return { x: mix(2.5, .12, eio(k)), z: mix(2.6, .62, eio(k)) }; };

  // ---------------------------------------------------------------- post
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam)); const bloom = new UnrealBloomPass(new THREE.Vector2(W0, H0), .55, .55, .82); composer.addPass(bloom); composer.addPass(new OutputPass());
  const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); composer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }; addEventListener('resize', resize);
  const fade = document.createElement('div'); fade.className = 'i3f'; host.appendChild(fade);

  // ---------------------------------------------------------------- run
  let t0 = 0, raf = 0, over = false, lastStep = -1, sat = false, powered = false, lampOn = false, pushed = false, lastScr = 0, lastKey = 0;
  function frame(now) { if (over) return; raf = requestAnimationFrame(frame); if (!t0) t0 = now; const t = window.__i3dT ?? (now - t0) / 1000;
    // the worker walks in, turns to the desk, pulls the chair under him and sits
    const p = path(t), walking = t < T.walk[1], wk = (t - T.walk[0]) * 7.5, sit = eio(span(t, T.sit[0], T.sit[1])), typing = span(t, T.boot[0], T.boot[0] + .3);
    man.position.set(mix(p.x, .02, sit), 0, mix(p.z, .5, sit)); const dir = Math.atan2(2.5 - .12, 2.6 - .62); man.rotation.y = mix(dir, 0, eio(span(t, T.turn[0], T.turn[1])));
    pose(walking ? wk : 0, sit, typing, t); if (walking && t > T.walk[0]) { const s = Math.floor(wk / Math.PI); if (s !== lastStep) { lastStep = s; SND.tick(.06, 260 + Math.random() * 60); } }
    const ck = eio(span(t, T.sit[0] - .3, T.sit[1])); chair.position.set(mix(.25, .02, ck), 0, mix(.45, .62, ck)); chair.rotation.y = mix(.5, 0, ck);
    if (!sat && t > T.sit[1] - .15) { sat = true; SND.thump(.28); SND.blip(140, .05, .2); }
    // the lamp clicks on, the monitor wakes
    if (!lampOn && t > T.power - .35) { lampOn = true; SND.tick(.12, 1800); } lampL.intensity = lampOn ? 6 * eout(span(t, T.power - .35, T.power - .1)) : 0; bulb.material.color.setHex(lampOn ? 0xfff3e0 : 0x222222);
    if (!powered && t > T.power) { powered = true; SND.whoosh(.35, .07, true); SND.blip(1200, .04); } glow.intensity = powered ? 4.5 * eout(span(t, T.power, T.power + .5)) : 0; rim.intensity = 2.5 * eout(span(t, 3.5, 5));
    led.material.color.setHex(powered ? 0x8af0b4 : 0xff5040);
    if (now - lastScr > 33) { lastScr = now; drawScreen(t); }
    if (typing > 0 && t < T.push[0] + .8 && now - lastKey > 70 + Math.random() * 60) { lastKey = now; SND.tick(.025, 3500 + Math.random() * 3000); drawKeys(true); }
    // the camera
    const c = camAt(t); cam.position.set(...c.p); cam.lookAt(...c.l); if (cam.fov !== c.f) { cam.fov = c.f; cam.updateProjectionMatrix(); }
    if (!pushed && t > T.push[0]) { pushed = true; SND.whoosh(1.4, .12, true); SND.droneLevel(.1, 1.2); }
    bloom.strength = .5 + span(t, T.push[0], T.push[1]) * .25;
    fade.style.opacity = String(t < .6 ? 1 - t / .6 : t > T.push[1] - .25 ? span(t, T.push[1] - .25, T.end) : 0); fade.style.background = t > 4 ? '#000' : '#000';
    composer.render(); if (t >= T.end && window.__i3dT == null) finish(); }
  function finish() { if (over) return; over = true; cancelAnimationFrame(raf); removeEventListener('resize', resize); setTimeout(() => { renderer.dispose(); renderer.domElement.remove(); }, 900); done(); }
  raf = requestAnimationFrame(frame);
  return { stop: finish };
}
