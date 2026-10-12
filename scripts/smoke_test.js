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
  const steps = await page.$eval('#seg-steps', e => e.innerText.replace(/\n+/g, ' | '));
  check('segmen Dumai: urutan Pekanbaru -> Dumai', steps.indexOf('Pekanbaru') > -1 && steps.indexOf('Pekanbaru') < steps.indexOf('Dumai'), steps.slice(0, 120));
  const cmp = await page.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('segmen Dumai: blok Perbandingan Rute tampil', /Direct NDC/.test(cmp) && /Reguler rute/.test(cmp));
  const legend = await page.$$eval('#seg-map .leaflet-interactive', e => e.length);
  check('peta segmen: ada garis/poligon', legend > 0, `${legend} layer`);
  await page.screenshot({ path: path.join(OUT, '3_segmen_dumai.png') });

  // --- BU toggle
  await page.click('.bu-btn[data-bu="AHI"]'); await page.waitForTimeout(1500);
  check('toggle AHI tanpa error', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  if (server) server.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} lolos. Screenshot: ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
