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
  const total = await page.$eval('#summary-grid', e => e.textContent.replace(/\s+/g, ' '));
  const nKab = parseInt((total.match(/TOTAL KAB\/KOTA\s*(\d+)/i) || [])[1] || '0', 10);
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
  check('segmen Dumai: blok Perbandingan Rute (Project rute vs Rute 1)', /Project rute/.test(cmp) && /Rute 1/.test(cmp) && !/Direct NDC|Reguler rute|Other rute/.test(cmp));
  check('segmen Dumai: breakdown per segmen memuat Pekanbaru → Dumai (hub-to-hub)', /breakdown per segmen/i.test(cmp) && /Pekanbaru → Dumai/.test(cmp), cmp.slice(0, 160));
  check('segmen Dumai: ada baris last mile + Total', /last mile/.test(cmp) && /Total/.test(cmp));
  check('segmen Dumai (Sumatra): hanya Rute 1 (tanpa Opsional rute)', !/Opsional rute/.test(cmp));
  check('label "Tujuan" diganti "Cust / Sto" di Delivery Segment', /Cust \/ Sto/.test(cmp) && !/tujuan/i.test(await page.$eval('#view-segment', e => e.textContent)));
  const lg = await page.$eval('.seg-legend', e => ({ txt: e.textContent.replace(/\s+/g, ' '), vis: getComputedStyle(e).display !== 'none', inMap: !!e.closest('#seg-map'), x: Math.round(e.getBoundingClientRect().left - document.getElementById('seg-map').getBoundingClientRect().left), bottomGap: Math.round(document.getElementById('seg-map').getBoundingClientRect().bottom - e.getBoundingClientRect().bottom) }));
  check('legend rute: di peta, kiri bawah, memuat Project rute & Rute 1', lg.vis && lg.inMap && lg.x < 40 && lg.bottomGap < 60 && /Project rute/.test(lg.txt) && /Rute 1/.test(lg.txt), JSON.stringify(lg));
  check('legend rute: tidak ada lagi di tabel Perbandingan rute', (await page.$$('#seg-compare .seg-cmp thead .sw')).length === 0);
  check('istilah lama (Direct NDC / Reguler rute / Other rute) tidak muncul di Delivery Segment', !/Direct NDC|Reguler rute|Other rute/.test(await page.$eval('#view-segment', e => e.textContent)));
  check('daftar rute lama (#seg-steps) sudah dihapus', (await page.$('#seg-steps')) === null);
  const legend = await page.$$eval('#seg-map .leaflet-interactive', e => e.length);
  check('peta segmen: ada garis/poligon', legend > 0, `${legend} layer`);
  await page.screenshot({ path: path.join(OUT, '3_segmen_dumai.png') });

  // --- Opsional rute (Kalimantan & Sulawesi): Rute 1 dan Opsional rute mulai dari NDC yang berbeda
  await page.fill('#seg-search-input', 'Kota Palu'); await page.waitForTimeout(400);
  await page.click('#seg-ac-list .autocomplete-item'); await page.waitForTimeout(1200);
  const cmpPalu = await page.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('Opsional rute Palu: kolom Opsional rute tampil', /Opsional rute/.test(cmpPalu), cmpPalu.slice(0, 200));
  check('legend rute Palu: ada entri Opsional rute', /Opsional rute/.test(await page.$eval('.seg-legend', e => e.textContent)));
  // tidak bergantung isi sheet: Reguler & Other harus mulai dari dua NDC yang BERBEDA (Jakarta / Sidoarjo)
  const othNdc = (cmpPalu.match(/Opsional rute \(mulai dari NDC (\w+)\)/) || [])[1];
  const regNdc = (cmpPalu.match(/Rute 1 \(mulai dari NDC (\w+)\)/) || [])[1];
  check('Opsional rute Palu: breakdown "Opsional rute (mulai dari NDC …)" ada', !!othNdc, String(othNdc));
  check('Opsional rute Palu: NDC Opsional rute ≠ NDC Rute 1', !!othNdc && !!regNdc && othNdc !== regNdc, `rute1=${regNdc} opsional=${othNdc}`);
  // "dan seterusnya": tiap NDC tambahan di BU otomatis jadi rute baru (Opsional rute 1, 2, ...) — disimulasikan dengan NDC palsu
  const nRoutes = await page.evaluate(() => {
    const c = Object.values(COVERAGE[currentBU]).find(x => /palu/i.test(x.kabkota) && x.tipe === 'Kota');
    const before = routeNdcNames(c, true).length;
    FACILITIES.push({ bu: currentBU, type: 'NDC', name: 'Medan Tes', lat: 3.5, lon: 98.6 });
    const after = routeNdcNames(c, true);
    FACILITIES.pop();
    return { before, after: after.length, last: after[after.length - 1] };
  });
  check('Opsional rute 2: NDC tambahan di BU otomatis jadi rute baru', nRoutes.before === 2 && nRoutes.after === 3 && nRoutes.last === 'Medan Tes', JSON.stringify(nRoutes));
  await page.screenshot({ path: path.join(OUT, '5_other_rute_palu.png') });

  // --- urutan kolom + toggle: Rute 1 -> Opsional rute -> Project rute
  const heads = async () => page.$$eval('#seg-compare .seg-cmp > table thead th', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
  const bdTitles = async () => page.$$eval('#seg-compare .seg-bd-title', e => e.map(x => x.textContent.trim()));
  const legTxt = async () => page.$eval('.seg-legend', e => e.textContent);
  const hd0 = await heads();
  check('urutan kolom: Rute 1 -> Opsional rute -> Project rute', hd0.length === 3 && /Rute 1$/.test(hd0[0]) && /Opsional rute$/.test(hd0[1]) && /Project rute$/.test(hd0[2]), JSON.stringify(hd0));
  const bd0 = await bdTitles();
  check('urutan breakdown: Rute 1 -> Opsional rute -> Project rute', bd0.length === 3 && /^Rute 1/.test(bd0[0]) && /^Opsional rute/.test(bd0[1]) && /^Project rute/.test(bd0[2]), JSON.stringify(bd0));
  const lg0 = await legTxt();
  check('urutan legend peta: Rute 1 -> Opsional rute -> Project rute', lg0.indexOf('Rute 1') < lg0.indexOf('Opsional rute') && lg0.indexOf('Opsional rute') < lg0.indexOf('Project rute'), lg0);
  check('segmen terpisah: kolom Opsional & Project ada pemisah (grp)', (await page.$$('#seg-compare .seg-cmp > table thead th.grp')).length === 2);
  check('toggle: ada checkbox Opsional rute & Project rute', (await page.$$('#seg-compare .seg-toggles input')).length === 2);
  check('note Project rute: tabel + breakdown memuat "Pengiriman direct Cust / Sto"', (await page.$eval('#seg-compare .seg-cmp > table', e => e.innerText)).includes('Pengiriman direct Cust / Sto') && (await page.$$eval('#seg-compare .seg-bd-note', e => e.map(x => x.textContent))).some(t => t.trim() === 'Note : Pengiriman direct Cust / Sto'));
  const view0 = await page.evaluate(() => { const c = segMap.getCenter(); return [c.lat.toFixed(3), c.lng.toFixed(3), segMap.getZoom()].join(','); });

  await page.click('#seg-compare label.seg-toggle:has(input[data-vis="opsional"])'); await page.waitForTimeout(300);
  const hd1 = await heads();
  check('toggle Opsional off: kolom, breakdown & legend Opsional hilang', hd1.length === 2 && !hd1.some(h => /Opsional/.test(h)) && !(await bdTitles()).some(t => /Opsional/.test(t)) && !/Opsional/.test(await legTxt()), JSON.stringify(hd1));
  check('toggle Opsional off: Rute 1 & Project rute tetap ada', /Rute 1$/.test(hd1[0]) && /Project rute$/.test(hd1[1]));
  check('toggle: posisi/zoom peta tidak loncat', view0 === await page.evaluate(() => { const c = segMap.getCenter(); return [c.lat.toFixed(3), c.lng.toFixed(3), segMap.getZoom()].join(','); }));
  await page.click('#seg-compare label.seg-toggle:has(input[data-vis="project"])'); await page.waitForTimeout(300);
  const cmpOff = await page.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  const hd2 = await heads();
  check('toggle Project off: tinggal Rute 1, baris Selisih hilang', hd2.length === 1 && /Rute 1$/.test(hd2[0]) && !/Selisih Darat/.test(cmpOff), JSON.stringify(hd2));
  check('toggle Project off: legend & breakdown tanpa Project rute', !/Project rute/.test(await legTxt()) && !(await bdTitles()).some(t => /^Project rute/.test(t)));
  check('toggle: pilihan tersimpan di localStorage', await page.evaluate(() => localStorage.getItem('seg-route-vis')) === '{"opsional":false,"project":false}');
  await page.screenshot({ path: path.join(OUT, '6_toggle_off.png') });
  await page.click('#seg-compare label.seg-toggle:has(input[data-vis="opsional"])'); await page.click('#seg-compare label.seg-toggle:has(input[data-vis="project"])'); await page.waitForTimeout(300);
  check('toggle on lagi: 3 kolom kembali', (await heads()).length === 3);

  // --- layout panel Delivery Segment: cukup lebar, tidak overflow horizontal, bisa digeser
  const geo = async () => page.evaluate(() => {
    const l = document.querySelector('.seg-left'), t = document.querySelector('.seg-cmp table'), m = document.getElementById('seg-map');
    return { left: Math.round(l.getBoundingClientRect().width), scrollW: l.scrollWidth, clientW: l.clientWidth,
             tblOverflow: t ? t.scrollWidth - t.clientWidth : 0, map: Math.round(m.getBoundingClientRect().width),
             sidebarHidden: getComputedStyle(document.querySelector('.sidebar')).display === 'none' };
  });
  const g0 = await geo();
  check('layout: panel segmen >= 440px & tanpa scroll horizontal', g0.left >= 440 && g0.scrollW <= g0.clientW + 1 && g0.tblOverflow <= 1, JSON.stringify(g0));
  check('layout: peta segmen tetap >= 500px', g0.map >= 500, `${g0.map}px`);
  check('layout: sidebar global disembunyikan di tab Delivery Segment', g0.sidebarHidden);
  const bb = await (await page.$('#seg-resizer')).boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
  await page.mouse.move(bb.x + 160, bb.y + bb.height / 2, { steps: 6 }); await page.mouse.up();
  const g1 = await geo();
  check('layout: resizer menggeser lebar panel', g1.left > g0.left + 100 && g1.left <= Math.round(1440 * 0.75), `${g0.left} -> ${g1.left}`);
  await page.screenshot({ path: path.join(OUT, '6_layout_resize.png') });
  await page.dblclick('#seg-resizer');
  const g2 = await geo();
  check('layout: klik 2x resizer = reset', Math.abs(g2.left - g0.left) <= 2, `${g2.left}`);
  await page.click('.tab[data-tab="table"]');
  check('layout: sidebar muncul lagi di tab lain', !(await geo()).sidebarHidden);
  await page.click('.tab[data-tab="segment"]'); await page.waitForTimeout(300);

  // --- BU toggle
  await page.click('.bu-btn[data-bu="AHI"]'); await page.waitForTimeout(1500);
  check('toggle AHI tanpa error', pageErrors.length === 0, pageErrors.join(' | '));

  // --- kolom opsional "NDC Reguler": Palu project rute dari Sidoarjo, Rute 1 dari Jakarta (tab NDC HCI disuntik lewat intercept)
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
  check('NDC Reguler: Palu Project rute = "Sidoarjo → Cust / Sto"', /Sidoarjo → Cust \/ Sto/.test(cmp2), cmp2.slice(0, 200));
  check('NDC Reguler: Rute 1 Palu mulai dari Jakarta', /Rute 1 \(mulai dari NDC Jakarta\)/.test(cmp2), cmp2.slice(0, 260));
  check('NDC Reguler + Opsional rute: otomatis = Sidoarjo', /Opsional rute \(mulai dari NDC Sidoarjo\)/.test(cmp2), cmp2.slice(0, 200));
  await p2.screenshot({ path: path.join(OUT, '4_segmen_palu_reguler.png') });
  await p2.click('.tab[data-tab="table"]');
  await p2.fill('#table-search', 'Kota Palu'); await p2.waitForTimeout(500);
  const palu = await p2.$$eval('#table-body tr', r => r.map(x => x.innerText.replace(/\s+/g, ' ')).join(' | '));
  check('NDC Reguler: tabel menampilkan "Rute 1 dari Jakarta"', /Rute 1 dari Jakarta/.test(palu), palu.slice(0, 160));
  check('NDC Reguler: tanpa JS error', err2.length === 0, err2.join(' | '));
  await ctx2.close();

  await browser.close();
  if (server) server.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} lolos. Screenshot: ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
