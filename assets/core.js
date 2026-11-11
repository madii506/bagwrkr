// bagwrkr core: helpers, data, wallet, the shell (tabs, the floor, your time card), the router, the drawer and the command line
(() => {
  'use strict';
  const Z = window.Z = { views: {}, drawers: {} }, FX = window.ZFX, SND = FX.snd;
  const $ = Z.$ = (s, r = document) => r.querySelector(s), $$ = Z.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = Z.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RM = Z.RM = matchMedia('(prefers-reduced-motion: reduce)').matches, LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  Z.SOL = 'So11111111111111111111111111111111111111112'; Z.JUP = LOCAL ? '/jup' : 'https://lite-api.jup.ag'; Z.FX = FX;
  // ---------------------------------------------------------------- formatting
  const num = Z.num = (x, d = 2) => x == null || !isFinite(x) ? '—' : (+x).toLocaleString('en-US', { maximumFractionDigits: d });
  const usd = Z.usd = (x, d) => x == null || !isFinite(x) ? '—' : '$' + (+x).toLocaleString('en-US', { minimumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 4), maximumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 8) });
  const big = Z.big = x => x == null || !isFinite(x) ? '—' : x >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : usd(x, x < 10 ? 2 : 0);
  const kf = Z.kf = x => x == null || !isFinite(x) ? '—' : x >= 1e9 ? (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e4 ? (x / 1e3).toFixed(1) + 'K' : num(x, 4);
  const pct = Z.pct = (x, d = 2) => x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d) + '%', cls = Z.cls = x => x == null ? 'mu' : x < 0 ? 'dn' : 'up';
  const short = Z.short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  const ago = Z.ago = t => { const s = Date.now() / 1000 - (t > 1e12 ? t / 1000 : t); return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
  const logo = Z.logo = (src, sym, s = 30, sq) => `<span class="lg${sq ? ' sq' : ''}" style="width:${s}px;height:${s}px;font-size:${Math.max(8, Math.round(s / 3.4))}px">${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(String(sym || '?').slice(0, 4))}'))">` : esc(String(sym || '?').slice(0, 4))}</span>`;
  Z.tsx = sig => `<a href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener">${short(sig)} ↗</a>`; Z.acc = w => `<a href="https://solscan.io/account/${w}" target="_blank" rel="noopener">${short(w)}</a>`;
  Z.blocks = FX.blocks; Z.abar = (p, w) => `<span class="ab">${FX.bar(p, w)}</span>`;
  // ---------------------------------------------------------------- api
  async function api(a, qs = '') { const r = await fetch('/api/bagwrkr?a=' + a + qs); const j = await r.json().catch(() => ({ error: 'bad response' })); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; }
  async function post(a, b) { const r = await fetch('/api/bagwrkr?a=' + a, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({ error: 'bad response' })); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; }
  Z.api = api; Z.post = post;
  const S = Z.S = { status: null, coins: null, feed: null, leaders: null, me: null, sort: 'work', seen: new Set(), seenWork: new Set() };
  Z.coin = mint => S.coins && S.coins.coins.find(c => c.mint === mint);
  function toast(m) { const t = $('#toast'); t.innerHTML = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 4200); } Z.toast = toast;
  Z.modal = html => { $('#mcard').innerHTML = html; $('#modal').classList.add('on'); SND.blip(520, .03); }; Z.closeModal = () => $('#modal').classList.remove('on');
  Z.copy = (text, what) => { const done = () => toast((what || 'Copied') + ' copied'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast(esc(text))); else toast(esc(text)); };
  Z.stat = sel => (m, c = '') => { const el = typeof sel === 'string' ? $(sel) : sel; if (el) { el.className = 'stat ' + c; el.innerHTML = m; } };
  // ---------------------------------------------------------------- wallet
  const WL = Z.WL = { pk: null, p: null, view: null };
  const WALLETS = [['Phantom', () => window.phantom && window.phantom.solana, '#ab9ff2', 'https://phantom.com/download'], ['Solflare', () => window.solflare && window.solflare.isSolflare && window.solflare, '#fc7227', 'https://solflare.com/download'], ['Backpack', () => window.backpack, '#e33e3f', 'https://backpack.app/download']];
  Z.login = () => { Z.modal(`<h3>Log in to bagwrkr</h3><p>Connect a Solana wallet. It only shares your address. bagwrkr never asks for a seed phrase or a private key.</p><div class="wl">${WALLETS.map(([n, get, col]) => `<button data-w="${n}"><i style="background:${col}">${n[0]}</i><span>${n}</span><em class="${get() ? 'up' : 'mu2'}">${get() ? 'detected' : 'install ↗'}</em></button>`).join('')}</div>`);
    $('#mcard').onclick = async e => { const b = e.target.closest('[data-w]'); if (!b) return; const w = WALLETS.find(x => x[0] === b.dataset.w), p = w[1](); if (!p) { window.open(w[3], '_blank', 'noopener'); return; } try { const r = await p.connect(); onConnect(((r && r.publicKey) || p.publicKey).toString(), p); Z.closeModal(); SND.chime(); } catch (x) { toast('Connection cancelled'); } }; };
  function onConnect(pk, p) { WL.pk = pk; WL.p = p; if (p.on && !p._z) { p._z = 1; p.on('accountChanged', k => k ? onConnect(k.toString(), p) : disconnect()); } paintAcct(); refreshWallet(); Z.rerender(); }
  async function disconnect() { try { await WL.p.disconnect(); } catch (e) { } WL.pk = null; WL.view = null; paintAcct(); Z.rerender(); } Z.disconnect = disconnect;
  async function refreshWallet() { if (!WL.pk) return; try { const v = await api('wallet', '&addr=' + WL.pk); if (v.wallet !== WL.pk) return; WL.view = v; paintAcct(); document.dispatchEvent(new Event('z-wallet')); } catch (e) { } } Z.refreshWallet = refreshWallet;
  let w3 = null; const web3 = () => w3 || (w3 = new Promise((ok, no) => { if (window.solanaWeb3) return ok(window.solanaWeb3); const s = document.createElement('script'); s.src = '/assets/web3.min.js'; s.onload = () => ok(window.solanaWeb3); s.onerror = () => no(new Error('could not load the signer')); document.head.append(s); }));
  const b64 = u => { let s = ''; u.forEach(c => s += String.fromCharCode(c)); return btoa(s); }, unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  // legacy transactions built by the bagwrkr API; versioned ones built by Jupiter. Both are signed here, in the visitor's wallet
  Z.signSend = async (list, st) => { const W = await web3(); st('check your wallet…'); const txs = list.map(t => W.Transaction.from(unb64(t))); const signed = WL.p.signAllTransactions && txs.length > 1 ? await WL.p.signAllTransactions(txs) : [await WL.p.signTransaction(txs[0])];
    const sigs = []; for (let i = 0; i < signed.length; i++) { st(signed.length > 1 ? `sending ${i + 1} of ${signed.length}…` : 'sending…'); const r = await post('send', { txs: [b64(signed[i].serialize({ requireAllSignatures: false, verifySignatures: false }))] }); sigs.push(r.sigs[0]); } setTimeout(refreshWallet, 1500); SND.chime(); return sigs; };
  Z.signSendV = async (swapTx, st) => { const W = await web3(); st('check your wallet…'); const tx = W.VersionedTransaction.deserialize(unb64(swapTx)), s = await WL.p.signTransaction(tx); st('sending…'); const r = await post('send', { txs: [b64(s.serialize())] }); setTimeout(refreshWallet, 1500); SND.chime(); return r.sigs[0]; };
  // ---------------------------------------------------------------- the shell
  const NAV = Z.NAV = [['floor', '▤', 'floor'], ['coins', '$', 'coins'], ['raids', '⚑', 'raids'], ['clock', '◷', 'clock in'], ['payroll', '≡', 'payroll'], ['leaders', '▲', 'leaders'], ['pulse', '~', 'pulse'], ['launch', '+', 'launch'], ['docs', '?', 'docs'], ['ops', '>_', 'ops']];
  const BAG = '<svg viewBox="0 0 24 26" aria-hidden="true"><path d="M7.2 11.6C3.2 13.8 2.6 22.6 12 23c9.4-.4 8.8-9.2 4.8-11.4z" fill="currentColor"/><path d="M9 11.7h6l-1.2-2H10.2z" fill="currentColor"/><path d="M6.6 8.6c0-4.6 2.2-6.4 5.4-6.4s5.4 1.8 5.4 6.4z" fill="currentColor"/><rect x="4.8" y="8.1" width="14.4" height="1.6" rx=".8" fill="currentColor"/></svg>';
  Z.BAG = BAG;
  function shell() { $('#root').innerHTML = `<div id="app">
    <header id="top"><a class="brand" href="#/floor" title="the floor"><span class="z0">${BAG}</span><span>bagwrkr</span></a>
      <label class="cmd" id="cmdw"><span class="pr">wrkr<b>:~$</b></span><input id="cmd" placeholder="search a coin, a worker, or type a command" autocomplete="off" spellcheck="false" aria-label="command line"><kbd>/</kbd><div class="sug" id="sug"></div></label>
      <div class="tr"><span class="m" id="shift" title="time left in this shift (payroll runs at the end of each shift)"></span><span class="m" id="solp"></span><span class="m" id="clock"></span><button class="sndb" id="sndb" type="button"></button><span id="acct"></span></div></header>
    <nav id="nav">${NAV.map(([k, g, t], i) => `<a href="#/${k}" data-k="${k}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="g">${esc(g)}</span><span class="t">${t}</span></a>`).join('')}<span class="sp"></span><span class="xo" id="navx"></span></nav>
    <div id="body"><main id="main"><div id="view"></div></main><aside id="card" aria-label="your time card"></aside></div>
    <footer id="bot"><span class="st"><i></i><span id="stl">connecting…</span></span><div class="tick"><div id="tickIn"></div></div><button class="keys" id="kb" type="button">? keys</button></footer></div>
    <div id="scrim"></div><aside id="drawer" aria-hidden="true"><div class="dh" id="dh"></div><div class="db" id="db"></div></aside>`;
    paintAcct(); paintSnd(); clock(); setInterval(clock, 1000); cmdInit();
    $('#sndb').onclick = () => { SND.set(!SND.on); if (SND.on) { SND.droneOn(.035); SND.blip(700, .04); } paintSnd(); }; $('#kb').onclick = () => Z.keys && Z.keys();
    $('#scrim').onclick = closeDrawer; document.addEventListener('z-sound', paintSnd); FX.field($('#bg')); }
  function paintSnd() { const b = $('#sndb'); if (b) { b.textContent = SND.on ? 'sound on' : 'sound off'; b.classList.toggle('on', SND.on); } }
  function paintAcct() { const el = $('#acct'); if (!el) return; el.innerHTML = WL.pk ? `<a class="wbtn" href="#/vault"><i></i>${WL.view ? num(WL.view.sol, 2) + ' SOL · ' : ''}${short(WL.pk)}</a>` : `<button class="btn sm pri" id="login">Log in</button>`; const b = $('#login'); if (b) b.onclick = Z.login; }
  // the top bar: how many privacy layers are up today, SOL, and the time in UTC
  // the top bar: the time left in this shift (shifts end at 00:00 UTC), SOL, and the time in UTC
  Z.shiftLeft = () => { const n = new Date(), e = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1); return e - n.getTime(); };
  const hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':'); }; Z.hms = hms;
  function paintTop() { const sp = $('#solp'); if (sp && S.status && S.status.sol) sp.innerHTML = 'SOL <b>' + usd(S.status.sol) + '</b>'; }
  function clock() { const el = $('#clock'); if (el) { try { el.innerHTML = 'UTC <b>' + new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()) + '</b>'; } catch (e) { } }
    const sh = $('#shift'); if (sh) sh.innerHTML = 'shift ends <b>' + hms(Z.shiftLeft()) + '</b>'; document.dispatchEvent(new Event('z-tick')); }
  function paintTick() { const F = S.feed, el = $('#tickIn'); if (!F || !el) return; const sig = F.items.slice(0, 30).map(x => x.id).join(); if (el.dataset.s === sig) return; el.dataset.s = sig;
    const L = F.items.slice(0, 30).map(x => `<a href="#/c/${x.coin}"><b>@${esc(x.user)}</b><span>$${esc(x.symbol || '')}</span><span class="up">+${Math.round(x.pts || 0)} pts</span></a>`).join('') || '<a><b>the floor is quiet</b><span>be the first to clock in</span></a>'; el.innerHTML = L + L; }
  let flashT = 0; Z.flash = html => { const el = $('#stl'); if (!el) return; clearTimeout(flashT); el.innerHTML = '<b style="color:#fff">' + html.replace(/<a [^>]*>|<\/a>/g, '') + '</b>'; el.dataset.lit = 1; flashT = setTimeout(() => { el.dataset.lit = ''; paintStatus(); }, 7000); };
  function paintStatus() { const el = $('#stl'); if (!el || el.dataset.lit) return; const T = S.status, err = S.coinsErr || S.feedErr; el.textContent = err && !S.coins ? 'can’t reach bagwrkr right now · retrying' : err ? 'some data is stale · retrying' : S.coins ? `live · ${S.coins.coins.length} coin${S.coins.coins.length === 1 ? '' : 's'} · ${T ? T.workers || 0 : '…'} workers · ${T ? T.posts || 0 : '…'} posts handed in` : 'connecting…'; }
  // ---------------------------------------------------------------- router: one main view, and a drawer that slides over it
  const ALIAS = { '': 'floor', home: 'floor', clockin: 'clock', me: 'clock', man: 'docs', board: 'coins' };
  let mainKey = null, view = 'floor', arg = '', dname = null, darg = '';
  const parse = () => { const h = location.hash || '#/floor', [path, qstr] = h.slice(2).split('?'), parts = path.split('/'); let v = parts[0] || ''; v = ALIAS[v] ?? v; return { v, a: decodeURIComponent(parts[1] || ''), qs: new URLSearchParams(qstr || ''), h }; };
  function renderMain(v, a, qs, h, force) { if (!Z.views[v]) v = 'floor'; const key = v + '|' + a + '|' + (qs + '') + '|' + (WL.pk || ''); if (key === mainKey && !force) return; mainKey = key; view = v; arg = a;
    const V = Z.views[v], el = $('#view'); el.innerHTML = V.render(a, qs) || ''; el.classList.remove('ve'); void el.offsetWidth; el.classList.add('ve'); $('#main').scrollTop = 0; if (innerWidth <= 900) scrollTo({ top: 0 });
    $$('#nav a').forEach(x => x.classList.toggle('on', x.dataset.k === (V.nav || v))); Z._ws = null; if (V.init) V.init(a, qs); FX.scrambleAll(el); }
  function openDrawer(d, a, force) { const D = Z.drawers[d]; if (!D) return; const was = dname === d && darg === a; dname = d; darg = a; if (was && !force) return; const o = D.render(a) || {}; $('#dh').innerHTML = (o.head || '') + '<button class="btn xs" id="dX" type="button">esc ✕</button>'; $('#db').innerHTML = o.body || ''; $('#db').scrollTop = 0;
    $('#dX').onclick = closeDrawer; if (!document.body.classList.contains('dopen')) SND.whoosh(.45, .07, false); document.body.classList.add('dopen'); $('#drawer').setAttribute('aria-hidden', 'false'); if (D.init) D.init(a); FX.scrambleAll($('#drawer')); }
  function closeDrawer() { if (!dname) return; const base = (Z.drawers[dname] && Z.drawers[dname].base) || 'floor'; dname = null; darg = ''; document.body.classList.remove('dopen'); $('#drawer').setAttribute('aria-hidden', 'true'); if (location.hash.startsWith('#/l/') || location.hash.startsWith('#/s/')) history.replaceState(null, '', '#/' + (Z._base || base)); }
  Z.closeDrawer = closeDrawer;
  function render(force) { const { v, a, qs, h } = parse(); if (Z.drawers[v]) { const base = Z._base && Z.views[Z._base] ? Z._base : (Z.drawers[v].base || 'floor'); if (!mainKey) renderMain(base, '', new URLSearchParams(), '#/' + base); openDrawer(v, a, force); return; }
    if (dname) { dname = null; document.body.classList.remove('dopen'); } Z._base = Z.views[v] ? v : 'floor'; renderMain(v, a, qs, h, force); }
  Z.rerender = () => render(true); Z.view = () => view; Z.drawer = () => dname;
  Z.wl = () => WL; Z.go = h => { if (h === '#keys') { Z.keys && Z.keys(); return; } if (h === '#console') { Z.con && Z.con.toggle(true); return; } if (h === '#dark') { Z.dark && Z.dark(); return; } if (h === '#sound') { $('#sndb').click(); return; } if (h[0] === '/') { location.href = h; return; } if (location.hash === h) render(true); else location.hash = h; };
  // coins launched in this tab that the chain index hasn't picked up yet
  Z.wait = what => (what === 'feed' ? S.feedErr : S.coinsErr) ? `<span class="dn">can’t reach bagwrkr right now · retrying</span>` : `${FX.spin()} ${what === 'feed' ? 'reading the floor' : 'reading the chain'}`;
  Z.pending = m => { try { const P = JSON.parse(sessionStorage.getItem('bagwrkr-pend') || '{}'), x = P[m]; return x && Date.now() - x.at < 15 * 60e3 ? x : null; } catch (e) { return null; } };
  Z.pend = (m, x) => { try { const P = JSON.parse(sessionStorage.getItem('bagwrkr-pend') || '{}'); P[m] = Object.assign({ at: Date.now() }, x); sessionStorage.setItem('bagwrkr-pend', JSON.stringify(P)); } catch (e) { } };
  function refresh() { paintTop(); paintTick(); paintStatus(); const V = Z.views[view]; if (V && V.refresh) V.refresh(arg); const D = dname && Z.drawers[dname]; if (D && D.refresh) D.refresh(darg); if (Z.logTick) Z.logTick(); }
  addEventListener('hashchange', () => render());
  Z.winScroll = fn => { Z._ws = fn; }; addEventListener('scroll', () => { if (Z._ws) Z._ws(); }, { passive: true });
  // little sounds for the hand: a tick on every click, a softer one when the pointer crosses a tile
  document.addEventListener('click', e => { if (e.target.closest('a,button')) SND.tick(.035, 4200); }, true);
  let hovT = 0; document.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const t = e.target.closest('.tile,.fr,#nav a,.pick button'); if (t && t !== Z._hov && performance.now() - hovT > 45) { hovT = performance.now(); Z._hov = t; SND.tick(.012, 6500); } }, true);
  // ---------------------------------------------------------------- command line
  function cmdInit() { const inp = $('#cmd'), sug = $('#sug'); let items = [], at = 0;
    const CMDS = [['floor', 'the work floor, live', '#/floor'], ['coins', 'every coin on bagwrkr', '#/coins'], ['raids', 'the shift’s best posts: like, repost, reply', '#/raids'], ['clock in', 'link X and hand in your posts', '#/clock'], ['pulse', 'the floor in numbers', '#/pulse'], ['payroll', 'every payout, and your payslips', '#/payroll'], ['leaders', 'the hardest workers', '#/leaders'], ['launch', 'launch a coin', '#/launch'], ['docs', 'how bagwrkr works', '#/docs'], ['ops', 'operator console', '#/ops'], ['console', 'the bagwrkr console', '#console'], ['dark', 'go dark: hide your wallet and balances', '#dark'], ['keys', 'keyboard shortcuts', '#keys'], ['sound', 'sound on or off', '#sound'], ['intro', 'play the intro again', '/']];
    const build = q => { q = q.trim().toLowerCase(); if (!q) return CMDS.slice(0, 7).map(c => ({ k: c[0], d: c[1], h: c[2], t: 'cmd', g: '>' })); const out = []; const lm = /^(launch|pair)\s+(\S+)/.exec(q);
      for (const c of CMDS) if (c[0].startsWith(q)) out.push({ k: c[0], d: c[1], h: c[2], t: 'cmd', g: '>' });
      for (const w of (S.leaders ? S.leaders.workers : [])) if (('@' + w.user).toLowerCase().includes(q)) out.push({ k: '@' + w.user, d: Math.round(w.points) + ' points', h: '#/w/' + w.wallet, t: 'worker #' + w.rank, ic: w.avatar });
      for (const c of (S.coins ? S.coins.coins : [])) if ((c.symbol + ' ' + c.name + ' ' + c.mint).toLowerCase().includes(q)) out.push({ k: '$' + c.symbol, d: c.name, h: '#/c/' + c.mint, t: 'coin · ' + (c.workers || 0) + ' workers', ic: c.image });
      return out.slice(0, 9); };
    const paint = () => { sug.innerHTML = items.map((x, i) => `<a href="${x.h}" class="${i === at ? 'on' : ''}">${x.ic ? logo(x.ic, x.k, 20) : `<span class="g">${x.g || '>'}</span>`}<b>${esc(x.k)}</b><span class="mu">${esc(x.d)}</span><small>${esc(x.t)}</small></a>`).join(''); sug.classList.toggle('on', !!items.length); };
    inp.oninput = () => { items = build(inp.value); at = 0; paint(); };
    inp.onkeydown = e => { if (e.key === 'ArrowDown') { at = Math.min(items.length - 1, at + 1); paint(); e.preventDefault(); } else if (e.key === 'ArrowUp') { at = Math.max(0, at - 1); paint(); e.preventDefault(); } else if (e.key === 'Enter') { const x = items[at]; if (x) { Z.go(x.h); inp.value = ''; items = []; paint(); inp.blur(); } else if (inp.value.trim()) toast('Nothing matches “' + esc(inp.value.trim()) + '”. Try a layer like ZEC, or: wall, feed, launch'); } else if (e.key === 'Escape') { inp.value = ''; items = []; paint(); inp.blur(); } };
    sug.onclick = e => { const a = e.target.closest('a'); if (a && /^#(keys|sound|console|dark)$/.test(a.getAttribute('href'))) { e.preventDefault(); Z.go(a.getAttribute('href')); } inp.value = ''; items = []; setTimeout(paint, 0); };
    inp.onblur = () => setTimeout(() => { sug.classList.remove('on'); $('#cmdw').classList.remove('on'); }, 160); inp.onfocus = () => { $('#cmdw').classList.add('on'); items = build(inp.value); paint(); };
    addEventListener('keydown', e => { const typing = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')); if (window.ZI && window.ZI.active) return;
      if (e.key === '/' && !typing) { e.preventDefault(); inp.focus(); } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && /^[0-9]$/.test(e.key)) Z.go('#/' + NAV[e.key === '0' ? 9 : +e.key - 1][0]);
      else if (!typing && e.key === 'm') $('#sndb').click(); else if (e.key === 'Escape') { if ($('#modal').classList.contains('on')) Z.closeModal(); else closeDrawer(); } });
    $('#modal').onclick = e => { if (e.target.id === 'modal') Z.closeModal(); }; }
  // ---------------------------------------------------------------- data + start
  const why = e => /fetch|network|load failed/i.test(e.message || '') ? 'no connection' : (e.message || 'error').slice(0, 60);
  async function loadFeed() { try { const f = await api('feed'); S.fresh2 = S.feed ? new Set(f.items.filter(x => !S.seenWork.has(x.id)).map(x => x.id)) : new Set(); f.items.forEach(x => S.seenWork.add(x.id)); S.feed = f; S.feedErr = null; } catch (e) { S.feedErr = why(e); } }
  async function loadLeaders() { try { S.leaders = await api('leaders'); } catch (e) { } }
  async function loadMe() { if (!WL.pk) { S.me = null; return; } try { const m = await api('me', '&wallet=' + WL.pk); if (m.wallet === WL.pk) S.me = m; } catch (e) { } } Z.loadMe = async () => { await loadMe(); refresh(); };
  async function loadCoins() { try { const first = !S.coins; S.coins = await api('coins'); S.fresh = first ? new Set() : new Set(S.coins.coins.filter(c => !S.seen.has(c.mint)).map(c => c.mint)); S.coins.coins.forEach(c => S.seen.add(c.mint)); S.coinsErr = null; } catch (e) { S.coinsErr = why(e); } }
  async function loadStatus() { try { S.status = await api('status'); S.statusErr = null; } catch (e) { S.statusErr = why(e); } }
  Z.reload = async () => { await Promise.all([loadFeed(), loadCoins(), loadStatus(), loadLeaders(), loadMe()]); refresh(); };
  Z.boot = () => { const h = document.documentElement; if (RM) return; h.classList.add('boot'); setTimeout(() => h.classList.remove('boot'), 1400); };
  Z.start = async () => { shell(); if (window.ZI && window.ZI.active) { window.ZI.onDone = () => { history.replaceState(null, '', '#/floor'); render(true); Z.boot(); }; } else { if (!location.hash || location.hash === '#/') history.replaceState(null, '', '#/floor'); Z.boot(); }
    render(); await Z.reload(); render(true); setInterval(async () => { await loadCoins(); refresh(); }, 20000); setInterval(async () => { await loadFeed(); refresh(); }, 12000); setInterval(async () => { await Promise.all([loadLeaders(), loadMe()]); refresh(); }, 40000); setInterval(loadStatus, 60000); setInterval(refreshWallet, 15000);
    document.addEventListener('z-audio', () => { if (SND.on && !(window.ZI && window.ZI.active)) SND.droneOn(.035); });
    const ph = window.phantom && window.phantom.solana; if (ph && ph.connect) { try { const r = await ph.connect({ onlyIfTrusted: true }); if (r && r.publicKey) onConnect(r.publicKey.toString(), ph); } catch (e) { } } };
})();
