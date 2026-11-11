// bagwrkr API: launch a coin on Raydium LaunchLab, then work its bag. Holders link their X account, hand in the posts they make about the coin,
// every post is read from X's public pages and scored, and payroll pays the curve fees to the holders who did the work, by points.
// GET  a=status · a=coins · a=coin&mint= · a=candles&mint= · a=holders&mint= · a=wallet&addr= · a=pad · a=rounds · a=feed · a=leaders · a=me&wallet= · a=period&mint= · a=preview&url=
// POST a=img · a=buildLaunch · a=buildPad · a=claim · a=linkStart · a=linkVerify · a=work · a=buildPayroll · a=send      (every transaction is signed in the visitor's own wallet)
const { Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction } = require('@solana/web3.js');
const SPL = require('@solana/spl-token');
const BN = require('bn.js');
const R = require('@raydium-io/raydium-sdk-v2');
const crypto = require('crypto');
const CFG = require('./bagwrkr-config.json'), WK = CFG.work;
// ---------------------------------------------------------------- plumbing
const RPCS = [process.env.RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
async function rpcFetch(url, opts) { let last = null; for (let round = 0; round < 2; round++) { for (const u of RPCS) { try { const r = await fetch(u, { ...opts, signal: AbortSignal.timeout(12000) }); if (r.status === 429 || r.status === 401 || r.status === 403 || r.status >= 500) { last = r; continue; } return r; } catch (e) { last = e; } } await new Promise(r => setTimeout(r, 700)); } if (last instanceof Error) throw last; return last; }
const conn = new Connection(RPCS[0], { commitment: 'confirmed', fetch: rpcFetch, disableRetryOnRateLimit: true });

const SOL = 'So11111111111111111111111111111111111111112', WSOL = new PublicKey(SOL);
const PROGRAM = R.LAUNCHPAD_PROGRAM, RAYDIUM_PLATFORM = R.LAUNCHPAD_PLATFORM, CONFIG = R.getPdaLaunchpadConfigId(PROGRAM, WSOL, 0, 0).publicKey;
const TAG = new PublicKey(process.env.BAGWRKR_TAG || CFG.tag);               // every bagwrkr launch and payout sends 0 SOL here with a memo, so the chain is the index
const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const PIN = { pad: process.env.BAGWRKR_PAD || CFG.pad || null };               // the bagwrkr launchpad (a LaunchLab platform config). Until it exists, coins launch on Raydium's own platform
const SUPPLY = new BN('1000000000000000'), PPM = 1e6, RUN = +CFG.run || 7;
const JUP = 'https://lite-api.jup.ag', HISTORY_API = 'https://launch-history-v1.raydium.io', PFX = 'bagwrkr/';

const out = (res, code, b, cache) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', cache || 'no-store'); res.end(JSON.stringify(b)); };
const body = req => new Promise(ok => { if (req.body) return ok(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); let d = ''; req.on('data', c => d += c); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } }); });
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const pk = (s, what) => { try { return new PublicKey(String(s)); } catch { throw new Error(what || 'bad address'); } };
const link = (s, re, what, eg) => { s = clean(s, 200); if (!s) return ''; if (!/^https:\/\/\S+$/.test(s)) throw new Error(`the ${what} must be a https:// link`); if (re && !re.test(s)) throw new Error(`the ${what} must start with ${eg}`); return s; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJ(url, ms = 8000) { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(r.status + ' ' + url.split('/')[2]); return r.json(); }
const cache = new Map();
async function memo(key, ttl, fn) { const c = cache.get(key); if (c && Date.now() - c.t < ttl) return c.v; if (c && c.p) return c.p; const p = fn().then(v => { cache.set(key, { t: Date.now(), v }); return v; }, e => { if (c) cache.set(key, c); else cache.delete(key); throw e; }); cache.set(key, { ...(c || { t: 0 }), p }); return p; }
const memoIx = text => new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from(text) });
const tagIx = from => SystemProgram.transfer({ fromPubkey: from, toPubkey: TAG, lamports: 0 });
const padIdOf = admin => R.getPdaPlatformId(PROGRAM, admin).publicKey, vaultOf = id => R.getPdaPlatformVault(PROGRAM, id, WSOL).publicKey;
const str = b => Buffer.from(b).toString('utf8').replace(/\0/g, '').trim(), pct = n => +(+n.toString() / PPM * 100).toFixed(4);

// write-once files (images, metadata, coin cards) and one small overwritten file (the performance sheet)
const blob = () => require('@vercel/blob');
const hasStore = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const blobBase = () => { const id = (process.env.BLOB_STORE_ID || '').replace(/^store_/, '') || String(process.env.BLOB_READ_WRITE_TOKEN || '').split('_')[3] || ''; return id ? `https://${id.toLowerCase()}.public.blob.vercel-storage.com/` : null; };
async function putFile(path, data, type, over) { if (!hasStore()) throw new Error('storage is not switched on yet');
  try { return (await blob().put(PFX + path, data, { access: 'public', addRandomSuffix: false, allowOverwrite: !!over, contentType: type, cacheControlMaxAge: over ? 60 : 31536000 })).url; }
  catch (e) { if (!over && /exist/i.test(e.message || '')) { const h = await blob().head(PFX + path).catch(() => null); if (h) return h.url; } throw e; } }
async function readFile(path, fresh) { const b = blobBase(); if (!b) return null; try { const r = await fetch(b + PFX + path + (fresh ? '?t=' + Date.now() : ''), { signal: AbortSignal.timeout(6000) }); return r.ok ? await r.json() : null; } catch { return null; } }
async function jupInfo(mints) { const o = {}, L = [...new Set(mints)].filter(Boolean);
  for (let i = 0; i < L.length; i += 90) { try { const j = await getJ(`${JUP}/tokens/v2/search?query=${L.slice(i, i + 90).join(',')}`);
    for (const t of j || []) { const s = t.stats24h || {}; o[t.id] = { symbol: t.symbol, name: t.name, icon: t.icon || null, decimals: t.decimals, usd: t.usdPrice ?? null, ch24: s.priceChange ?? null, mcap: t.mcap ?? t.fdv ?? null, liquidity: t.liquidity ?? null, holders: t.holderCount ?? null, vol24: (s.buyVolume || 0) + (s.sellVolume || 0), traders24: s.numTraders ?? null, curve: t.bondingCurve ?? null, created: t.createdAt || null, program: t.tokenProgram || null }; } } catch { } }
  return o; }
