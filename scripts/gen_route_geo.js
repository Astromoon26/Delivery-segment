#!/usr/bin/env node
/**
 * Generator geometri rute (jalan nyata + jalur laut) untuk index.html  ->  rute-geo/*.json
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/gen_route_geo.js [--csv <dir>] [--cache <file>] [--only-miss] [--dry]
 *
 * Cara kerja:
 *  1. Buka dashboard di Chromium headless dengan data master (gviz live, atau --csv <dir> berisi 8 CSV tab master),
 *     render rute SEMUA kab/kota (HCI & AHI, Opsional & Project tampil) lalu baca `GEO_MISS` = daftar leg yang belum ada geometrinya.
 *  2. Leg darat  -> OSRM (router.project-osrm.org, ~1 request/dtk, hormati fair use), disederhanakan (RDP) lalu di-encode polyline 1e-4.
 *     Leg yang tidak punya jalan (beda pulau / NoRoute / jalan > 1,7x garis lurus) otomatis jadi jalur laut.
 *  3. Leg laut   -> truk ke pelabuhan (OSRM) + jalur laut (A* di grid 0,05 derajat dari polygon daratan dashboard, menjauh dari pantai) + truk dari pelabuhan.
 *     Jalur laut = PERKIRAAN (bukan data pelayaran). Pelabuhan = titik laut terdekat dari fasilitas, kecuali ada di PORTS di bawah.
 *  4. Tulis rute-geo/fac.json (leg antar fasilitas) dan rute-geo/dest-<area>.json (leg terakhir ke kab/kota). Entri yang sudah ada dipertahankan
 *     (cache) -> menjalankan ulang hanya menghitung leg yang baru. Hapus rute-geo/ untuk menghitung ulang semuanya.
 * Jalankan ulang tiap kali fasilitas pindah / ada leg baru di master data.
 */
const { spawn, execFileSync } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
let chromium; try { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };
const ROOT = path.join(__dirname, '..'), OUTDIR = path.join(ROOT, 'rute-geo');
const CACHE = arg('cache', path.join(os.tmpdir(), 'rute-geo-cache.json'));
const DRY = !!arg('dry', false);
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const BUS = ['HCI', 'AHI'];
const MASTER_ID = '13Kr-zyhnwBruBEmHwhi3dTh5bXEpJgBiwY5hpFtjybk';
const TABS = { 'Master Kab-Kota': 'Master_Kab-Kota', 'Master Fasilitas': 'Master_Fasilitas', 'Coverage': 'Coverage', 'Rantai Hub': 'Rantai_Hub', 'Leg': 'Leg', 'Tarif': 'Tarif', 'Rute': 'Rute', 'Armada': 'Armada' };

// pelabuhan yang dipakai kalau fasilitas berada dekat titik `at` (lon,lat); selain itu pakai titik laut terdekat
const PORTS = [
  { at: [107.15, -6.31], port: [106.885, -6.07] },    // NDC Jakarta (Cikarang) -> Tanjung Priok
  { at: [112.72, -7.45], port: [112.725, -7.205] },   // NDC Sidoarjo -> Tanjung Perak
  { at: [98.75, 3.53], port: [98.69, 3.787] },        // Tamora / Medan -> Belawan
];
const PORT_RADIUS = 0.45;

// daratan negara tetangga (kasar) supaya jalur laut tidak memotongnya; polygon kab/kota Indonesia datang dari dashboard
const EXTRA_LAND = [
  [[100.3, 6.4], [100.35, 5.4], [100.5, 4.3], [101.0, 3.3], [101.4, 2.85], [102.2, 2.1], [103.3, 1.45], [103.55, 1.3], [104.05, 1.4], [104.3, 1.8], [103.5, 2.6], [103.45, 3.6], [103.25, 4.6], [102.3, 6.1], [101.0, 7.0], [100.3, 7.0]],   // semenanjung Malaysia + Singapura
  [[109.6, 1.8], [109.7, 2.0], [111.2, 2.9], [113.0, 3.3], [114.8, 4.8], [115.5, 5.3], [116.7, 6.9], [117.7, 6.3], [118.2, 5.8], [119.3, 5.2], [118.1, 4.2], [117.7, 3.7], [117.7, 1.8], [115.6, 1.8], [115.6, 1.0], [110.0, 1.0]],                                              // Sarawak (sampai batas selatannya), Brunei, Sabah
  [[124.95, -9.35], [124.96, -8.85], [125.4, -8.3], [126.9, -8.45], [127.35, -8.4], [127.0, -8.95], [126.2, -9.25], [125.1, -9.55]],                                                                                                         // Timor Leste
  [[141.0, -2.6], [141.0, -9.1], [143.5, -8.3], [147.0, -6.0], [148.0, -5.5], [148.0, -3.0], [145.0, -3.8], [143.0, -3.2]]                                                                                                                  // Papua Nugini
];
const GRID = { X0: 94, Y0: 7, D: 0.05, W: 960, H: 380 };   // lon 94..142, lat 7..-12

