#!/usr/bin/env node
/**
 * Smoke test dashboard (headless Chromium). Jalankan SETIAP habis edit index.html.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/smoke_test.js [--out shots] [--url http://...]
 *
 * Tanpa --url: script menyalakan server statis lokal untuk folder repo.
 * Exit code 1 kalau ada assertion gagal. Screenshot disimpan di --out (default ./.smoke).
 * Jangan jalankan `playwright install` — Chromium sudah ada di /opt/pw-browsers.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const OUT = arg('out', path.join(__dirname, '..', '.smoke'));
const ROOT = path.join(__dirname, '..');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };

(async () => {
  let server, url = arg('url');
  if (!url) {
    const port = 8800 + Math.floor(Math.random() * 100);
    server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: ROOT, stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1000));
    url = `http://localhost:${port}/index.html`;
  }
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true })).newPage();
  const pageErrors = [], dialogs = [], tileHosts = {}, badHttp = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  page.on('response', r => {
    const u = r.url();
    if (/arcgisonline|cartocdn|openstreetmap/.test(u)) { const h = new URL(u).host; tileHosts[h] = (tileHosts[h] || 0) + 1; }
    if (r.status() >= 400 && !/favicon/.test(u)) badHttp.push(r.status() + ' ' + u.slice(0, 100));
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3500);

  // --- load & errors
  check('tidak ada JS error / alert', pageErrors.length === 0 && dialogs.length === 0, [...pageErrors, ...dialogs].join(' | '));
  check('tidak ada HTTP >= 400', badHttp.length === 0, badHttp.slice(0, 3).join(' | '));

  // --- basemap (CARTO sekarang minta API key -> watermark; jangan balik ke sana)
  check('basemap bukan CARTO (butuh API key)', !Object.keys(tileHosts).some(h => /cartocdn/.test(h)), JSON.stringify(tileHosts));
  check('tile basemap termuat', Object.values(tileHosts).reduce((a, b) => a + b, 0) > 0);

  // --- ringkasan
  const total = await page.$eval('#summary-grid', e => e.innerText.replace(/\s+/g, ' '));
  const nKab = parseInt((total.match(/TOTAL KAB\/KOTA\s+(\d+)/i) || [])[1] || '0', 10);
  check('total kab/kota >= 510', nKab >= 510, `terbaca ${nKab}`);
  await page.screenshot({ path: path.join(OUT, '1_peta.png') });

  // --- tabel + hub feeder
  await page.click('.tab[data-tab="table"]');
  await page.fill('#table-search', 'dumai'); await page.waitForTimeout(500);
  const dumai = await page.$$eval('#table-body tr', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  check('tabel: Dumai tampil "via Pekanbaru" (hub-to-hub)', dumai.length > 0 && dumai.every(t => /via Pekanbaru/.test(t)), `${dumai.length} baris`);
  await page.fill('#table-search', ''); await page.waitForTimeout(400);
  const nRows = await page.$$eval('#table-body tr', r => r.length);
  check('tabel: >= 510 baris', nRows >= 510, `${nRows}`);
  await page.screenshot({ path: path.join(OUT, '2_tabel.png') });

  // --- delivery segment + perbandingan
  await page.click('.tab[data-tab="segment"]');
  await page.fill('#seg-search-input', 'Kota Dumai'); await page.waitForTimeout(400);
  await page.click('#seg-ac-list .autocomplete-item'); await page.waitForTimeout(1200);
  const cmp = await page.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('segmen Dumai: blok Perbandingan Rute (Direct NDC vs Reguler rute)', /Direct NDC/.test(cmp) && /Reguler rute/.test(cmp));
  check('segmen Dumai: breakdown per segmen memuat Pekanbaru → Dumai (hub-to-hub)', /breakdown per segmen/i.test(cmp) && /Pekanbaru → Dumai/.test(cmp), cmp.slice(0, 160));
  check('segmen Dumai: ada baris last mile + Total', /last mile/.test(cmp) && /Total/.test(cmp));
  check('daftar rute lama (#seg-steps) sudah dihapus', (await page.$('#seg-steps')) === null);
  const legend = await page.$$eval('#seg-map .leaflet-interactive', e => e.length);
  check('peta segmen: ada garis/poligon', legend > 0, `${legend} layer`);
  await page.screenshot({ path: path.join(OUT, '3_segmen_dumai.png') });

  // --- BU toggle
  await page.click('.bu-btn[data-bu="AHI"]'); await page.waitForTimeout(1500);
  check('toggle AHI tanpa error', pageErrors.length === 0, pageErrors.join(' | '));

  // --- kolom opsional "NDC Reguler": Palu direct dari Sidoarjo, reguler dari Jakarta (tab NDC HCI disuntik lewat intercept)
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
  const p2 = await ctx2.newPage();
  const err2 = [];
  p2.on('pageerror', e => err2.push(e.message));
  await p2.route(/sheet=NDC%20HCI/, async route => {
    const res = await route.fetch();
    const lines = (await res.text()).split(/\r?\n/);
    const out = lines.map((l, i) => i === 0 ? l + ',"NDC Reguler"' : (l.includes('"Kota Palu"') ? l + ',"Jakarta"' : (l ? l + ',""' : l)));
    await route.fulfill({ response: res, body: out.join('\n') });
  });
  await p2.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await p2.waitForTimeout(3500);
  await p2.click('.tab[data-tab="segment"]');
  await p2.fill('#seg-search-input', 'Kota Palu'); await p2.waitForTimeout(400);
  await p2.click('#seg-ac-list .autocomplete-item'); await p2.waitForTimeout(1200);
  const cmp2 = await p2.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('NDC Reguler: Palu direct = "Sidoarjo → Tujuan"', /Sidoarjo → Tujuan/.test(cmp2), cmp2.slice(0, 200));
  check('NDC Reguler: reguler rute Palu mulai dari Jakarta', /Rute\s+\S.*?Jakarta →/.test(cmp2) && /Jakarta → \S+/.test(cmp2), cmp2.slice(0, 260));
  await p2.screenshot({ path: path.join(OUT, '4_segmen_palu_reguler.png') });
  await p2.click('.tab[data-tab="table"]');
  await p2.fill('#table-search', 'Kota Palu'); await p2.waitForTimeout(500);
  const palu = await p2.$$eval('#table-body tr', r => r.map(x => x.innerText.replace(/\s+/g, ' ')).join(' | '));
  check('NDC Reguler: tabel menampilkan "reguler dari Jakarta"', /reguler dari Jakarta/.test(palu), palu.slice(0, 160));
  check('NDC Reguler: tanpa JS error', err2.length === 0, err2.join(' | '));
  await ctx2.close();

  await browser.close();
  if (server) server.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} lolos. Screenshot: ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