const solUsd = () => memo('sol', 30000, async () => ((await jupInfo([SOL]))[SOL] || {}).usd || null);

// ---------------------------------------------------------------- the chain index: launches and payout rounds, read from the tag address
async function scan() { return memo('scan', 20000, async () => { const sigs = (await conn.getSignaturesForAddress(TAG, { limit: 300 })).filter(s => !s.err), launches = [], rounds = [];
  for (let i = 0; i < sigs.length; i += 25) { const txs = await conn.getParsedTransactions(sigs.slice(i, i + 25).map(s => s.signature), { maxSupportedTransactionVersion: 0 }).catch(() => []);
    txs.forEach((t, k) => { if (!t || !t.meta || t.meta.err) return; const by = t.transaction.message.accountKeys[0].pubkey.toBase58(), sig = sigs[i + k].signature, at = t.blockTime;
      for (const ix of t.transaction.message.instructions) { if (ix.program !== 'spl-memo' || typeof ix.parsed !== 'string') continue;
        let m = /^bagwrkr:launch:([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(ix.parsed); if (m) launches.push({ mint: m[1], creator: by, sig, at });
        m = /^bagwrkr:payroll:([1-9A-HJ-NP-Za-km-z]{32,44}):(\d{6,14}):(\d{1,3}):(\d{1,24})$/.exec(ix.parsed); if (m) rounds.push({ coin: m[1], period: +m[2], wallets: +m[3], lamports: m[4], by, sig, at }); } }); }
  const seen = new Set(); return { launches: launches.filter(l => !seen.has(l.mint) && seen.add(l.mint)), rounds }; }); }
// a coin counts when its launch memo is on-chain AND bagwrkr built that launch for the same wallet (the card file is written once, at build time)
async function coins() { return memo('coins', 20000, async () => { const S = await scan(); const cards = await Promise.all(S.launches.slice(0, 120).map(l => memo('card:' + l.mint, 3600e3, () => readFile('coin/' + l.mint + '.json'))));
  const ok = S.launches.slice(0, 120).map((l, i) => ({ l, c: cards[i] })).filter(x => x.c && x.c.creator === x.l.creator);
  const [J, W] = await Promise.all([jupInfo(ok.map(x => x.l.mint)), Promise.all(ok.map(x => workOf(x.l.mint).catch(() => [])))]);
  const paid = {}, paidSol = {}; for (const r of S.rounds) { paid[r.coin] = (paid[r.coin] || 0) + 1; paidSol[r.coin] = (paidSol[r.coin] || 0) + Number(r.lamports) / 1e9; }
  return { at: Date.now(), pad: PIN.pad, coins: ok.map(({ l, c }, i) => { const j = J[l.mint] || {}, w = W[i], since = lastPayroll(S, l.mint, l.at), cur = w.filter(x => x.created >= since);
    return { mint: l.mint, pool: c.pool, name: j.name || c.name, symbol: j.symbol || c.symbol, image: c.image, desc: c.desc || '', links: c.links || {}, creator: l.creator, at: l.at, sig: l.sig,
      openUsd: c.openUsd, gradUsd: c.gradUsd, raiseSol: c.raiseSol, usd: j.usd ?? null, mcap: j.mcap ?? null, ch24: j.ch24 ?? null, vol24: j.vol24 ?? null, holders: j.holders ?? null, liquidity: j.liquidity ?? null,
      curve: j.curve ?? (j.mcap && c.gradUsd ? Math.max(0, Math.min(100, (j.mcap - c.openUsd) / (c.gradUsd - c.openUsd) * 100)) : null), onPad: !!c.pad, rounds: paid[l.mint] || 0, paidSol: +(paidSol[l.mint] || 0).toFixed(4),
      posts: w.length, workers: new Set(w.map(x => x.wallet)).size, points: Math.round(w.reduce((a, x) => a + x.pts, 0)), periodPoints: Math.round(cur.reduce((a, x) => a + x.pts, 0)), periodWorkers: new Set(cur.map(x => x.wallet)).size, since }; }) }; }); }
async function candles(mint) { const c = (await coins()).coins.find(x => x.mint === mint); if (!c) throw new Error('not a bagwrkr coin');
  return memo('k:' + mint, 30000, async () => { let rows = []; try { const j = await getJ(`${HISTORY_API}/kline?poolId=${c.pool}&interval=15m&limit=300`); rows = ((j && j.data && j.data.rows) || []).map(r => ({ t: r.t, o: +r.o, h: +r.h, l: +r.l, c: +r.c })).sort((a, b) => a.t - b.t); } catch { } return { mint, rows, unit: 'SOL per coin', interval: '15m' }; }); }
async function coin(mint) { const C = await coins(), c = C.coins.find(x => x.mint === mint); if (!c) throw new Error('not a bagwrkr coin');
  const [S, su, w] = await Promise.all([scan(), solUsd(), workOf(mint)]);
  return { coin: c, rounds: S.rounds.filter(r => r.coin === mint).slice(0, 30), feePct: CFG.feePct, payoutsLive: !!PIN.pad && c.onPad, sol: su, board: boardOf(w, c.since), work: w.slice(0, 60), rules: rules() }; }

// ---------------------------------------------------------------- wallets and holders
async function walletView(addr) { const w = pk(addr, 'bad wallet'); const [lam, a, b] = await Promise.all([conn.getBalance(w), conn.getParsedTokenAccountsByOwner(w, { programId: SPL.TOKEN_PROGRAM_ID }), conn.getParsedTokenAccountsByOwner(w, { programId: SPL.TOKEN_2022_PROGRAM_ID })]);
  const held = {}; for (const x of [...a.value, ...b.value]) { const i = x.account.data.parsed.info, ui = +i.tokenAmount.uiAmountString; if (ui > 0) held[i.mint] = (held[i.mint] || 0) + ui; }
  const mints = Object.keys(held).slice(0, 180), [J, C, su] = await Promise.all([jupInfo(mints), coins().catch(() => ({ coins: [] })), solUsd()]); const mine = Object.fromEntries(C.coins.map(c => [c.mint, c]));
  const tokens = mints.map(m => { const j = J[m] || {}, c = mine[m]; return { mint: m, amount: held[m], symbol: c ? c.symbol : (j.symbol || m.slice(0, 4)), name: c ? c.name : (j.name || ''), icon: c ? c.image : j.icon || null, price: j.usd ?? null, usd: j.usd != null ? held[m] * j.usd : null, kind: c ? 'bagwrkr' : 'coin' }; }).sort((x, y) => (y.usd || 0) - (x.usd || 0));
  return { wallet: w.toBase58(), sol: lam / 1e9, solUsd: su ? lam / 1e9 * su : null, totalUsd: (su ? lam / 1e9 * su : 0) + tokens.reduce((s, t) => s + (t.usd || 0), 0), tokens, launched: C.coins.filter(c => c.creator === w.toBase58()).map(c => c.mint) }; }
async function holdersOf(mintStr) { const mint = pk(mintStr, 'bad mint'), acc = await conn.getAccountInfo(mint); if (!acc) throw new Error('mint not found'); const prog = acc.owner; let rows = [], full = true;
  try { const r = await conn.getParsedProgramAccounts(prog, { filters: [...(prog.equals(SPL.TOKEN_PROGRAM_ID) ? [{ dataSize: 165 }] : []), { memcmp: { offset: 0, bytes: mint.toBase58() } }] }); rows = r.map(x => ({ owner: x.account.data.parsed.info.owner, raw: BigInt(x.account.data.parsed.info.tokenAmount.amount) })); }
  catch (e) { full = false; let top; try { top = await conn.getTokenLargestAccounts(mint); } catch { throw new Error('the public Solana RPC is rate-limiting holder lists right now. try again in a minute'); } const infos = await conn.getMultipleParsedAccounts(top.value.map(x => x.address)); rows = infos.value.map((x, i) => x ? { owner: x.data.parsed.info.owner, raw: BigInt(top.value[i].amount) } : null).filter(Boolean); }
  const by = {}; for (const r of rows) { if (r.raw <= 0n) continue; let on = false; try { on = PublicKey.isOnCurve(new PublicKey(r.owner).toBytes()); } catch { } if (!on) continue; by[r.owner] = (by[r.owner] || 0n) + r.raw; }   // off-curve owners are pools and vaults
  return { full, list: Object.entries(by).map(([owner, raw]) => ({ owner, raw })).sort((a, b) => (b.raw > a.raw ? 1 : -1)) }; }

// ---------------------------------------------------------------- LaunchLab: the curve, a launch, the launchpad, its fees
let chainCache = null;
async function chain() { if (chainCache && Date.now() - chainCache.t < 120000) return chainCache.v; const [ca, pa] = await conn.getMultipleAccountsInfo([CONFIG, RAYDIUM_PLATFORM]); if (!ca) throw new Error('could not read LaunchLab');
  const v = { cfg: R.LaunchpadConfig.decode(ca.data), ray: pa ? R.PlatformConfig.decode(pa.data) : null }; chainCache = { t: Date.now(), v }; return v; }
// LaunchLab's constant-product curve with the graduation price equal to the pool's opening price:
//   run = graduation / start,  sold share = sqrt(run) / (1 + sqrt(run)),  SOL raised = graduation x (1 - sold share)
function curveOf(startSol, run) { const q = Math.sqrt(run), sold = q / (1 + q), gradSol = startSol * run; return { run, sold, raise: gradSol * (1 - sold), startSol, gradSol }; }
async function sdk(owner) { const r = await R.Raydium.load({ connection: conn, owner, cluster: 'mainnet', disableLoadToken: true, disableFeatureCheck: true, blockhashCommitment: 'confirmed' }); if (module.exports._t.onLoad) module.exports._t.onLoad(r); return r; }
const fits = t => { try { return t.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= 1232; } catch { return false; } };
const txsOf = m => m.transactions ? m.transactions : [{ instructions: m.transaction && m.transaction.instructions && m.transaction.instructions.length ? m.transaction.instructions : m.builder.allInstructions }];
async function finish(txs, wallet, signers, extra, simulate) { const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const mk = ixs => { const t = new Transaction(); t.add(...ixs); t.feePayer = wallet; t.recentBlockhash = blockhash; const need = signers.filter(s => t.instructions.some(ix => ix.keys.some(k => k.isSigner && k.pubkey.equals(s.publicKey)))); if (need.length) t.partialSign(...need); return t; };
  let list = txs.map((tx, i) => mk(i === 0 && extra ? [...tx.instructions, ...extra] : tx.instructions)); if (extra && !fits(list[0])) { list = txs.map(tx => mk(tx.instructions)); list.push(mk(extra)); }
  let sim = null; if (simulate) { const r = await conn.simulateTransaction(list[0]); sim = { err: r.value.err, units: r.value.unitsConsumed, logs: (r.value.logs || []).slice(-12) }; }
  return { txs: list.map(t => Buffer.from(t.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')), sim }; }
async function img(req) { const b = await body(req); const m = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) throw new Error('pick a png, jpg, webp or gif image');
  const buf = Buffer.from(m[3], 'base64'); if (buf.length > 1.5e6) throw new Error('that image is too big (1.5 MB max)'); if (buf.length < 100) throw new Error('that image is empty');
  return { url: await putFile(`img/${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 24)}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`, buf, m[1]) }; }

function decodePad(id, data) { const p = R.PlatformConfig.decode(data); return { id: id.toBase58(), name: str(p.name), feePct: pct(p.feeRate), lp: { burn: pct(p.burnScale), platform: pct(p.platformScale) }, claimWallet: p.platformClaimFeeWallet.toBase58() }; }
async function pad(q) { const id = q.get('id') ? pk(q.get('id'), 'bad pad id') : padIdOf(pk(q.get('admin'), 'bad wallet')); const [acc, vault] = await conn.getMultipleAccountsInfo([id, vaultOf(id)]);
  if (!acc || !acc.owner.equals(PROGRAM)) return { exists: false, id: id.toBase58(), pinned: PIN.pad };
  return { exists: true, ...decodePad(id, acc.data), vault: vaultOf(id).toBase58(), unclaimedSol: vault && vault.data.length >= 72 ? Number(vault.data.readBigUInt64LE(64)) / 1e9 : 0, pinned: PIN.pad }; }
// the bagwrkr launchpad: 1% of every curve trade goes to the wallet that created it, which pays it out as payroll to each coin's bagworkers; half the graduation liquidity is burned
async function buildPad(req) { const b = await body(req), wallet = pk(b.wallet, 'connect a wallet first'), id = padIdOf(wallet); if (await conn.getAccountInfo(id)) throw new Error(`this wallet already has a launchpad (${id.toBase58()}). one per wallet.`);
  const { ray } = await chain(); if (!ray) throw new Error('could not read Raydium’s platform settings'); const burn = Math.round(CFG.burnPct * 1e4), host = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host || 'bagwrkr.vercel.app'), raydium = await sdk(wallet);
  const made = await raydium.launchpad.createPlatformConfig({ programId: PROGRAM, platformAdmin: wallet, platformClaimFeeWallet: wallet, platformLockNftWallet: wallet, platformVestingWallet: wallet, cpConfigId: ray.cpConfigId,
    migrateCpLockNftScale: { platformScale: new BN(PPM - burn), creatorScale: new BN(0), burnScale: new BN(burn) }, transferFeeExtensionAuth: wallet, creatorFeeRate: new BN(0), feeRate: new BN(Math.round(CFG.feePct * 1e4)),
    name: CFG.name, web: host, img: host + '/icon.png', txVersion: R.TxVersion.LEGACY, feePayer: wallet });
  return { pad: id.toBase58(), ...(await finish(txsOf(made), wallet, [], [memoIx('bagwrkr:pad'), tagIx(wallet)], !!b.simulate)) }; }
async function claim(req) { const b = await body(req), wallet = pk(b.wallet, 'connect a wallet first'), id = padIdOf(wallet); if (!(await conn.getAccountInfo(id))) throw new Error('this wallet has no launchpad');
  const raydium = await sdk(wallet), made = await raydium.launchpad.claimVaultPlatformFee({ programId: PROGRAM, platformId: id, mintB: WSOL, claimFeeWallet: wallet, txVersion: R.TxVersion.LEGACY, feePayer: wallet });
  return finish(txsOf(made), wallet, [], null, !!b.simulate); }
async function sendTxs(req) { const b = await body(req); if (!Array.isArray(b.txs) || !b.txs.length || b.txs.length > 6) throw new Error('nothing to send'); const sigs = [];
  for (const t of b.txs) { const sig = await conn.sendRawTransaction(Buffer.from(t, 'base64'), { skipPreflight: false, maxRetries: 3 }); sigs.push(sig);
    for (let k = 0; k < 40; k++) { const s = (await conn.getSignatureStatuses([sig])).value[0]; if (s && s.err) throw new Error('transaction failed: ' + JSON.stringify(s.err)); if (s && /confirmed|finalized/.test(s.confirmationStatus || '')) break; await sleep(700); } }
  cache.delete('scan'); cache.delete('coins'); return { sigs }; }
// ---------------------------------------------------------------- the work: posts on X, read from public post pages, scored
// a post is read twice: when it is handed in, and again at payroll, so its points follow its real reach.
const POST_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/;
const parsePost = url => { const m = POST_RE.exec(String(url || '').trim()); if (!m) throw new Error('paste a link to a post on X, like https://x.com/you/status/123…'); return { user: m[1], id: m[2] }; };
const num = v => { const n = +v; return Number.isFinite(n) && n > 0 ? n : 0; };
async function readPost(id) { return memo('post:' + id, 120000, async () => { let t = null;
  try { const j = await getJ(`https://api.fxtwitter.com/status/${id}`, 7000); t = j && j.tweet; } catch { }
  if (t && t.author) return { id, user: t.author.screen_name, name: t.author.name || '', avatar: t.author.avatar_url || null, followers: num(t.author.followers), joined: t.author.joined ? Date.parse(t.author.joined) || null : null,
    text: String(t.text || ''), likes: num(t.likes), rts: num(t.retweets), replies: num(t.replies), views: num(t.views), created: (t.created_timestamp || Date.parse(t.created_at) / 1000 || 0) * 1000,
    kind: t.replying_to ? 'reply' : t.quote ? 'quote' : 'post', urls: ((t.raw_text && t.raw_text.facets) || []).map(f => f.replacement || f.original || '').filter(Boolean) };
  try { const v = await getJ(`https://api.vxtwitter.com/i/status/${id}`, 7000);
    if (v && v.user_screen_name) return { id, user: v.user_screen_name, name: v.user_name || '', avatar: v.user_profile_image_url || null, followers: null, joined: null, text: String(v.text || ''), likes: num(v.likes), rts: num(v.retweets), replies: num(v.replies), views: 0,
      created: (v.date_epoch || 0) * 1000, kind: v.replyingTo ? 'reply' : v.qrtURL ? 'quote' : 'post', urls: [] }; } catch { }
  throw new Error('could not read that post from X right now. is it public? try again in a minute'); }); }
async function readUser(user) { return memo('user:' + user.toLowerCase(), 600000, async () => { try { const j = await getJ(`https://api.fxtwitter.com/${encodeURIComponent(user)}`, 7000), u = j && j.user;
  if (u) return { user: u.screen_name, name: u.name || '', followers: num(u.followers), joined: u.joined ? Date.parse(u.joined) || null : null, avatar: u.avatar_url || null }; } catch { } return null; }); }
// points for one post: engagement on a log scale, capped, then weighted by the kind of post
const rawPts = p => Math.min(WK.capPerPost, 6 + 4 * Math.log1p(p.likes) + 6 * Math.log1p(p.replies) + 5 * Math.log1p(p.rts) + 2 * Math.log1p(p.views / 100)) * (WK.kind[p.kind] ?? 1);
// a worker's posts on one coin count fully once a day, then each extra post that day counts a little less; past the daily limit they count zero
function score(items) { const by = {}; for (const x of [...items].sort((a, b) => a.created - b.created)) { const k = x.wallet + ':' + new Date(x.created).toISOString().slice(0, 10); const n = by[k] = (by[k] || 0) + 1;
    x.n = n; x.pts = n > WK.postsPerDay ? 0 : +(rawPts(x) * Math.pow(WK.decay, n - 1)).toFixed(2); } return items; }
const rules = () => ({ ...WK, formula: '6 + 4·ln(1+likes) + 6·ln(1+replies) + 5·ln(1+reposts) + 2·ln(1+views/100), capped, times the kind of post' });
const mentions = (p, c) => { const t = (p.text + ' ' + (p.urls || []).join(' ')).toLowerCase(), s = String(c.symbol || '').toLowerCase();
  return (s.length >= 2 && new RegExp('\\$' + s.replace(/[^a-z0-9]/g, '') + '(?![a-z0-9])').test(t)) || t.includes(c.mint.toLowerCase()) || (c.links && c.links.website && t.includes(c.links.website.replace(/^https?:\/\//, '').toLowerCase())); };
// per-coin work list: one small file per coin, rewritten on each hand-in; a write-once marker per post stops the same post being handed in twice
async function workOf(mint) { return memo('work:' + mint, 15000, async () => score(((await readFile('work/' + mint + '.json', true)) || []).map(x => ({ ...x })))); }
function boardOf(items, since) { const by = {}; for (const x of items) { const b = by[x.wallet] = by[x.wallet] || { wallet: x.wallet, user: x.user, avatar: x.avatar || null, posts: 0, points: 0, period: 0, best: 0 };
    b.posts++; b.points += x.pts; if (x.created >= since) b.period += x.pts; b.best = Math.max(b.best, x.pts); }
  return Object.values(by).map(b => ({ ...b, points: Math.round(b.points), period: Math.round(b.period), best: Math.round(b.best) })).sort((a, b) => b.period - a.period || b.points - a.points).map((b, i) => ({ ...b, rank: i + 1 })); }
const lastPayroll = (S, mint, launchedAt) => Math.max(...S.rounds.filter(r => r.coin === mint).map(r => r.period), (launchedAt || 0) * 1000);
// linking: the wallet signs a message, then the X account posts a short code. that proves both ends belong to the same person
const verifySig = (wallet, msg, sig) => { try { const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(new PublicKey(wallet).toBytes()).toString('base64url') }, format: 'jwk' }); return crypto.verify(null, Buffer.from(msg), key, Buffer.from(String(sig), 'base64')); } catch { return false; } };
const codeOf = (wallet, user) => 'bagwrkr-' + crypto.createHash('sha256').update(wallet + ':' + user.toLowerCase() + ':' + (process.env.BAGWRKR_SALT || CFG.tag)).digest('hex').slice(0, 6);
async function linkStart(req) { const b = await body(req), wallet = pk(b.wallet, 'connect a wallet first').toBase58(), user = clean(b.user, 16).replace(/^@/, ''); if (!/^[A-Za-z0-9_]{1,15}$/.test(user)) throw new Error('that is not an X handle');
  const msg = String(b.msg || ''), m = /^bagwrkr: link @([A-Za-z0-9_]{1,15}) to ([1-9A-HJ-NP-Za-km-z]{32,44}) at (\d{13})$/.exec(msg); if (!m || m[1].toLowerCase() !== user.toLowerCase() || m[2] !== wallet) throw new Error('the signed message does not match');
  if (Math.abs(Date.now() - +m[3]) > 15 * 60e3) throw new Error('that signature is too old. sign again'); if (!verifySig(wallet, msg, b.sig)) throw new Error('the signature is not from this wallet');
  const taken = await readFile('handle/' + user.toLowerCase() + '.json', true); if (taken && taken.wallet !== wallet) throw new Error(`@${user} is already linked to another wallet`);
  const u = await readUser(user); if (u) { if (u.followers < WK.minFollowers) throw new Error(`@${user} needs at least ${WK.minFollowers} followers to clock in`); if (u.joined && Date.now() - u.joined < WK.minAccountDays * 864e5) throw new Error(`@${user} must be at least ${WK.minAccountDays} days old to clock in`); }
  const code = codeOf(wallet, user); await putFile('pend/' + wallet + '.json', JSON.stringify({ wallet, user, code, at: Date.now() }), 'application/json', true); return { user, code, text: `clocking in. ${code}` }; }
async function linkVerify(req) { const b = await body(req), wallet = pk(b.wallet, 'connect a wallet first').toBase58(), P = await readFile('pend/' + wallet + '.json', true); if (!P) throw new Error('start again: sign the link message first');
  const { id } = parsePost(b.url), p = await readPost(id); if (p.user.toLowerCase() !== P.user.toLowerCase()) throw new Error(`that post is from @${p.user}, not @${P.user}`); if (!p.text.includes(P.code)) throw new Error(`that post does not have your code (${P.code}) in it`);
  const u = (await readUser(P.user)) || { followers: p.followers, joined: p.joined, avatar: p.avatar, name: p.name };
  if (u.followers != null && u.followers < WK.minFollowers) throw new Error(`@${P.user} needs at least ${WK.minFollowers} followers`); if (u.joined && Date.now() - u.joined < WK.minAccountDays * 864e5) throw new Error(`@${P.user} must be at least ${WK.minAccountDays} days old`);
  const L = { wallet, user: p.user, name: u.name || p.name || '', avatar: u.avatar || p.avatar || null, followers: u.followers ?? null, joined: u.joined ?? null, proof: id, at: Date.now() };
  await putFile('link/' + wallet + '.json', JSON.stringify(L), 'application/json', true); await putFile('handle/' + p.user.toLowerCase() + '.json', JSON.stringify({ wallet }), 'application/json', true); cache.delete('link:' + wallet); return { linked: L }; }
const linkOf = wallet => memo('link:' + wallet, 60000, () => readFile('link/' + wallet + '.json', true));
// hand in a post: it must be from your linked account, about the coin, recent, and new
async function submitWork(req) { const b = await body(req), wallet = pk(b.wallet, 'connect a wallet first').toBase58(), L = await linkOf(wallet); if (!L) throw new Error('clock in first: link your X account to this wallet');
  const C = (await coins()).coins.find(c => c.mint === String(b.coin)); if (!C) throw new Error('pick a bagwrkr coin'); const { id } = parsePost(b.url), p = await readPost(id);
  if (p.user.toLowerCase() !== L.user.toLowerCase()) throw new Error(`that post is from @${p.user}. you are clocked in as @${L.user}`);
  if (p.created && p.created < C.at * 1000) throw new Error('that post is older than the coin'); if (p.created && Date.now() - p.created > WK.maxPostAgeHours * 3600e3) throw new Error(`hand posts in within ${Math.round(WK.maxPostAgeHours / 24)} days of posting them`);
  if (!mentions(p, C)) throw new Error(`that post does not mention $${C.symbol} or its contract address`);
  const list = (await readFile('work/' + C.mint + '.json', true)) || []; if (list.some(x => x.id === id)) throw new Error('that post is already handed in');
  try { await putFile('seen/' + id + '.json', JSON.stringify({ wallet, coin: C.mint }), 'application/json', false); } catch (e) { throw new Error('that post is already handed in'); }
  const item = { id, coin: C.mint, wallet, user: p.user, avatar: L.avatar || p.avatar || null, text: p.text.slice(0, 280), kind: p.kind, created: p.created || Date.now(), likes: p.likes, rts: p.rts, replies: p.replies, views: p.views, at: Date.now() };
  list.unshift(item); await putFile('work/' + C.mint + '.json', JSON.stringify(list.slice(0, 4000)), 'application/json', true); cache.delete('work:' + C.mint); cache.delete('coins');
  const scored = score(list.map(x => ({ ...x }))).find(x => x.id === id); feedAdd({ ...item, pts: scored.pts, symbol: C.symbol, image: C.image }).catch(() => { });
  return { item: { ...item, pts: scored.pts, n: scored.n }, breakdown: { base: 6, likes: +(4 * Math.log1p(p.likes)).toFixed(1), replies: +(6 * Math.log1p(p.replies)).toFixed(1), reposts: +(5 * Math.log1p(p.rts)).toFixed(1), views: +(2 * Math.log1p(p.views / 100)).toFixed(1), kind: WK.kind[p.kind] ?? 1, nth: scored.n, decay: +Math.pow(WK.decay, scored.n - 1).toFixed(3) } }; }
// the floor: every hand-in across all coins, newest first
async function feedAdd(x) { const F = (await readFile('feed.json', true)) || []; F.unshift(x); await putFile('feed.json', JSON.stringify(F.slice(0, 300)), 'application/json', true); cache.delete('feed'); }
const feed = () => memo('feed', 15000, async () => ({ at: Date.now(), items: (await readFile('feed.json', true)) || [] }));
async function leaders() { return memo('leaders', 60000, async () => { const C = (await coins()).coins, all = {};
  for (const c of C) for (const b of boardOf(await workOf(c.mint), c.since)) { const a = all[b.wallet] = all[b.wallet] || { wallet: b.wallet, user: b.user, avatar: b.avatar, posts: 0, points: 0, coins: 0 }; a.posts += b.posts; a.points += b.points; a.coins++; }
  const S = await scan(); return { at: Date.now(), workers: Object.values(all).sort((a, b) => b.points - a.points).slice(0, 100).map((x, i) => ({ ...x, rank: i + 1 })), rounds: S.rounds.length, paidSol: +S.rounds.reduce((a, r) => a + Number(r.lamports) / 1e9, 0).toFixed(4) }; }); }
async function me(walletStr) { const wallet = pk(walletStr, 'bad wallet').toBase58(), [L, P, C] = await Promise.all([linkOf(wallet), readFile('pend/' + wallet + '.json', true), coins()]); const work = [], slips = [];
  for (const c of C.coins) { const w = (await workOf(c.mint)).filter(x => x.wallet === wallet); for (const x of w) work.push({ ...x, symbol: c.symbol, image: c.image }); }
  const S = await scan(); for (const c of C.coins) { const f = await readFile('slips/' + c.mint + '.json', true); for (const s of f || []) { const row = (s.rows || []).find(r => r.wallet === wallet); if (row) slips.push({ coin: c.mint, symbol: c.symbol, at: s.at, start: s.start, total: s.total, ...row, onchain: S.rounds.some(r => r.coin === c.mint && r.period === s.start) }); } }
  return { wallet, linked: L, pending: !L && P ? { user: P.user, code: P.code } : null, work: work.sort((a, b) => b.created - a.created).slice(0, 200), points: Math.round(work.reduce((a, x) => a + x.pts, 0)), slips: slips.sort((a, b) => b.at - a.at) }; }
// payroll preview: who worked this period, how many points, and who still holds enough to be paid
async function period(mint, fresh) { const C = (await coins()).coins.find(c => c.mint === mint); if (!C) throw new Error('pick a bagwrkr coin'); let items = (await workOf(mint)).filter(x => x.created >= C.since).map(x => ({ ...x }));
  if (fresh) { const ids = items.slice(0, 150); for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map(async x => { try { const p = await readPost(x.id); Object.assign(x, { likes: p.likes, rts: p.rts, replies: p.replies, views: p.views }); } catch { x.gone = true; } })); items = score(items.filter(x => !x.gone)); }
  const H = await holdersOf(mint).catch(() => null), held = H ? Object.fromEntries(H.list.map(x => [x.owner, x.raw])) : null, minRaw = BigInt(Math.round(WK.minHold)) * 1000000n;
  const rows = boardOf(items, C.since).filter(b => b.period > 0).map(b => ({ ...b, holds: held ? (held[b.wallet] || 0n) >= minRaw : null, balance: held && held[b.wallet] ? Number(held[b.wallet] / 1000000n) : 0 }));
  return { coin: C.mint, symbol: C.symbol, since: C.since, posts: items.length, rows, payable: rows.filter(r => r.holds !== false), minHold: WK.minHold }; }
// payroll: SOL from the payout wallet to the coin's bagworkers, split by this period's points. a worker must still hold the coin
async function buildPayroll(req) { const b = await body(req), w = pk(b.wallet, 'connect the payout wallet'), mint = String(b.coin), total = BigInt(b.lamports || '0'); if (total <= 0n) throw new Error('nothing to pay out');
  const P = await period(mint, true), rows = P.payable.filter(r => r.wallet !== w.toBase58()), sum = rows.reduce((a, r) => a + r.period, 0); if (!sum) throw new Error('nobody who still holds the coin has worked it this period');
  const pays = rows.map(r => ({ wallet: r.wallet, user: r.user, pts: r.period, amt: total * BigInt(Math.round(r.period * 1000)) / BigInt(Math.round(sum * 1000)) })).filter(x => x.amt >= 5000n), from = Math.max(0, +b.offset || 0), slice = pays.slice(from, from + 42);
  const { blockhash } = await conn.getLatestBlockhash('confirmed'), txs = [], start = P.since;
  for (let i = 0; i < slice.length; i += 8) { const t = new Transaction(), part = slice.slice(i, i + 8); t.feePayer = w; t.recentBlockhash = blockhash;
    for (const p of part) t.add(SystemProgram.transfer({ fromPubkey: w, toPubkey: new PublicKey(p.wallet), lamports: p.amt }));
    t.add(memoIx(`bagwrkr:payroll:${mint}:${start}:${part.length}:${part.reduce((a, p) => a + p.amt, 0n)}`), tagIx(w)); txs.push(t.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')); }
  if (!b.simulate && from === 0) { const f = (await readFile('slips/' + mint + '.json', true)) || []; f.unshift({ at: Date.now(), start, total: total.toString(), rows: pays.map(p => ({ wallet: p.wallet, user: p.user, pts: p.pts, lamports: p.amt.toString() })) }); await putFile('slips/' + mint + '.json', JSON.stringify(f.slice(0, 200)), 'application/json', true).catch(() => { }); }
  cache.delete('scan'); return { txs, workers: pays.length, next: from + slice.length < pays.length ? from + slice.length : null, rows: pays.map(p => ({ ...p, amt: p.amt.toString() })) }; }

// ---------------------------------------------------------------- a launch: the coin, its curve, its card
async function buildLaunch(req) { const b = await body(req), wallet = pk(b.wallet, 'connect a wallet first');
  const name = clean(b.name, 32), symbol = clean(b.symbol, 10).toUpperCase().replace(/[^A-Z0-9]/g, ''), desc = clean(b.desc, 400);
  if (name.length < 2) throw new Error('give the coin a name'); if (symbol.length < 2) throw new Error('give the coin a ticker (2 to 10 letters or numbers)');
  const image = link(b.image, null, 'image'); if (!image) throw new Error('add an image');
  const links = { website: link(b.website, null, 'website'), x: link(b.x, /^https:\/\/(x|twitter)\.com\//, 'X link', 'https://x.com/'), telegram: link(b.telegram, /^https:\/\/t\.me\//, 'Telegram link', 'https://t.me/') };
  const sol = await solUsd(); const openUsd = +b.openUsd || CFG.openDefault; if (!CFG.openUsd.includes(openUsd)) throw new Error('the open is $8K, $9K, $10K or $11K'); if (!(sol > 0)) throw new Error('could not read the SOL price. try again in a moment');
  const { cfg } = await chain(), c = curveOf(openUsd / sol, RUN), minRaise = +cfg.minFundRaisingB.toString() / 1e9, minSold = +cfg.minSellRateA.toString() / PPM, maxSold = 1 - +cfg.minMigrateRateA.toString() / PPM;
  if (c.raise < minRaise) throw new Error(`LaunchLab's minimum raise is ${minRaise} SOL; this curve raises ${c.raise.toFixed(1)}`); if (c.sold < minSold || c.sold > maxSold) throw new Error('that curve sells too little or too much of the supply');
  const sell = new BN(String(Math.floor(c.sold * 1e9) * 1e6)), raise = new BN(String(Math.round(c.raise * 1e9)));
  const buySol = Math.max(0, +b.buySol || 0); if (buySol > Math.min(CFG.maxFirstBuySol, c.raise / 2)) throw new Error(`the first buy can be up to ${Math.min(CFG.maxFirstBuySol, c.raise / 2).toFixed(1)} SOL`);
  const bal = await conn.getBalance(wallet).catch(() => null); if (bal != null && bal < (buySol + 0.03) * 1e9) throw new Error(`your wallet needs about ${(buySol + 0.03).toFixed(2)} SOL for this launch`);
  let padId = RAYDIUM_PLATFORM; if (PIN.pad) { padId = pk(PIN.pad, 'bad launchpad'); const pa = await conn.getAccountInfo(padId); if (!pa || !pa.owner.equals(PROGRAM)) throw new Error('the bagwrkr launchpad could not be read'); }
  const meta = { name, symbol, description: (desc ? desc + ' ' : '') + 'Launched on bagwrkr: work the bag, get paid for it.', image, ...(links.website && { website: links.website }), ...(links.x && { twitter: links.x }), ...(links.telegram && { telegram: links.telegram }), createdOn: 'bagwrkr' };
  const js = JSON.stringify(meta), uri = await putFile(`meta/${crypto.createHash('sha256').update(js).digest('hex').slice(0, 24)}.json`, js, 'application/json'); if (uri.length > 200) throw new Error('metadata link too long');
  const mint = Keypair.generate(), raydium = await sdk(wallet);
  const { transactions, extInfo } = await raydium.launchpad.createLaunchpad({ programId: PROGRAM, mintA: mint.publicKey, decimals: 6, name, symbol, uri, migrateType: 'cpmm', configId: CONFIG, configInfo: cfg, mintBDecimals: 9, platformId: padId,
    txVersion: R.TxVersion.LEGACY, slippage: new BN(100), buyAmount: new BN(Math.round(buySol * 1e9)), createOnly: buySol === 0, supply: SUPPLY, totalSellA: sell, totalFundRaisingB: raise, totalLockedAmount: new BN(0), cliffPeriod: new BN(0), unlockPeriod: new BN(0),
    extraSigners: [mint], feePayer: wallet, computeBudgetConfig: { units: 600000, microLamports: 60000 } });
  const r = await finish(transactions, wallet, [mint], [memoIx(`bagwrkr:launch:${mint.publicKey.toBase58()}`), tagIx(wallet)], !!b.simulate);
  const pool = (extInfo && extInfo.address && extInfo.address.poolId && extInfo.address.poolId.toBase58()) || R.getPdaLaunchpadPoolId(PROGRAM, mint.publicKey, WSOL).publicKey.toBase58();
  const card = { mint: mint.publicKey.toBase58(), pool, name, symbol, image, desc, links, creator: wallet.toBase58(), openUsd, gradUsd: openUsd * RUN, raiseSol: +c.raise.toFixed(3), sold: +c.sold.toFixed(4), pad: PIN.pad || null, built: Date.now() };
  if (!b.simulate) await putFile('coin/' + card.mint + '.json', JSON.stringify(card), 'application/json');
  return { mint: card.mint, pool, uri, curve: { openUsd, gradUsd: openUsd * RUN, raiseSol: c.raise, sold: c.sold, startSol: c.startSol }, ...r }; }

async function status() { const [C, S, sol] = await Promise.all([coins().catch(() => null), scan().catch(() => null), solUsd().catch(() => null)]); let p = null; if (PIN.pad) p = await pad(new URLSearchParams({ id: PIN.pad })).catch(() => null);
  return { name: CFG.name, tag: TAG.toBase58(), pad: PIN.pad, padInfo: p, payoutsLive: !!(p && p.exists), feePct: CFG.feePct, open: CFG.openUsd, openDefault: CFG.openDefault, run: RUN, storage: hasStore(), sol, coins: C ? C.coins.length : null, rounds: S ? S.rounds.length : null,
    paidSol: S ? +S.rounds.reduce((a, r) => a + Number(r.lamports) / 1e9, 0).toFixed(4) : null, posts: C ? C.coins.reduce((a, c) => a + c.posts, 0) : null, workers: C ? new Set([].concat(...await Promise.all(C.coins.map(c => workOf(c.mint).then(w => w.map(x => x.wallet)).catch(() => []))))).size : null, maxFirstBuySol: CFG.maxFirstBuySol, rules: rules() }; }

module.exports = async (req, res) => { const q = new URL(req.url, 'http://x').searchParams, a = q.get('a'); if (req.method === 'GET') res.setHeader('access-control-allow-origin', '*');
  try {
    if (a === 'status') return out(res, 200, await status(), 's-maxage=15, stale-while-revalidate=60');
    if (a === 'coins') return out(res, 200, await coins(), 's-maxage=10, stale-while-revalidate=40');
    if (a === 'coin') return out(res, 200, await coin(String(q.get('mint'))), 's-maxage=8, stale-while-revalidate=30');
    if (a === 'candles') return out(res, 200, await candles(String(q.get('mint'))), 's-maxage=20, stale-while-revalidate=60');
    if (a === 'wallet') return out(res, 200, await walletView(q.get('addr')));
    if (a === 'holders') { const h = await holdersOf(q.get('mint')), sum = h.list.reduce((s, x) => s + x.raw, 0n); return out(res, 200, { full: h.full, count: h.list.length, top: h.list.slice(0, 20).map(x => ({ owner: x.owner, pct: sum ? Number(x.raw * 10000n / sum) / 100 : 0 })) }, 's-maxage=30'); }
    if (a === 'rounds') return out(res, 200, { rounds: (await scan()).rounds }, 's-maxage=20');
    if (a === 'pad') return out(res, 200, await pad(q), 's-maxage=10');
    if (a === 'feed') return out(res, 200, await feed(), 's-maxage=8, stale-while-revalidate=30');
    if (a === 'leaders') return out(res, 200, await leaders(), 's-maxage=30, stale-while-revalidate=120');
    if (a === 'me') return out(res, 200, await me(q.get('wallet')));
    if (a === 'period') return out(res, 200, await period(String(q.get('mint')), q.get('fresh') === '1'), 's-maxage=15');
    if (a === 'preview') { const { id } = parsePost(q.get('url')), p = await readPost(id); return out(res, 200, { id, user: p.user, kind: p.kind, likes: p.likes, rts: p.rts, replies: p.replies, views: p.views, created: p.created, pts: +rawPts(p).toFixed(2), text: p.text.slice(0, 280) }, 's-maxage=60'); }
    if (req.method === 'POST' && a === 'img') return out(res, 200, await img(req));
    if (req.method === 'POST' && a === 'buildLaunch') return out(res, 200, await buildLaunch(req));
    if (req.method === 'POST' && a === 'buildPad') return out(res, 200, await buildPad(req));
    if (req.method === 'POST' && a === 'claim') return out(res, 200, await claim(req));
    if (req.method === 'POST' && a === 'linkStart') return out(res, 200, await linkStart(req));
    if (req.method === 'POST' && a === 'linkVerify') return out(res, 200, await linkVerify(req));
    if (req.method === 'POST' && a === 'work') return out(res, 200, await submitWork(req));
    if (req.method === 'POST' && a === 'buildPayroll') return out(res, 200, await buildPayroll(req));
    if (req.method === 'POST' && a === 'send') return out(res, 200, await sendTxs(req));
    return out(res, 404, { error: 'unknown action' });
  } catch (e) { return out(res, 400, { error: e.message || String(e) }); } };
module.exports._t = { readPost, readUser, boardOf, coins, coin, scan, score, rawPts, mentions, parsePost, verifySig, codeOf, curveOf, buildLaunch, buildPad, claim, buildPayroll, conn, cache, setChain: v => { chainCache = { t: Date.now() + 1e9, v }; } };