// ---------- util ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hav = (a, b) => { const R = 6371, t = x => x * Math.PI / 180, dLa = t(b[1] - a[1]), dLo = t(b[0] - a[0]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a[1])) * Math.cos(t(b[1])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
function decodePoly(s, prec) { const f = 10 ** prec, out = []; let i = 0, lat = 0, lng = 0; while (i < s.length) { let b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lat += (r & 1) ? ~(r >> 1) : (r >> 1); sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lng += (r & 1) ? ~(r >> 1) : (r >> 1); out.push([lat / f, lng / f]); } return out; }
function encodePoly(pts) { let pl = 0, pg = 0, s = ''; const enc = v => { v = v < 0 ? ~(v << 1) : v << 1; let o = ''; while (v >= 32) { o += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } return o + String.fromCharCode(v + 63); }; for (const [la, lo] of pts) { const a = Math.round(la * 1e4), b = Math.round(lo * 1e4); s += enc(a - pl) + enc(b - pg); pl = a; pg = b; } return s; }
// Ramer-Douglas-Peucker (titik [lat,lng]), toleransi dalam derajat
function rdp(p, tol) {
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st = [[0, p.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1; const [ay, ax] = p[a], [by, bx] = p[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const [y, x] = p[i]; let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy)); if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
const polyKm = p => { let k = 0; for (let i = 1; i < p.length; i++) k += hav([p[i - 1][1], p[i - 1][0]], [p[i][1], p[i][0]]); return k; };

// ---------- OSRM ----------
let lastReq = 0;
async function osrmRoute(a, b) {   // a,b = [lon,lat]; hasil {pts:[[lat,lng]], snapA:[lon,lat], snapB:[lon,lat], km} | null (NoRoute)
  const url = `${OSRM}/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=polyline&continue_straight=false`;
  for (let t = 0; t < 5; t++) {
    const w = 1050 - (Date.now() - lastReq); if (w > 0) await sleep(w); lastReq = Date.now();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'delivery-segment-geo-generator (internal dashboard)' } });
      if (r.status === 429 || r.status >= 500) { await sleep(2500 * (t + 1)); continue; }
      const j = await r.json();
      if (j.code === 'NoRoute' || j.code === 'NoSegment') return null;
      if (j.code !== 'Ok' || !j.routes || !j.routes[0]) return null;
      const rt = j.routes[0];
      return { pts: decodePoly(rt.geometry, 5), snapA: j.waypoints[0].location, snapB: j.waypoints[1].location, km: rt.distance / 1000 };
    } catch (e) { await sleep(2000 * (t + 1)); }
  }
  return undefined;   // gagal jaringan (jangan di-cache)
}

// ---------- jalur laut (A* di grid daratan) ----------
function makeSea(maskB64) {
  const { W, H, X0, Y0, D } = GRID, mask = Buffer.from(maskB64, 'base64'), N = W * H;
  // perairan yang tidak tersambung ke samudra (danau, atau lubang karena kab/kota tanpa polygon di sumber, mis. Pegunungan Arfak) dianggap daratan
  { const seed = Math.floor((Y0 + 5) / D) * W + Math.floor((125 - X0) / D), seen = new Uint8Array(N), st = [seed]; seen[seed] = 1;   // Laut Banda
    while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (!seen[j] && !mask[j]) { seen[j] = 1; st.push(j); } } }
    let filled = 0; for (let i = 0; i < N; i++) if (!mask[i] && !seen[i]) { mask[i] = 1; filled++; } console.log('perairan terkurung dianggap daratan:', filled, 'sel'); }
  const clr = new Uint8Array(N);                       // jarak (sel) ke daratan, maks 255; 0 = darat
  for (let i = 0; i < N; i++) clr[i] = mask[i] ? 0 : 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!clr[i]) continue; let m = clr[i]; if (x > 0) m = Math.min(m, clr[i - 1] + 1); if (y > 0) m = Math.min(m, clr[i - W] + 1); if (x > 0 && y > 0) m = Math.min(m, clr[i - W - 1] + 1); if (x < W - 1 && y > 0) m = Math.min(m, clr[i - W + 1] + 1); clr[i] = Math.min(255, m); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!clr[i]) continue; let m = clr[i]; if (x < W - 1) m = Math.min(m, clr[i + 1] + 1); if (y < H - 1) m = Math.min(m, clr[i + W] + 1); if (x < W - 1 && y < H - 1) m = Math.min(m, clr[i + W + 1] + 1); if (x > 0 && y < H - 1) m = Math.min(m, clr[i + W - 1] + 1); clr[i] = Math.min(255, m); }
  const cell = (lon, lat) => { const x = Math.floor((lon - X0) / D), y = Math.floor((Y0 - lat) / D); return (x < 0 || y < 0 || x >= W || y >= H) ? -1 : y * W + x; };
  const lonlat = i => [X0 + ((i % W) + 0.5) * D, Y0 - (Math.floor(i / W) + 0.5) * D];
  const isSea = i => i >= 0 && clr[i] > 0;
  const nearestSea = (lon, lat, minClr = 1) => {   // cincin pencarian dari sel titik
    const c = cell(lon, lat); if (c < 0) return -1; const cx = c % W, cy = Math.floor(c / W);
    for (let r = 0; r < 200; r++) { let best = -1, bd = 1e9; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (clr[i] >= minClr && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = i; } } if (best >= 0) return best; }
    return -1;
  };
  const mult = c => c >= 6 ? 1 : [0, 4.5, 2.6, 1.9, 1.45, 1.2][c];
  function astar(s, g) {
    const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; const push = (k, i) => { heap.push([k, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let c = 0; for (;;) { let a = 2 * c + 1, b = a + 1, m = c; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return t; };
    const gx = g % W, gy = Math.floor(g / W), hh = i => Math.hypot((i % W) - gx, Math.floor(i / W) - gy);
    gs[s] = 0; push(hh(s), s);
    while (heap.length) {
      const [, i] = pop(); if (closed[i]) continue; closed[i] = 1; if (i === g) break;
      const x = i % W, y = Math.floor(i / W);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (clr[j] === 0 || closed[j]) continue;
        if (dx && dy && (clr[y * W + nx] === 0 || clr[ny * W + x] === 0)) continue;   // jangan memotong sudut daratan
        const ng = gs[i] + (dx && dy ? 1.414 : 1) * mult(clr[j]); if (ng < gs[j]) { gs[j] = ng; from[j] = i; push(ng + hh(j), j); }
      }
    }
    if (from[g] < 0 && s !== g) return null;
    const out = []; for (let i = g; i !== -1; i = from[i]) { out.push(i); if (i === s) break; } return out.reverse();
  }
  const clearLine = (a, b, need) => { const ax = a % W, ay = Math.floor(a / W), bx = b % W, by = Math.floor(b / W), n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2 || 1; for (let k = 0; k <= n; k++) { const x = Math.round(ax + (bx - ax) * k / n), y = Math.round(ay + (by - ay) * k / n); if (clr[y * W + x] < need) return false; } return true; };
  function smooth(path) {   // string pulling: lompati sel antara selama garis lurus tetap >= 2 sel dari daratan
    const out = [path[0]]; let i = 0;
    while (i < path.length - 1) { let j = path.length - 1; while (j > i + 1 && !clearLine(path[i], path[j], 2)) j--; out.push(path[j]); i = j; }
    return out;
  }
  return { cell, lonlat, isSea, nearestSea, astar, smooth, clr };
}

const parse0 = k => { const m = /^[ls]:(-?[\d.]+),(-?[\d.]+)>(-?[\d.]+),(-?[\d.]+)$/.exec(k); return m && [[+m[1], +m[2]], [+m[3], +m[4]]]; };
// ---------- utama ----------
(async () => {
  // server statis untuk repo
  const srv = spawn('python3', ['-m', 'http.server', '0', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server timeout')), 8000); const on = d => { const m = /port (\d+)/.exec(String(d)); if (m) { clearTimeout(t); res(+m[1]); } }; srv.stdout.on('data', on); srv.stderr.on('data', on); });
  const csvDir = arg('csv', null); let dir = csvDir;
  if (!dir) {   // tarik live lewat curl (proxy lingkungan)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-'));
    for (const [tab, f] of Object.entries(TABS)) execFileSync('curl', ['-s', '-m', '60', '-G', `https://docs.google.com/spreadsheets/d/${MASTER_ID}/gviz/tq`, '--data-urlencode', 'tqx=out:csv', '--data-urlencode', 'sheet=' + tab, '-o', path.join(dir, f + '.csv')]);
  }
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.route('**/gviz/tq**', r => { const n = TABS[new URL(r.request().url()).searchParams.get('sheet')]; r.fulfill({ status: 200, contentType: 'text/csv', body: n ? fs.readFileSync(path.join(dir, n + '.csv'), 'utf8') : '' }); });
  await page.route('**/server.arcgisonline.com/**', r => r.abort()); await page.route('**/tile.openstreetmap.org/**', r => r.abort());
  await page.route('**/rute-geo/**', r => r.fulfill({ status: 404, body: '' }));   // kumpulkan SEMUA leg (abaikan geometri yang sudah ada)
  await page.goto(`http://127.0.0.1:${port}/index.html`); await page.waitForFunction(() => /Update:/.test(document.getElementById('last-updated').textContent), null, { timeout: 120000 });
  await page.waitForTimeout(1500);

  // 1) kumpulkan leg yang dibutuhkan
  const need = new Map();
  for (const bu of BUS) {
    await page.click(`.bu-btn[data-bu="${bu}"]`); await page.waitForTimeout(2500);
    const got = await page.evaluate(() => {
      SEG_VIS.opsional = SEG_VIS.project = true; GEO_MISS.clear(); const n = Object.values(COVERAGE[currentBU]).length; let i = 0, err = 0;
      for (const c of Object.values(COVERAGE[currentBU])) { try { renderSegmentRoute(c, { keepView: true }); i++; } catch (e) { err++; } }
      return { bu: currentBU, n, ok: i, err, miss: [...GEO_MISS.entries()] };
    });
    console.log(`BU ${got.bu}: ${got.ok}/${got.n} kab/kota dirender, error ${got.err}, leg unik ${got.miss.length}`);
    for (const [k, v] of got.miss) need.set(k, v);
  }
  console.log('total leg unik (HCI+AHI):', need.size, ' laut:', [...need.values()].filter(v => v.mode === 'sea').length);

  // 2) peta daratan untuk jalur laut
  const maskB64 = await page.evaluate(({ G, EXTRA }) => {
    const { W, H, X0, Y0, D } = G, m = new Uint8Array(W * H);
    const fill = rings => {   // even-odd scanline satu polygon (semua ring)
      const rows = new Map();
      for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j], [x2, y2] = ring[i]; if (y1 === y2) continue;
        const ymin = Math.min(y1, y2), ymax = Math.max(y1, y2), j0 = Math.max(0, Math.ceil((Y0 - ymax) / D - 0.5)), j1 = Math.min(H - 1, Math.floor((Y0 - ymin) / D - 0.5));
        for (let r = j0; r <= j1; r++) { const lat = Y0 - (r + 0.5) * D; if ((y1 <= lat) !== (y2 <= lat)) { const x = x1 + (lat - y1) * (x2 - x1) / (y2 - y1); (rows.get(r) || rows.set(r, []).get(r)).push(x); } }
      }
      for (const [r, xs] of rows) { xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.max(0, Math.ceil((xs[k] - X0) / D - 0.5)), b = Math.min(W - 1, Math.floor((xs[k + 1] - X0) / D - 0.5)); for (let x = a; x <= b; x++) m[r * W + x] = 1; } }
    };
    choroGeo.eachLayer(l => { const g = l.feature && l.feature.geometry; if (!g) return; (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(fill); });
    EXTRA.forEach(poly => fill([poly]));
    let s = ''; const CH = 0x8000; for (let i = 0; i < m.length; i += CH) s += String.fromCharCode.apply(null, m.subarray(i, i + CH));
    return btoa(s);
  }, { G: GRID, EXTRA: EXTRA_LAND });
  const sea = makeSea(maskB64);
  let landCells = 0; { const b = Buffer.from(maskB64, 'base64'); for (const v of b) landCells += v; console.log('sel daratan:', landCells, 'dari', b.length); }
  await browser.close(); srv.kill();
  if (arg('count', false)) {   // hanya ringkasan kebutuhan leg (tanpa OSRM)
    const by = {}; for (const v of need.values()) { const s = v.shard + '/' + v.mode; by[s] = (by[s] || 0) + 1; } console.log(by);
    const seaLegs = [...need.entries()].filter(([, v]) => v.mode === 'sea'); console.log('contoh leg laut:'); seaLegs.slice(0, 40).forEach(([k, v]) => console.log(' ', k, v.shard));
    let km = 0; for (const [k] of need) { const ab = parse0(k); if (ab) km += hav(ab[0], ab[1]); } console.log('jarak garis lurus total (km):', Math.round(km)); process.exit(0);
  }

  // 3) hitung geometri
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
  // gabungkan rute-geo yang sudah ada ke cache (supaya tidak menghitung ulang)
  if (fs.existsSync(OUTDIR)) for (const f of fs.readdirSync(OUTDIR)) if (f.endsWith('.json')) { try { const j = JSON.parse(fs.readFileSync(path.join(OUTDIR, f), 'utf8')); for (const [k, v] of Object.entries(j)) if (!cache[k]) cache[k] = { ...v, shard: f.replace(/\.json$/, '') }; } catch {} }
  const portFor = ll => { for (const p of PORTS) if (Math.hypot(p.at[0] - ll[0], p.at[1] - ll[1]) < PORT_RADIUS) return p.port; return null; };
  const parse = k => { const m = /^[ls]:(-?[\d.]+),(-?[\d.]+)>(-?[\d.]+),(-?[\d.]+)$/.exec(k); return m && [[+m[1], +m[2]], [+m[3], +m[4]]]; };   // -> [lon,lat] a, b
  let nRoad = 0, nSea = 0, nFail = 0, nSkip = 0, nCached = 0;
  const todo = [...need.entries()].filter(([k]) => { if (cache[k]) { nCached++; return false; } return true; });
  console.log(`cache: ${nCached} leg sudah ada, ${todo.length} perlu dihitung`);
  const saveCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache));

  // jalur laut a -> b (lon,lat) dengan truk ke/dari pelabuhan; kembalikan {r:[...]} atau null
  async function seaLeg(a, b) {
    const pa = portFor(a), pb = portFor(b);
    const sa = sea.nearestSea(pa ? pa[0] : a[0], pa ? pa[1] : a[1], 3), sb = sea.nearestSea(pb ? pb[0] : b[0], pb ? pb[1] : b[1], 3);
    if (sa < 0 || sb < 0) { console.log('  jalur laut gagal: tidak ada sel laut dekat', sa < 0 ? 'asal' : 'tujuan', a, b); return null; }
    const path = sea.astar(sa, sb); if (!path) { console.log('  jalur laut gagal: A* tidak menemukan jalur', sea.lonlat(sa), sea.lonlat(sb), 'asal', a, 'tujuan', b); return null; }
    let pts = sea.smooth(path).map(i => { const [lo, la] = sea.lonlat(i); return [la, lo]; });
    pts = rdp(pts, 0.02);
    const runs = [];
    // truk dari fasilitas ke pelabuhan (kalau fasilitas di darat)
    const landA = sea.clr[sea.cell(a[0], a[1])] === 0, landB = sea.clr[sea.cell(b[0], b[1])] === 0;
    const portA = pa || sea.lonlat(sa), portB = pb || sea.lonlat(sb);
    let seaStart = pts[0], seaEnd = pts[pts.length - 1], startPts = [], endPts = [];
    if (landA && hav(a, portA) > 1) { const t = await osrmRoute(a, portA); if (t) { runs.push(['l', rdp(t.pts, 0.0005)]); startPts = [[t.snapB[1], t.snapB[0]]]; } else if (t === undefined) return undefined; }
    let tail = null;
    if (landB && hav(b, portB) > 1) { const t = await osrmRoute(portB, b); if (t) { tail = ['l', rdp(t.pts, 0.0005)]; endPts = [[t.snapA[1], t.snapA[0]]]; } else if (t === undefined) return undefined; }
    runs.push(['s', [...startPts, ...pts, ...endPts]]);
    if (tail) runs.push(tail);
    return { r: runs.map(([m, p]) => [m, encodePoly(p)]), n: pts.length };
  }

  let done = 0; const t0 = Date.now();
  for (const [k, v] of todo) {
    const ab = parse(k); if (!ab) { nFail++; continue; } const [a, b] = ab; let entry = null;
    const d = hav(a, b);
    if (v.mode === 'sea') { entry = await seaLeg(a, b); if (entry === undefined) { nFail++; continue; } if (entry) nSea++; }
    else {
      // praperiksa: garis lurus yang >50% laut dan > 120 km hampir pasti tidak punya jalan -> langsung jalur laut (hemat request OSRM)
      let seaFrac = 0; { const n = Math.max(2, Math.ceil(d / 5)); let s = 0; for (let i = 0; i <= n; i++) { const c = sea.cell(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n); if (c >= 0 && sea.clr[c] > 0) s++; } seaFrac = s / (n + 1); }
      let road = null;
      if (!(d > 120 && seaFrac > 0.5)) {
        const rt = await osrmRoute(a, b); if (rt === undefined) { nFail++; continue; }
        if (rt && rt.km <= 1.7 * d + 25) road = rt;
      } else nSkip++;
      if (road) { entry = { r: [['l', encodePoly(rdp(road.pts, 0.0005))]], km: Math.round(road.km), snap: Math.round(Math.max(hav(a, road.snapA), hav(b, road.snapB)) * 10) / 10 }; nRoad++; }
      else { entry = await seaLeg(a, b); if (entry === undefined) { nFail++; continue; } if (entry) { entry.noroad = 1; nSea++; } }
    }
    cache[k] = entry ? { ...entry, shard: v.shard } : { x: 1, shard: v.shard };   // x = tidak bisa dihitung (jatuh ke garis lurus)
    if (++done % 25 === 0) { saveCache(); const el = (Date.now() - t0) / 1000; console.log(`  ${done}/${todo.length}  jalan ${nRoad} laut ${nSea} lewati ${nSkip} gagal ${nFail}  ${Math.round(el)}s  sisa ~${Math.round(el / done * (todo.length - done) / 60)} mnt`); }
  }
  saveCache();
  console.log(`selesai: jalan ${nRoad}, laut ${nSea}, lewati-OSRM ${nSkip}, gagal jaringan ${nFail}`);

  // 4) tulis shard (hanya leg yang masih dipakai master sekarang)
  const shards = {};
  for (const [k, v] of need) { const e = cache[k]; if (!e || e.x) continue; const s = v.shard; (shards[s] = shards[s] || {})[k] = { r: e.r }; }
  if (DRY) { console.log('--dry: tidak menulis file'); return; }
  fs.rmSync(OUTDIR, { recursive: true, force: true }); fs.mkdirSync(OUTDIR, { recursive: true });
  let total = 0;
  for (const [s, o] of Object.entries(shards)) { const txt = JSON.stringify(o); fs.writeFileSync(path.join(OUTDIR, s + '.json'), txt); total += txt.length; console.log(`rute-geo/${s}.json  ${Object.keys(o).length} leg  ${(txt.length / 1024).toFixed(0)} KB`); }
  console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
  const noGeo = [...need.keys()].filter(k => !cache[k] || cache[k].x); if (noGeo.length) console.log(`${noGeo.length} leg tanpa geometri (jatuh ke garis lurus), contoh:`, noGeo.slice(0, 5));
})().catch(e => { console.error(e); process.exit(1); });
