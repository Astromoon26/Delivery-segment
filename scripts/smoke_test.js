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
// download CSV lewat tombol "Export Coverage" di header -> teks CSV
const exportCsv = async pg => { const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), pg.click('#export-btn')]); return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') }; };
// gsheet live berubah-ubah (Hub HCI sempat tinggal 1 baris, Kota Dumai & hub Padang hilang): test yang memakai Kota Dumai / Kota Padang
// (hub-to-hub Pekanbaru -> Dumai, RDC Tamora, NDC Jakarta, hub Padang) menyuntikkan barisnya kalau belum ada, tanpa mengubah baris lain
const injectDumai = async pg => {
  const spec = {
    Hub: [['Kota Dumai', 'Riau', 'Dumai'], ['Kota Padang', 'Sumatera Barat', 'Padang']],
    RDC: [['Kota Dumai', 'Riau', 'Tamora']],
    NDC: [['Kota Dumai', 'Riau', 'Jakarta']]
  };
  for (const [t, rows] of Object.entries(spec)) await pg.route(new RegExp('sheet=' + t + '%20HCI'), async route => {
    const res = await route.fetch(); let text = (await res.text()).replace(/\s*$/, '');
    const hdr = (text.split(/\r?\n/)[0].match(/"([^"]*)"/g) || []).map(h => h.slice(1, -1));
    for (const [kab, prov, fac] of rows) {
      if (text.includes('"' + kab + '"')) continue;
      const val = { 'No': '9999', 'Kabupaten/Kota': kab, 'Tipe': 'Kota', 'Provinsi': prov, 'Pulau/Kepulauan': 'Sumatra', [t === 'Hub' ? 'HUB' : t]: fac, 'Lead Time land': '1', 'Lead Time Land': '1' };
      text += '\n' + hdr.map(h => '"' + (val[h] ?? '') + '"').join(',');
    }
    await route.fulfill({ response: res, body: text + '\n' });
  });
};
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

  // tab "Rute Numbered" di gsheet sudah berisi data sungguhan -> test lain tidak boleh bergantung padanya (distub kosong)
  const emptyRouteTabs = async pg => { for (const bu of ['HCI', 'AHI']) await pg.route(new RegExp('sheet=Rute%20Numbered%20' + bu), r => r.fulfill({ status: 200, contentType: 'text/csv', body: '"Kabupaten/Kota","Provinsi"\n' })); };
  await emptyRouteTabs(page);
  await injectDumai(page);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3500);

  // --- load & errors
  check('tidak ada JS error / alert', pageErrors.length === 0 && dialogs.length === 0, [...pageErrors, ...dialogs].join(' | '));
  check('gviz memaksa 1 baris header (headers=1) agar baris awal bertanda "-" tidak ikut terbaca sebagai header', /[?&]headers=1\b/.test(await page.evaluate(() => gvizUrl('Cost Facility to Facility HCI'))), '');
  check('tidak ada HTTP >= 400', badHttp.length === 0, badHttp.slice(0, 3).join(' | '));

  // --- basemap (CARTO sekarang minta API key -> watermark; jangan balik ke sana)
  check('basemap bukan CARTO (butuh API key)', !Object.keys(tileHosts).some(h => /cartocdn/.test(h)), JSON.stringify(tileHosts));
  check('tile basemap termuat', Object.values(tileHosts).reduce((a, b) => a + b, 0) > 0);

  // --- ringkasan
  const total = await page.$eval('#summary-grid', e => e.textContent.replace(/\s+/g, ' '));
  const nKab = parseInt((total.match(/TOTAL KAB\/KOTA\s*(\d+)/i) || [])[1] || '0', 10);
  check('total kab/kota >= 510', nKab >= 510, `terbaca ${nKab}`);
  await page.screenshot({ path: path.join(OUT, '1_peta.png') });

  // --- Home: tidak ada tab, peta Indonesia + 7 area island + fasilitas DC
  check('tab menu sudah dihapus (Peta/Tabel/Rantai Fasilitas tidak ada)', (await page.$$('.tab, .tab-bar, #view-table, #view-f2f, #detail-overlay')).length === 0);
  check('Home: tampilan awal = peta Indonesia (data-view=home), panel fasilitas & segmen tersembunyi', await page.evaluate(() => document.body.dataset.view === 'home' && getComputedStyle(document.querySelector('.fac-panel')).display === 'none' && getComputedStyle(document.querySelector('.seg-left')).display === 'none'));
  const homeInfo = await page.evaluate(() => ({ chips: [...document.querySelectorAll('.island-chip')].map(e => e.dataset.island), markers: document.querySelectorAll('#map .leaflet-marker-icon').length, nFac: visibleFacilities().length, labels: document.querySelectorAll('.island-label').length }));
  check('Home: 7 area (Sumatera, Jawa, Bali Nusra, Kalimantan, Sulawesi, Maluku, Papua)', JSON.stringify(homeInfo.chips) === JSON.stringify(['Sumatera', 'Jawa', 'Bali Nusra', 'Kalimantan', 'Sulawesi', 'Maluku', 'Papua']), homeInfo.chips.join(','));
  check('Home: semua fasilitas DC tampil di peta (marker = jumlah fasilitas + label area)', homeInfo.nFac > 0 && homeInfo.markers >= homeInfo.nFac, JSON.stringify(homeInfo));
  const isl = await page.evaluate(() => { const o = {}; for (const c of Object.values(COVERAGE[currentBU])) { const i = islandOf(c.pulau); o[i] = (o[i] || 0) + 1; } return { o, noIsland: o['null'] || 0, noFac: FACILITIES.filter(f => !f._island).length }; });
  check('Home: semua kab/kota & fasilitas masuk salah satu area', isl.noIsland === 0 && isl.noFac === 0, JSON.stringify(isl));

  // --- legenda fasilitas interaktif (Home): hover = sorot, klik = toggle, klik 2x = solo, "Tampilkan semua"
  const nMk = () => page.evaluate(() => { let n = 0; facilityLayer.eachLayer(() => n++); return n; });
  const mk0 = await nMk();
  await page.hover('.leg-card[data-type="SDC"]'); await page.waitForTimeout(250);
  const hv = await page.evaluate(() => { let on = 0, dim = 0, pulse = document.querySelectorAll('.fac-dot.pulse').length; facilityLayer.eachLayer(m => { if (m.options.opacity === 1) on++; else dim++; }); return { on, dim, pulse, nSdc: visibleFacilities().filter(f => f.type === 'SDC').length }; });
  check('legenda: hover tipe SDC = marker SDC disorot (berdenyut), tipe lain diredupkan', hv.on === hv.nSdc && hv.dim === mk0 - hv.nSdc && hv.pulse === hv.nSdc, JSON.stringify(hv));
  await page.mouse.move(700, 800); await page.waitForTimeout(250);
  check('legenda: kursor keluar = sorotan hilang', await page.evaluate(() => document.querySelectorAll('.fac-dot.pulse').length === 0));
  await page.click('.leg-card[data-type="HUB"]'); await page.waitForTimeout(500);
  check('legenda: klik tipe HUB = marker HUB disembunyikan + tombol "Tampilkan semua" muncul', await page.evaluate(() => !visibleTypes.has('HUB') && !!document.getElementById('leg-all')) && (await nMk()) < mk0);
  await page.dblclick('.leg-card[data-type="NDC"]'); await page.waitForTimeout(500);
  check('legenda: klik 2x NDC = hanya NDC yang tampil', await page.evaluate(() => visibleTypes.size === 1 && visibleTypes.has('NDC') && visibleFacilities().filter(f => f.type === 'NDC').length === [...Object.values(facilityLayer._layers)].length));
  await page.dblclick('.leg-card[data-type="NDC"]'); await page.waitForTimeout(500);
  check('legenda: klik 2x lagi (sudah solo) = semua tipe tampil lagi', await page.evaluate(() => visibleTypes.size === 4) && (await nMk()) === mk0);
  await page.click('.leg-card[data-type="RDC"]'); await page.waitForTimeout(500);
  await page.click('#leg-all'); await page.waitForTimeout(400);
  check('legenda: "Tampilkan semua" mengembalikan semua tipe', await page.evaluate(() => visibleTypes.size === 4 && !document.getElementById('leg-all')) && (await nMk()) === mk0);

  check('scorecard "Sampai HUB" & "Baru NDC" sudah dihapus (sisa Total Kab/Kota & Total Fasilitas)', await page.$$eval('#summary-grid .sum-card .lbl', e => e.map(x => x.textContent.trim()).join('|')) === 'TOTAL KAB/KOTA|TOTAL FASILITAS');
  check('zoom in/out peta ada di kanan atas peta (Home & area)', await page.evaluate(() => { const z = document.querySelector('.leaflet-control-zoom').getBoundingClientRect(), m = document.getElementById('map').getBoundingClientRect(); return z.right > m.right - 60 && z.top < m.top + 40 && z.left > m.left + m.width / 2; }));
  // --- Export Coverage (tombol di header, menggantikan tab Tabel Coverage)
  const exp = await exportCsv(page);
  const expLines = exp.text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  check('Export Coverage: >= 510 baris + header, nama file coverage_<BU>_<tanggal>.csv', expLines.length >= 511 && /^coverage_HCI_\d{4}-\d{2}-\d{2}\.csv$/.test(exp.name), `${expLines.length} baris, ${exp.name}`);
  const dumaiRows = expLines.filter(l => /Dumai/.test(l.split(',')[1] || ''));
  check('Export Coverage: Dumai memuat hub feeder Pekanbaru (hub-to-hub)', dumaiRows.length > 0 && dumaiRows.every(l => /Pekanbaru/.test(l)), `${dumaiRows.length} baris`);
  await page.screenshot({ path: path.join(OUT, '1_home.png') });

  // --- klik area -> 3 panel (peta | fasilitas | delivery segment)
  await page.click('.island-chip[data-island="Sumatera"]'); await page.waitForTimeout(1200);
  const three = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const m = r('#map'), f = r('.fac-panel'), g = r('.seg-left');
    return { view: document.body.dataset.view, mapW: Math.round(m.width), facW: Math.round(f.width), segW: Math.round(g.width), order: m.right <= f.left + 2 && f.right <= g.left + 2, title: document.getElementById('fac-title').textContent, items: document.querySelectorAll('.fac-item').length, back: getComputedStyle(document.getElementById('back-home')).display !== 'none', homeHidden: getComputedStyle(document.getElementById('home-panel')).display === 'none' }; });
  check('Area Sumatera: 3 panel berurutan kiri peta, tengah fasilitas, kanan delivery segment', three.view === 'island' && three.order && three.mapW >= 300 && three.facW >= 230 && three.segW >= 340 && three.title === 'Sumatera' && three.items > 0 && three.back && three.homeHidden, JSON.stringify(three));
  check('Area Sumatera: peta zoom ke pulau (fasilitas area lain tidak tampil)', await page.evaluate(() => { const b = map.getBounds(); return visibleFacilities('Sumatera').every(f => b.contains([f.lat, f.lon])) && map.getZoom() >= 5; }));
  check('area: zoom in/out tetap di kanan atas peta (kiri panel tengah), tidak tertutup panel', await page.evaluate(() => { const z = document.querySelector('.leaflet-control-zoom').getBoundingClientRect(), m = document.getElementById('map').getBoundingClientRect(); return z.right > m.right - 60 && z.right <= m.right && z.top < m.top + 40; }));
  await page.screenshot({ path: path.join(OUT, '2_area_sumatera.png') });
  await page.hover('.fac-item[data-fk="RDC|tamora"]'); await page.waitForTimeout(250);
  check('hover fasilitas di daftar tengah = marker fasilitas itu disorot di peta', await page.evaluate(() => { let pulse = 0; facilityLayer.eachLayer(m => { if (m._f && m._f._fk === 'RDC|tamora' && m.options.opacity === 1) pulse++; }); return pulse === 1 && document.querySelectorAll('.fac-dot.pulse').length === 1; }));
  await page.dblclick('#fac-types .type-chip[data-type="SDC"]'); await page.waitForTimeout(500);
  check('chip tipe di panel tengah: klik 2x = hanya SDC (daftar + peta)', await page.evaluate(() => visibleTypes.size === 1 && visibleTypes.has('SDC') && [...document.querySelectorAll('.fac-group span:first-child')].every(e => e.textContent === 'SDC')));
  await page.click('#fac-types .leg-all'); await page.waitForTimeout(400);
  check('panel tengah: "Tampilkan semua" mengembalikan semua tipe', await page.evaluate(() => visibleTypes.size === 4));
  // klik fasilitas -> zoom + daftar kab/kota yang dilayani
  const zoomBefore = await page.evaluate(() => map.getZoom());
  await page.click('.fac-item[data-fk="RDC|tamora"]'); await page.waitForTimeout(1200);
  const facSel = await page.evaluate(() => ({ served: document.querySelectorAll('.served-item').length, sel: view.facKey, expect: servedIn('RDC|tamora', 'Sumatera').length, hi: Object.values(ISL_LAYERS).flat().filter(l => l.options.fillColor === TYPE_COLOR.RDC && l.options.fillOpacity > 0.5).length }));
  check('Klik fasilitas (RDC Tamora): daftar kab/kota yang dilayani + polygon-nya di peta di-highlight', facSel.served > 0 && facSel.served === facSel.expect && facSel.hi > 0, JSON.stringify(facSel));
  await page.screenshot({ path: path.join(OUT, '3_fasilitas_tamora.png') });
  await page.click('.served-item >> nth=0'); await page.waitForTimeout(1200);
  check('Klik kab/kota di daftar fasilitas: Delivery Segment di panel kanan terisi', /Perbandingan rute/i.test(await page.$eval('#seg-compare', e => e.textContent)) && (await page.$eval('#seg-dest-title', e => e.textContent)).length > 0);
  await page.click('#seg-close'); await page.waitForTimeout(600);
  check('Tombol Tutup: kembali ke tampilan fasilitas (daftar kab/kota tetap, segmen kosong)', (await page.$('#seg-route:not([style*="none"])')) === null && await page.evaluate(() => view.facKey === 'RDC|tamora' && !currentSegKey));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Esc: batal pilih fasilitas', await page.evaluate(() => view.facKey === null));
  await page.click('#back-home'); await page.waitForTimeout(800);
  check('Tombol "Semua area": kembali ke Home', await page.evaluate(() => document.body.dataset.view === 'home' && map.getZoom() <= 6));

  // --- delivery segment + perbandingan
  await page.click('.island-chip[data-island=\"Sumatera\"]');
  await page.fill('#seg-search-input', 'Kota Dumai'); await page.waitForTimeout(400);
  await page.click('#seg-ac-list .autocomplete-item'); await page.waitForTimeout(1200);
  const cmp = await page.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('segmen Dumai: blok Perbandingan Rute (Project rute vs Rute 1)', /Project rute/.test(cmp) && /Rute 1/.test(cmp) && !/Direct NDC|Reguler rute|Other rute/.test(cmp));
  check('segmen Dumai: breakdown per segmen memuat Pekanbaru → Dumai (hub-to-hub)', /breakdown per segmen/i.test(cmp) && /Pekanbaru → Dumai/.test(cmp), cmp.slice(0, 160));
  check('segmen Dumai: ada baris last mile + Total', /last mile/.test(cmp) && /Total/.test(cmp));
  check('segmen Dumai (Sumatra): hanya Rute 1 (tanpa Opsional rute)', !/Opsional rute/.test(cmp));
  check('label "Tujuan" diganti "Cust / Sto" di Delivery Segment', /Cust \/ Sto/.test(cmp) && !/tujuan/i.test(await page.$eval('#seg-left', e => e.textContent)));
  const lg = await page.$eval('.seg-legend', e => ({ txt: e.textContent.replace(/\s+/g, ' '), vis: getComputedStyle(e).display !== 'none', inMap: !!e.closest('#map'), x: Math.round(e.getBoundingClientRect().left - document.getElementById('map').getBoundingClientRect().left), bottomGap: Math.round(document.getElementById('map').getBoundingClientRect().bottom - e.getBoundingClientRect().bottom) }));
  check('legend rute: di peta, kiri bawah, memuat Project rute & Rute 1', lg.vis && lg.inMap && lg.x < 40 && lg.bottomGap < 60 && /Project rute/.test(lg.txt) && /Rute 1/.test(lg.txt), JSON.stringify(lg));
  check('legend rute: tidak ada lagi di tabel Perbandingan rute', (await page.$$('#seg-compare .seg-cmp thead .sw')).length === 0);
  check('istilah lama (Direct NDC / Reguler rute / Other rute) tidak muncul di Delivery Segment', !/Direct NDC|Reguler rute|Other rute/.test(await page.$eval('#seg-left', e => e.textContent)));
  check('daftar rute lama (#seg-steps) sudah dihapus', (await page.$('#seg-steps')) === null);
  const legend = await page.$$eval('#map .leaflet-interactive', e => e.length);
  check('peta segmen: ada garis/poligon', legend > 0, `${legend} layer`);
  await page.screenshot({ path: path.join(OUT, '3_segmen_dumai.png') });

  // --- Opsional rute (Kalimantan & Sulawesi): Rute 1 dan Opsional rute mulai dari NDC yang berbeda
  await page.fill('#seg-search-input', 'Kota Palu'); await page.waitForTimeout(400);
  await page.click('#seg-ac-list .autocomplete-item'); await page.waitForTimeout(1200);
  const cmpPalu = await page.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('pencarian kab/kota di area lain: otomatis pindah area (Palu -> Sulawesi, daftar fasilitas ikut)', await page.evaluate(() => view.island === 'Sulawesi' && document.getElementById('fac-title').textContent === 'Sulawesi' && Object.keys(COVERAGE[currentBU]).includes(currentSegKey)));
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
  const heads = async () => page.$$eval('#seg-compare .seg-main-tbl:not(.seg-diff-tbl) thead th', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
  const bdTitles = async () => page.$$eval('#seg-compare .seg-bd-title', e => e.map(x => x.textContent.trim()));
  const legTxt = async () => page.$eval('.seg-legend', e => e.textContent);
  const hd0 = await heads();
  check('urutan kolom: Rute 1 -> Opsional rute -> Project rute', hd0.length === 3 && /Rute 1$/.test(hd0[0]) && /Opsional rute$/.test(hd0[1]) && /Project rute$/.test(hd0[2]), JSON.stringify(hd0));
  const bd0 = await bdTitles();
  check('urutan breakdown: Rute 1 -> Opsional rute -> Project rute', bd0.length === 3 && /^Rute 1/.test(bd0[0]) && /^Opsional rute/.test(bd0[1]) && /^Project rute/.test(bd0[2]), JSON.stringify(bd0));
  const lg0 = await legTxt();
  check('urutan legend peta: Rute 1 -> Opsional rute -> Project rute', lg0.indexOf('Rute 1') < lg0.indexOf('Opsional rute') && lg0.indexOf('Opsional rute') < lg0.indexOf('Project rute'), lg0);
  check('segmen terpisah: kolom Opsional & Project ada pemisah (grp)', (await page.$$('#seg-compare .seg-main-tbl:not(.seg-diff-tbl) thead th.grp')).length === 2);
  check('toggle: ada checkbox Opsional rute & Project rute', (await page.$$('#seg-compare .seg-toggles input')).length === 2);
  check('note Project rute: tabel + breakdown memuat "Pengiriman direct Cust / Sto"', (await page.$eval('#seg-compare .seg-main-tbl', e => e.innerText)).includes('Pengiriman direct Cust / Sto') && (await page.$$eval('#seg-compare .seg-bd-note', e => e.map(x => x.textContent))).some(t => t.trim() === 'Note : Pengiriman direct Cust / Sto'));
  const view0 = await page.evaluate(() => { const c = segMap.getCenter(); return [c.lat.toFixed(3), c.lng.toFixed(3), segMap.getZoom()].join(','); });

  await page.click('#seg-compare label.seg-toggle:has(input[data-vis="opsional"])'); await page.waitForTimeout(300);
  const hd1 = await heads();
  check('toggle Opsional off: kolom, breakdown & legend Opsional hilang', hd1.length === 2 && !hd1.some(h => /Opsional/.test(h)) && !(await bdTitles()).some(t => /Opsional/.test(t)) && !/Opsional/.test(await legTxt()), JSON.stringify(hd1));
  check('toggle Opsional off: Rute 1 & Project rute tetap ada', /Rute 1$/.test(hd1[0]) && /Project rute$/.test(hd1[1]));
  const dm = await page.evaluate(() => { const w = document.querySelector('#seg-compare'); const main = w.querySelector('.seg-main-tbl:not(.seg-diff-tbl)'), bd = w.querySelector('#seg-breakdown'), df = w.querySelector('.seg-diff-wrap');
    return { mainHas: /Selisih/.test(main.innerText), after: !!(bd && df && (bd.compareDocumentPosition(df) & Node.DOCUMENT_POSITION_FOLLOWING)), tables: w.querySelectorAll('.seg-diff-tbl').length, rows: [...w.querySelectorAll('.seg-diff-tbl')].map(t => t.querySelectorAll('tbody tr').length), txt: df ? df.innerText.replace(/\s+/g, ' ') : '' }; });
  check('Selisih: keluar dari tabel perbandingan, ada SETELAH Breakdown per segmen (matriks Darat & Laut, 2x2 untuk rute yang tampil)', !dm.mainHas && dm.after && dm.tables === 2 && dm.rows.every(n => n === 2) && /Selisih Darat/.test(dm.txt) && /Selisih Laut/.test(dm.txt), JSON.stringify(dm).slice(0, 300));
  check('toggle: posisi/zoom peta tidak loncat', view0 === await page.evaluate(() => { const c = segMap.getCenter(); return [c.lat.toFixed(3), c.lng.toFixed(3), segMap.getZoom()].join(','); }));
  await page.click('#seg-compare label.seg-toggle:has(input[data-vis="project"])'); await page.waitForTimeout(300);
  const cmpOff = await page.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  const hd2 = await heads();
  check('toggle Project off: tinggal Rute 1, tidak ada yang dibandingkan -> bagian Selisih hilang', hd2.length === 1 && /Rute 1$/.test(hd2[0]) && !/Selisih Darat/.test(cmpOff), JSON.stringify(hd2));
  check('toggle Project off: legend & breakdown tanpa Project rute', !/Project rute/.test(await legTxt()) && !(await bdTitles()).some(t => /^Project rute/.test(t)));
  check('toggle: pilihan tersimpan di localStorage', await page.evaluate(() => localStorage.getItem('seg-route-vis')) === '{"opsional":false,"project":false}');
  await page.screenshot({ path: path.join(OUT, '6_toggle_off.png') });
  await page.click('#seg-compare label.seg-toggle:has(input[data-vis="opsional"])'); await page.click('#seg-compare label.seg-toggle:has(input[data-vis="project"])'); await page.waitForTimeout(300);
  check('toggle on lagi: 3 kolom kembali', (await heads()).length === 3);

  // --- layout panel Delivery Segment: cukup lebar, tidak overflow horizontal, bisa digeser
  const geo = async () => page.evaluate(() => {
    const l = document.querySelector('.seg-left'), t = document.querySelector('.seg-cmp table'), m = document.getElementById('map');
    return { left: Math.round(l.getBoundingClientRect().width), scrollW: l.scrollWidth, clientW: l.clientWidth,
             tblOverflow: t ? t.scrollWidth - t.clientWidth : 0, map: Math.round(m.getBoundingClientRect().width) };
  });
  const g0 = await geo();
  check('layout: panel segmen >= 440px & tanpa scroll horizontal', g0.left >= 440 && g0.scrollW <= g0.clientW + 1 && g0.tblOverflow <= 1, JSON.stringify(g0));
  check('layout: peta segmen tetap >= 500px', g0.map >= 500, `${g0.map}px`);
  const bb = await (await page.$('#seg-resizer')).boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
  await page.mouse.move(bb.x - 160, bb.y + bb.height / 2, { steps: 6 }); await page.mouse.up();
  const g1 = await geo();
  check('layout: resizer menggeser lebar panel', g1.left > g0.left + 100 && g1.left <= Math.round(1440 * 0.75), `${g0.left} -> ${g1.left}`);
  await page.screenshot({ path: path.join(OUT, '6_layout_resize.png') });
  await page.dblclick('#seg-resizer');
  const g2 = await geo();
  check('layout: klik 2x resizer = reset', Math.abs(g2.left - g0.left) <= 2, `${g2.left}`);

  // --- pencarian dari Home (panel kiri atas): langsung masuk area + gambar rute
  await page.click('#back-home'); await page.waitForTimeout(500);
  await page.fill('#search-input', 'Kota Palu'); await page.waitForTimeout(400);
  await page.click('#ac-list .autocomplete-item'); await page.waitForTimeout(1200);
  check('pencarian dari Home: masuk area Sulawesi + Delivery Segment terisi', await page.evaluate(() => document.body.dataset.view === 'island' && view.island === 'Sulawesi') && /Perbandingan rute/i.test(await page.$eval('#seg-compare', e => e.textContent)));
  // --- BU toggle
  await page.click('.bu-btn[data-bu="AHI"]'); await page.waitForTimeout(1500);
  check('toggle AHI tanpa error', pageErrors.length === 0, pageErrors.join(' | '));
  check('toggle AHI: tetap di area & rute yang sama, daftar fasilitas ikut BU AHI', await page.evaluate(() => view.island === 'Sulawesi' && currentBU === 'AHI' && /BU AHI/.test(document.getElementById('fac-sub').textContent)));
  await page.screenshot({ path: path.join(OUT, '4_area_ahi.png') });

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
  await emptyRouteTabs(p2);
  await p2.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await p2.waitForTimeout(3500);
  await p2.click('.island-chip[data-island=\"Sumatera\"]');
  await p2.fill('#seg-search-input', 'Kota Palu'); await p2.waitForTimeout(400);
  await p2.click('#seg-ac-list .autocomplete-item'); await p2.waitForTimeout(1200);
  const cmp2 = await p2.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('NDC Reguler: Palu Project rute = "Sidoarjo → Cust / Sto"', /Sidoarjo → Cust \/ Sto/.test(cmp2), cmp2.slice(0, 200));
  check('NDC Reguler: Rute 1 Palu mulai dari Jakarta', /Rute 1 \(mulai dari NDC Jakarta\)/.test(cmp2), cmp2.slice(0, 260));
  check('NDC Reguler + Opsional rute: otomatis = Sidoarjo', /Opsional rute \(mulai dari NDC Sidoarjo\)/.test(cmp2), cmp2.slice(0, 200));
  await p2.screenshot({ path: path.join(OUT, '4_segmen_palu_reguler.png') });
  const expP2 = await exportCsv(p2);
  const paluLine = expP2.text.split(/\r?\n/).find(l => /"?Kota Palu"?,/.test(l) || /^\d+,Kota Palu,/.test(l)) || '';
  check('NDC Reguler: Export Coverage memuat kolom NDC Reguler = Jakarta untuk Palu', /,Jakarta,/.test(paluLine) && /Sidoarjo/.test(paluLine), paluLine.slice(0, 200));
  check('NDC Reguler: tanpa JS error', err2.length === 0, err2.join(' | '));
  await ctx2.close();

  // --- Rute numbered (Rute 2, 3, ...): tab opsional "Rute Numbered HCI" disuntik lewat intercept (live sheet belum tentu punya tab itu)
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
  const p3 = await ctx3.newPage();
  await injectDumai(p3);
  const err3 = [];
  p3.on('pageerror', e => err3.push(e.message));
  await p3.route(/sheet=Rute%20Numbered%20HCI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"Kabupaten/Kota","Provinsi","Rute 2","Rute 3","Opsional rute 1","Opsional rute 2"\n' +
    '"Kota Dumai","Riau","Jakarta - Pekanbaru - Dumai","Jakarta - Tamora - Dumai - Cust / Sto","Sidoarjo - Pekanbaru - Dumai","Sidoarjo - Tamora - Dumai"\n' +
    '"Kota Padang","Sumatera Barat","Jakarta > Tamora > Padang","","",""\n' +
    '"Kabupaten Padang Pariaman","Sumatera Barat","Jakarta - Fasilitas Ngawur - Padang","","",""\n' +
    '"Kota Palu","Sulawesi Tengah","","","Sidoarjo - Palu",""\n' }));
  // tab AHI belum ada -> gviz mengembalikan sheet pertama (Name of Facility): harus diabaikan, bukan dianggap rute
  await p3.route(/sheet=Rute%20Numbered%20AHI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"Bussines Unit","Type","Name Site","Long","Lat"\n"HCI & AHI","NDC","Jakarta","-6.3","107.1"\n' }));
  await p3.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await p3.waitForTimeout(3500);
  check('rute numbered: tab dari sheet pertama (header tidak cocok) diabaikan', await p3.evaluate(() => Object.keys(ROUTE_ALT.AHI).length === 0 && Object.keys(ROUTE_ALT.HCI).length === 4), await p3.evaluate(() => JSON.stringify(Object.keys(ROUTE_ALT.HCI))));
  await p3.click('.island-chip[data-island=\"Sumatera\"]');
  const openSeg = async q => { await p3.fill('#seg-search-input', q); await p3.waitForTimeout(400); await p3.click('#seg-ac-list .autocomplete-item'); await p3.waitForTimeout(1200); };
  const heads3 = async () => p3.$$eval('#seg-compare .seg-main-tbl:not(.seg-diff-tbl) thead th', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
  const bd3 = async () => p3.$$eval('#seg-compare .seg-bd-title', e => e.map(x => x.textContent.trim()));
  await openSeg('Kota Dumai');
  const hd = await heads3(), tx = await p3.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('rute numbered Dumai: kolom Rute 1 -> Rute 2 -> Rute 3 -> Opsional rute 1 -> Opsional rute 2 -> Project rute', hd.length === 6 && /Rute 1$/.test(hd[0]) && /Rute 2$/.test(hd[1]) && /Rute 3$/.test(hd[2]) && /Opsional rute 1$/.test(hd[3]) && /Opsional rute 2$/.test(hd[4]) && /Project rute$/.test(hd[5]), JSON.stringify(hd));
  check('rute numbered Dumai: Rute 2 = Jakarta → Pekanbaru → Dumai → Cust / Sto', /Jakarta → Pekanbaru → Dumai → Cust \/ Sto/.test(tx), tx.slice(0, 400));
  const bdt = await bd3();
  check('rute numbered Dumai: breakdown Rute 2, 3, Opsional rute 1 (NDC Sidoarjo) & 2, Project rute terakhir', bdt.length === 6 && /^Rute 2 \(mulai dari NDC Jakarta\)/.test(bdt[1]) && /^Rute 3/.test(bdt[2]) && /^Opsional rute 1 \(mulai dari NDC Sidoarjo\)/.test(bdt[3]) && /^Opsional rute 2/.test(bdt[4]) && /^Project rute/.test(bdt[5]), JSON.stringify(bdt));
  check('rute numbered Dumai: leg Jakarta → Pekanbaru & Pekanbaru → Dumai masuk breakdown', /Jakarta → Pekanbaru/.test(await p3.$eval('#seg-compare #seg-breakdown', e => e.innerText)) && /Pekanbaru → Dumai/.test(await p3.$eval('#seg-compare #seg-breakdown', e => e.innerText)));
  const lgd = await p3.$eval('.seg-legend', e => e.textContent);
  check('rute numbered Dumai: legend urut Rute 1 -> 2 -> 3 -> Opsional rute 1 -> 2 -> Project rute', ['Rute 1', 'Rute 2', 'Rute 3', 'Opsional rute 1', 'Opsional rute 2', 'Project rute'].every((x, i, a) => i === 0 || lgd.indexOf(a[i - 1]) < lgd.indexOf(x)), lgd);
  check('rute numbered Dumai: peta menggambar garis tiap rute', (await p3.$$eval('#map .leaflet-interactive', e => e.length)) >= 6);
  check('rute numbered Dumai: tanpa horizontal overflow', await p3.evaluate(() => { const l = document.querySelector('.seg-left'); return l.scrollWidth <= l.clientWidth + 1; }));
  await p3.screenshot({ path: path.join(OUT, '7_rute_numbered_dumai.png') });
  // toggle Opsional rute menyembunyikan semua Opsional rute (otomatis maupun custom), Rute 1-3 tetap
  await p3.click('#seg-compare label.seg-toggle:has(input[data-vis="opsional"])'); await p3.waitForTimeout(300);
  const hdOff = await heads3();
  check('rute numbered: toggle Opsional off menyembunyikan Opsional rute 1 & 2', hdOff.length === 4 && !hdOff.some(h => /Opsional/.test(h)) && !(await p3.$eval('.seg-legend', e => e.textContent)).includes('Opsional'), JSON.stringify(hdOff));
  await p3.click('#seg-compare label.seg-toggle:has(input[data-vis="opsional"])'); await p3.waitForTimeout(300);
  await openSeg('Kota Padang');
  const txP = await p3.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('rute numbered Padang: Rute 2 = Jakarta → Tamora → Padang → Cust / Sto', /Jakarta → Tamora → Padang → Cust \/ Sto/.test(txP) && /Jakarta → Padang → Cust \/ Sto/.test(txP), txP.slice(0, 300));
  check('rute numbered Padang: leg Tamora → Padang masuk breakdown', /Tamora → Padang/.test(await p3.$eval('#seg-compare #seg-breakdown', e => e.innerText)));
  await p3.screenshot({ path: path.join(OUT, '8_rute_numbered_padang.png') });
  await openSeg('Kabupaten Padang Pariaman');
  const txW = await p3.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('rute numbered: fasilitas tidak dikenal -> ada peringatan, tidak error', /Rute 2: fasilitas "Fasilitas Ngawur" tidak ditemukan/.test(txW), txW.slice(-300));
  await openSeg('Kota Palu');
  const hdPalu = await heads3(), txPalu = await p3.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' ')), bdPalu = await bd3();
  check('rute numbered: kab/kota lain tidak berubah (Palu tanpa Rute 2)', !hdPalu.some(h => /Rute 2/.test(h)));
  check('Opsional rute custom (Palu) menggantikan Opsional rute otomatis', hdPalu.filter(h => /Opsional/.test(h)).length === 1 && /Sidoarjo → Palu → Cust \/ Sto/.test(txPalu) && !/Sidoarjo → Tallo → Palu/.test(txPalu) && bdPalu.some(t => /^Opsional rute \(mulai dari NDC Sidoarjo\)/.test(t)), JSON.stringify(bdPalu));
  check('rute numbered: tanpa JS error', err3.length === 0, err3.join(' | '));
  await ctx3.close();

  // --- slot Rute 1 & Project rute dari tab Rute Numbered (Rute 1 / Opsional rute N / Project rute N bisa ditulis per kab/kota)
  const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
  const p4 = await ctx4.newPage();
  await injectDumai(p4);
  const err4 = [];
  p4.on('pageerror', e => err4.push(e.message));
  await p4.route(/sheet=Rute%20Numbered%20HCI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"Kabupaten/Kota","Provinsi","Rute 1","Rute 2","Opsional rute 1","Project rute 1","Project rute 2"\n' +
    '"Kota Dumai","Riau","Jakarta - Pekanbaru - Dumai","Jakarta - Tamora - Pekanbaru - Dumai","","Jakarta","Sidoarjo - Pekanbaru - Dumai"\n' +
    '"Kota Padang","Sumatera Barat","","","","Sidoarjo",""\n' +
    '"Kota Palu","Sulawesi Tengah","Sidoarjo - Tallo - Palu","","","",""\n' }));
  await p4.route(/sheet=Rute%20Numbered%20AHI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body: '"Kabupaten/Kota","Provinsi"\n' }));
  await p4.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await p4.waitForTimeout(3500);
  await p4.click('.island-chip[data-island=\"Sumatera\"]');
  const open4 = async q => { await p4.fill('#seg-search-input', q); await p4.waitForTimeout(400); await p4.click('#seg-ac-list .autocomplete-item'); await p4.waitForTimeout(1200); };
  const heads4 = async () => p4.$$eval('#seg-compare .seg-main-tbl:not(.seg-diff-tbl) thead th', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
  const bd4 = async () => p4.$$eval('#seg-compare .seg-bd-title', e => e.map(x => x.textContent.trim()));
  await open4('Kota Dumai');
  const h4 = await heads4(), tx4 = await p4.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' ')), b4 = await bd4();
  check('slot: Dumai kolom = Rute 1, Rute 2, Project rute 1, Project rute 2', h4.length === 4 && /Rute 1$/.test(h4[0]) && /Rute 2$/.test(h4[1]) && /Project rute 1$/.test(h4[2]) && /Project rute 2$/.test(h4[3]), JSON.stringify(h4));
  check('slot: Rute 1 custom (Jakarta → Pekanbaru → Dumai) menggantikan rantai coverage', /Jakarta → Pekanbaru → Dumai → Cust \/ Sto Jakarta → Tamora → Pekanbaru → Dumai → Cust \/ Sto/.test(tx4), tx4.slice(0, 420));
  check('slot: Project rute 1 = NDC saja (direct) + note, Project rute 2 = rantai dengan Total', /Pengiriman direct Cust \/ Sto/.test(tx4) && b4.length === 4 && /^Project rute 1$/.test(b4[2]) && /^Project rute 2 \(mulai dari NDC Sidoarjo\)/.test(b4[3]), JSON.stringify(b4));
  const lg4 = await p4.$eval('.seg-legend', e => e.textContent);
  check('slot: legend Rute 1 -> Rute 2 -> Project rute 1 -> Project rute 2', ['Rute 1', 'Rute 2', 'Project rute 1', 'Project rute 2'].every((x, i, arr) => i === 0 || lg4.indexOf(arr[i - 1]) < lg4.indexOf(x)), lg4);
  await p4.screenshot({ path: path.join(OUT, '9_slot_dumai.png') });
  await p4.click('#seg-compare label.seg-toggle:has(input[data-vis="project"])'); await p4.waitForTimeout(300);
  const h4off = await heads4();
  check('slot: toggle Project off menyembunyikan semua Project rute', h4off.length === 2 && !h4off.some(h => /Project/.test(h)) && !(await p4.$eval('.seg-legend', e => e.textContent)).includes('Project'), JSON.stringify(h4off));
  await p4.click('#seg-compare label.seg-toggle:has(input[data-vis="project"])'); await p4.waitForTimeout(300);
  await open4('Kota Padang');
  const tx4p = await p4.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('slot: Project rute NDC lain (Sidoarjo) -> peringatan data belum tersedia', /Project rute 1: lead time\/cost direct dari NDC Sidoarjo belum tersedia/.test(tx4p) && /Sidoarjo → Cust \/ Sto/.test(tx4p), tx4p.slice(-260));
  await open4('Kota Palu');
  const b4pl = await bd4(), tx4pl = await p4.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('slot: Rute 1 custom di Palu (Sidoarjo) -> Opsional rute otomatis pindah ke NDC lain (Jakarta)', /^Rute 1 \(mulai dari NDC Sidoarjo\)/.test(b4pl[0]) && b4pl.some(x => /^Opsional rute \(mulai dari NDC Jakarta\)/.test(x)), JSON.stringify(b4pl));
  await open4('Kota Pekanbaru');
  const h4pk = await heads4();
  check('slot: kab/kota tanpa isian tetap default (Rute 1 + Project rute saja)', h4pk.length === 2 && /Rute 1$/.test(h4pk[0]) && /Project rute$/.test(h4pk[1]), JSON.stringify(h4pk));
  check('slot: tanpa JS error', err4.length === 0, err4.join(' | '));
  await ctx4.close();

  // --- Rute 1 yang dimulai dari RDC (mis. "Tamora - Aceh"): bukan NDC, tetap digambar di peta + legend + tabel
  const ctx5 = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
  const p5 = await ctx5.newPage();
  await injectDumai(p5);
  const err5 = [];
  p5.on('pageerror', e => err5.push(e.message));
  await p5.route(/sheet=Rute%20Numbered%20HCI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"Kabupaten/Kota","Provinsi","Rute 1","Rute 2"\n"Kota Banda Aceh","Aceh","Tamora - Aceh","Jakarta - Tamora - Aceh"\n"Kota Pekanbaru","Riau","Tamora",""\n"Kota Palu","Sulawesi Tengah","","Tamora"\n' }));
  await p5.route(/sheet=Rute%20Numbered%20AHI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body: '"Kabupaten/Kota","Provinsi"\n' }));
  // tab Armada di gsheet asli sudah ada -> simulasikan 'tidak ada' (gviz mengembalikan sheet pertama)
  await p5.route(/sheet=Armada/, route => route.fulfill({ status: 200, contentType: 'text/csv', body: '"Name of Facility","Type"\n"Jakarta","NDC"\n' }));
  await p5.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await p5.waitForFunction(() => document.getElementById('last-updated').textContent.includes('Update'), { timeout: 60000 });
  await p5.click('.island-chip[data-island=\"Sumatera\"]');
  await p5.fill('#seg-search-input', 'Kota Banda Aceh'); await p5.waitForTimeout(400);
  await p5.click('#seg-ac-list .autocomplete-item'); await p5.waitForTimeout(1200);
  const tx5 = await p5.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  const bd5 = await p5.$$eval('#seg-compare .seg-bd-title', e => e.map(x => x.textContent.trim()));
  check('Rute 1 dari RDC: judul "mulai dari RDC Tamora" dan tidak ada warning "bukan NDC"', bd5.some(t => /^Rute 1 \(mulai dari RDC Tamora\)/.test(t)) && !/bukan NDC/.test(tx5), JSON.stringify(bd5));
  check('Rute 1 dari RDC: segmen RDC → HUB di breakdown', /RDC → HUB/.test(await p5.$eval('#seg-compare #seg-breakdown', e => e.innerText)));
  const line5 = await p5.evaluate(() => { let n = 0; segLayer.eachLayer(l => { if (l.getLatLngs && l._tooltip && /^Rute 1$/.test(l._tooltip.getContent()) && l.getLatLngs().length >= 3) n = l.getLatLngs().length; }); return n; });
  check('Rute 1 dari RDC: garis peta mulai dari Tamora (>=3 titik) dan legend memuat Rute 1', line5 >= 3 && (await p5.$eval('.seg-legend', e => e.textContent)).includes('Rute 1'), 'titik=' + line5);
  await p5.screenshot({ path: path.join(OUT, '9_rute1_dari_rdc.png') });
  // satu nama RDC saja = RDC -> Cust / Sto (priority booking dari RDC/SDC)
  await p5.fill('#seg-search-input', 'Kota Pekanbaru'); await p5.waitForTimeout(400);
  await p5.click('#seg-ac-list .autocomplete-item'); await p5.waitForTimeout(1200);
  const tx6 = await p5.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  const bdw6 = await p5.$eval('#seg-compare #seg-breakdown', e => e.innerText.replace(/\s+/g, ' '));
  const pts6 = await p5.evaluate(() => { let n = 0; segLayer.eachLayer(l => { if (l.getLatLngs && l._tooltip && /^Rute 1$/.test(l._tooltip.getContent())) n = l.getLatLngs().length; }); return n; });
  check('satu nama (Rute 1 = "Tamora"): Tamora → Cust / Sto, last mile RDC, tanpa warning', /Tamora → Cust \/ Sto/.test(tx6) && /last mile RDC/.test(bdw6) && !/belum tersedia|bukan RDC|bukan HUB|tidak ditemukan|bukan NDC/.test(tx6), tx6.slice(0, 300));
  check('satu nama: garis peta dari Tamora ke Cust / Sto (2 titik)', pts6 === 2, 'titik=' + pts6);
  await p5.fill('#seg-search-input', 'Kota Palu'); await p5.waitForTimeout(400);
  await p5.click('#seg-ac-list .autocomplete-item'); await p5.waitForTimeout(1200);
  const tx7 = await p5.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  check('satu nama RDC yang bukan pelayan kab/kota -> peringatan, tidak error', /Rute 2: .*Tamora bukan .*yang melayani Kota Palu/.test(tx7), tx7.slice(-300));
  check('Rute 1 dari RDC: tanpa JS error', err5.length === 0, err5.join(' | '));
  // kolom cost last mile di tab Hub/SDC/RDC asli (Apip akan menambahkannya) tidak boleh mempengaruhi tes ini
  await p5.evaluate(() => { LAST_HDR.HCI = {}; LAST_HDR.AHI = {}; });
  await p5.fill('#seg-search-input', 'Kota Palu'); await p5.waitForTimeout(400);
  await p5.click('#seg-ac-list .autocomplete-item'); await p5.waitForTimeout(1200);
  check('tanpa tab Armada & tanpa kolom cost last mile: bagian "Cost per armada" tidak muncul', !/Cost per armada/i.test(await p5.$eval('#seg-compare', e => e.innerText)));
  await ctx5.close();

  // --- Cost per armada: tab Armada (kapasitas x utilisasi) + kolom armada di tab Cost Facility to Facility
  const ctx6 = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
  const p6 = await ctx6.newPage();
  const err6 = [];
  p6.on('pageerror', e => err6.push(e.message));
  await emptyRouteTabs(p6);
  await p6.route(/sheet=Armada/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"Armada","Kapasitas (cbm)","Utilisasi (%)"\n"CDDL","16","85"\n"Fuso","32","85"\n"Wingbox","42","85"\n"Cont-20","25","85"\n"Cont-40","50","85"\n' }));
  await p6.route(/sheet=Hub%20HCI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"No","Kabupaten/Kota","Tipe","Provinsi","Pulau/Kepulauan","HUB","Lead Time land","Cost","CDDL","Fuso","Cost/Trip","Cost/CBM"\n' +
    '"1","Kota Dumai","Kota","Riau","Sumatra","Dumai","1","","1.500.000","","900.000","60.000"\n' }));
  // tab SDC/RDC asli sudah punya kolom armada (Apip sudah menambah) -> di-stub kosong supaya tes tidak bergantung pada data live
  for (const t of ['SDC', 'RDC'])
    await p6.route(new RegExp('sheet=' + t + '%20HCI'), route => route.fulfill({ status: 200, contentType: 'text/csv', body:
      '"No","Kabupaten/Kota","Tipe","Provinsi","Pulau/Kepulauan","' + t + '","Lead Time land","Cost"\n' +
      (t === 'RDC' ? '"1","Kota Dumai","Kota","Riau","Sumatra","Tamora","",""\n' : '') }));
  await p6.route(/sheet=NDC%20HCI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"No","Kabupaten/Kota","Tipe","Provinsi","Pulau/Kepulauan","NDC","Lead Time Land","Lead Time Sea","Cost Land","Cost Sea","NDC Reguler","CDDL","Cont-20 Laut","Cost/Trip","Cost/CBM"\n' +
    '"1","Kota Dumai","Kota","Riau","Sumatra","Jakarta","6","","","","","4.000.000","5.000.000","3.000.000","150.000"\n' }));
  await p6.route(/sheet=Cost%20Facility%20to%20Facility%20HCI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"Remark","Facility","Facility","Cost Land","Cost Sea","CDDL","Fuso","Cont-20 Laut","Kolom Bebas"\n' +
    '"","Jakarta","Tamora","","","10.000.000","20.000.000","8.000.000","x"\n' +
    '"","Tamora","Pekanbaru","","","2.000.000","","3.000.000","x"\n' }));
  await p6.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await p6.waitForTimeout(3500);
  await p6.click('.island-chip[data-island=\"Sumatera\"]');
  await p6.fill('#seg-search-input', 'Kota Dumai'); await p6.waitForTimeout(400);
  await p6.click('#seg-ac-list .autocomplete-item'); await p6.waitForTimeout(1500);
  const tx8 = await p6.$eval('#seg-compare', e => e.innerText.replace(/\s+/g, ' '));
  const ac = await p6.evaluate(() => armadaCols('HCI').map(c => c.label + (c.modeLabel ? ' ' + c.modeLabel : '') + ' ' + c.ar.eff));
  check('armada: kolom dikenali dari header (CDDL, Fuso, Cont-20 Laut), kolom lain diabaikan, kapasitas efektif 85%', JSON.stringify(ac) === JSON.stringify(['CDDL 13.6', 'Fuso 27.2', 'Cont-20 Laut 21.25']), JSON.stringify(ac));
  check('armada: bagian Cost per armada tampil, header armada TANPA kapasitas (cbm)', /Cost per armada/i.test(tx8) && !/\d[\d,.]* cbm/.test(tx8) && /Laut/.test(tx8), tx8.slice(tx8.toLowerCase().indexOf('cost per armada'), tx8.toLowerCase().indexOf('cost per armada') + 400));
  const mainTx = await p6.$eval('#seg-compare .seg-main-tbl:not(.seg-diff-tbl)', e => e.innerText.replace(/\s+/g, ' '));
  check('tabel perbandingan: tanpa baris Cost Darat / Cost Laut, lead time tetap ada', !/Cost (Darat|Laut)/i.test(mainTx) && /Lead time Darat/i.test(mainTx) && /Lead time Laut/i.test(mainTx), mainTx.slice(0, 300));
  const bdTx = await p6.$eval('#seg-compare #seg-breakdown', e => e.innerText.replace(/\s+/g, ' '));
  check('breakdown per segmen: tanpa cost (tidak ada Rp / "cost —")', /Breakdown per segmen/i.test(bdTx) && !/Rp\s?\d|cost —/i.test(bdTx), bdTx.slice(0, 300));
  // --- pilih armada per segmen: total rute = Cost/Trip & Cost/CBM dari armada yang terpilih
  const totTx = () => p6.$eval('#seg-armada .arm-total', e => e.innerText.replace(/\s+/g, ' '));
  const pos = await p6.evaluate(() => { const w = document.querySelector('#seg-compare'), bd = w.querySelector('#seg-breakdown'), df = w.querySelector('.seg-diff-wrap'), ar = w.querySelector('#seg-armada');
    const tb = w.querySelector('.seg-main-tbl'), fol = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { order: fol(tb, ar) && fol(ar, bd) && fol(bd, df), diffTxt: df.innerText.replace(/\s+/g, ' ') }; });
  check('urutan: Perbandingan rute -> Cost per armada -> Breakdown per segmen -> Selisih LT; Selisih tanpa cost', pos.order && /Selisih LT/i.test(pos.diffTxt) && !/Cost:|lebih (murah|mahal)/i.test(pos.diffTxt), pos.diffTxt.slice(0, 200));
  check('Cost per armada: tabel "Total per armada" per rute dihapus', !/Total per armada/i.test(tx8), '');
  check('armada: sebelum ada pilihan, total menunjuk "belum ada armada dipilih"', /belum ada armada dipilih/i.test(await totTx()), await totTx());
  await p6.click('#seg-armada tbody tr:nth-child(1) td:nth-child(2)');                       // Jakarta -> Tamora = CDDL
  const t1 = await totTx();
  check('armada: klik segmen CDDL -> total Cost/Trip ≥Rp 10.000.000* & Cost/CBM ≥Rp 735.294/cbm* (1 dari 4 segmen)', /Cost\/Trip ≥Rp 10\.000\.000\*/.test(t1) && /Cost\/CBM ≥Rp 735\.294\/cbm\*/.test(t1) && /1 dari 4 segmen/.test(t1), t1);
  check('armada: sel terpilih ditandai (aria-pressed / kelas sel)', await p6.$eval('#seg-armada tbody tr:nth-child(1) td:nth-child(2)', e => e.classList.contains('sel') && e.getAttribute('aria-pressed') === 'true'), '');
  await p6.click('#seg-armada thead th.arm-colpick:nth-child(2)');                           // header CDDL = semua segmen yang punya CDDL
  const t2 = await totTx();
  check('armada: klik header CDDL -> semua segmen ber-CDDL terpilih (termasuk last mile): ≥Rp 13.500.000* & ≥Rp 992.647/cbm* (3 dari 4)', /≥Rp 13\.500\.000\*/.test(t2) && /≥Rp 992\.647\/cbm\*/.test(t2) && /3 dari 4 segmen/.test(t2), t2);
  await p6.click('#seg-armada tbody tr:nth-child(1) td:nth-child(4)');                       // Jakarta -> Tamora pindah ke Cont-20 Laut
  const t3 = await totTx();
  check('armada: ganti armada satu segmen (Cont-20 Laut) -> total ≥Rp 11.500.000* & ≥Rp 633.824/cbm* (campur armada)', /≥Rp 11\.500\.000\*/.test(t3) && /≥Rp 633\.824\/cbm\*/.test(t3), t3);
  await p6.click('#seg-armada tbody tr:nth-child(1) td:nth-child(4)');                       // klik lagi = batal
  const t4 = await totTx();
  check('armada: klik lagi = batal pilihan (tinggal Tamora → Pekanbaru + last mile CDDL: ≥Rp 3.500.000*, 2 dari 4)', /≥Rp 3\.500\.000\*/.test(t4) && /≥Rp 257\.353\/cbm\*/.test(t4) && /2 dari 4 segmen/.test(t4), t4);
  check('armada: segmen tanpa harga armada (Pekanbaru → Dumai) tidak bisa dipilih', await p6.$$eval('#seg-armada tbody tr:nth-child(3) td.arm-pick', n => n.length) === 0, '');
  // --- last mile (Hub → Cust / Sto) dari tab Hub: kolom armada + kolom "Langsung" (Cost/Trip & Cost/CBM)
  const lmTx = await p6.$eval('#seg-armada tbody tr:nth-child(4)', e => e.innerText.replace(/\s+/g, ' '));
  const headTx = await p6.$$eval('#seg-armada thead tr:first-child th', n => n.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  check('last mile: baris "Dumai → Cust / Sto" (last mile HUB) tampil di Cost per armada', /Dumai → Cust \/ Sto/.test(lmTx) && /last mile HUB/i.test(lmTx) && /Rp 1\.500\.000/.test(lmTx), lmTx);
  check('last mile: kolom "Langsung" ada di header (CDDL, Fuso, Cont-20 Laut, Langsung)', JSON.stringify(headTx.slice(0, 5).map(h => h.replace(/\s.*$/, ''))) === JSON.stringify(['Segmen', 'CDDL', 'Fuso', 'Cont-20', 'Langsung']), JSON.stringify(headTx));
  check('last mile: kolom Langsung = Cost/Trip Rp 900.000 & Cost/CBM Rp 60.000/cbm langsung dari tab Hub', /Rp 900\.000/.test(lmTx) && /Rp 60\.000\/cbm/.test(lmTx), lmTx);
  await p6.click('#seg-armada tbody tr:nth-child(4) td:nth-child(2)');                       // last mile CDDL sudah terpilih (dari header) -> batal
  const t5 = await totTx();
  check('last mile: klik sel CDDL yang sudah terpilih = batal -> tinggal Tamora → Pekanbaru ≥Rp 2.000.000* (1 dari 4)', /≥Rp 2\.000\.000\*/.test(t5) && /1 dari 4 segmen/.test(t5), t5);
  await p6.click('#seg-armada tbody tr:nth-child(4) td:nth-child(5)');                       // ganti ke Langsung (900.000 & 60.000/cbm)
  const t6 = await totTx();
  check('last mile dipilih Langsung: total = 2.000.000 + 900.000 = ≥Rp 2.900.000* & cbm 147.059 + 60.000 = ≥Rp 207.059/cbm*', /≥Rp 2\.900\.000\*/.test(t6) && /≥Rp 207\.059\/cbm\*/.test(t6), t6);
  check('last mile: Fuso kosong untuk Dumai → Cust / Sto tidak bisa dipilih', await p6.$$eval('#seg-armada tbody tr:nth-child(4) td.arm-pick', n => n.length) === 2, '');
  // --- Project rute (direct NDC -> Cust / Sto): kolom armada + Cost/Trip & Cost/CBM dibaca dari tab NDC
  const projTbl = p6.locator('#seg-armada table.seg-arm-tbl').nth(1);
  const projTx = await projTbl.evaluate(e => e.innerText.replace(/\s+/g, ' '));
  check('project: tabel Project rute ada di Cost per armada dengan baris "Jakarta → Cust / Sto" (project NDC)', /Jakarta → Cust \/ Sto/.test(projTx) && /project NDC/i.test(projTx), projTx);
  check('project: sel CDDL = Rp 4.000.000, Cont-20 Laut = Rp 5.000.000, Langsung = Rp 3.000.000 & Rp 150.000/cbm (dari tab NDC)', /Rp 4\.000\.000/.test(projTx) && /Rp 5\.000\.000/.test(projTx) && /Rp 3\.000\.000/.test(projTx) && /Rp 150\.000\/cbm/.test(projTx), projTx);
  const projTot = () => p6.locator('#seg-armada .arm-total').nth(1).evaluate(e => e.innerText.replace(/\s+/g, ' '));
  check('project: belum ada yang dipilih -> total "belum ada armada dipilih"', /belum ada armada dipilih/.test(await projTot()), await projTot());
  await projTbl.locator('tbody tr').nth(0).locator('td').nth(4).click();                       // Langsung
  const pt1 = await projTot();
  check('project dipilih Langsung: total Cost/Trip Rp 3.000.000 & Cost/CBM Rp 150.000/cbm (1 dari 1 segmen, tanpa ≥)', /Rp 3\.000\.000/.test(pt1) && /Rp 150\.000\/cbm/.test(pt1) && /1 dari 1 segmen/.test(pt1) && !/≥/.test(pt1), pt1);
  await projTbl.locator('thead th').nth(1).click();                                           // header CDDL -> ganti ke CDDL (4.000.000 / 13,6 cbm)
  const pt2 = await projTot();
  check('project: klik header CDDL -> Rp 4.000.000 & Rp 294.118/cbm', /Rp 4\.000\.000/.test(pt2) && /Rp 294\.118\/cbm/.test(pt2), pt2);
  const rute1Tot = await p6.$eval('#seg-armada .arm-total', e => e.innerText.replace(/\s+/g, ' '));
  check('project: pilihan Project rute tidak mengubah total Rute 1', /≥Rp 2\.900\.000\*/.test(rute1Tot), rute1Tot);
  await p6.screenshot({ path: path.join(OUT, '10_cost_per_armada.png') });
  check('armada: tanpa JS error', err6.length === 0, err6.join(' | '));
  await ctx6.close();

  // --- Project rute 2 direct dari NDC lain (Sidoarjo): baris ke-2 di tab NDC (kab/kota sama, NDC beda) = LT + cost + armada Project rute 2
  const ctx7 = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
  const p7 = await ctx7.newPage();
  const err7 = [];
  p7.on('pageerror', e => err7.push(e.message));
  await emptyRouteTabs(p7);
  await p7.route(/sheet=Rute%20Numbered%20HCI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"Kabupaten/Kota","Provinsi","Project rute 1","Project rute 2"\n"Kota Dumai","Riau","Jakarta","Sidoarjo"\n' }));
  await p7.route(/sheet=Armada/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"Armada","Kapasitas (cbm)","Utilisasi (%)"\n"CDDL","16","85"\n"Fuso","32","85"\n' }));
  for (const t of ['HUB', 'SDC', 'RDC'])
    await p7.route(new RegExp('sheet=' + t + '%20HCI'), route => route.fulfill({ status: 200, contentType: 'text/csv', body:
      '"No","Kabupaten/Kota","Tipe","Provinsi","Pulau/Kepulauan","' + t + '","Lead Time land","Cost"\n' +
      (t === 'HUB' ? '"1","Kota Dumai","Kota","Riau","Sumatra","Dumai","1",""\n' : '') }));
  await p7.route(/sheet=NDC%20HCI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"No","Kabupaten/Kota","Tipe","Provinsi","Pulau/Kepulauan","NDC","Lead Time Land","Lead Time Sea","Cost Land","Cost Sea","NDC Reguler","CDDL","Cost/Trip","Cost/CBM"\n' +
    '"1","Kota Dumai","Kota","Riau","Sumatra","Jakarta","6","","","","","4.000.000","3.000.000","150.000"\n' +
    '"2","Kota Dumai","Kota","Riau","Sumatra","Sidoarjo","4","9","","","","3.000.000","2.500.000","100.000"\n' }));
  await p7.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await p7.waitForTimeout(3500);
  await p7.click('.island-chip[data-island=\"Sumatera\"]');
  await p7.fill('#seg-search-input', 'Kota Dumai'); await p7.waitForTimeout(400);
  await p7.click('#seg-ac-list .autocomplete-item'); await p7.waitForTimeout(1500);
  const tx7n = await p7.$eval('#seg-compare', e => e.textContent.replace(/\s+/g, ' '));
  check('NDC baris ke-2: Project rute 2 (Sidoarjo) direct memakai LT dari baris NDC Sidoarjo, tanpa peringatan "belum tersedia"',
    /Sidoarjo → Cust \/ Sto/.test(tx7n) && !/belum tersedia/.test(tx7n), tx7n.slice(-300));
  const ltRows7n = await p7.$$eval('#seg-compare .seg-main-tbl:not(.seg-diff-tbl) tbody tr', e => e.map(r => [...r.querySelectorAll('td')].map(x => x.textContent.replace(/\s+/g, ' ').trim())));
  const ltDarn = ltRows7n.find(r => /^Lead time Darat/i.test(r[0])), ltLautn = ltRows7n.find(r => /^Lead time Laut/i.test(r[0]));
  check('NDC baris ke-2: tabel perbandingan Lead time Darat/Laut Project rute 1 = 6h/—, Project rute 2 = 4h/9h', ltDarn && ltLautn && ltDarn.slice(-2).join('|') === '6h|4h' && ltLautn.slice(-1)[0] === '9h', JSON.stringify([ltDarn, ltLautn]));
  check('NDC baris ke-2: baris pertama tetap NDC utama di Tabel Coverage (Jakarta), bukan Sidoarjo', await p7.evaluate(() => { const c = Object.values(COVERAGE.HCI).find(x => /Dumai/.test(x.kabkota)); return c.NDC.name === 'Jakarta' && !!c.NDC.others[normFacName('Sidoarjo')]; }), '');
  const ttl7n = await p7.$$eval('#seg-armada .seg-diff-title', e => e.map(x => x.textContent.trim()));
  const i7n = ttl7n.indexOf('Project rute 2');
  check('NDC baris ke-2: Cost per armada punya tabel Project rute 2', i7n > -1, JSON.stringify(ttl7n));
  const tbl7n = p7.locator('#seg-armada table.seg-arm-tbl').nth(i7n);
  const tt7n = await tbl7n.evaluate(e => e.innerText.replace(/\s+/g, ' '));
  check('NDC baris ke-2: Project rute 2 → Sidoarjo → Cust / Sto: CDDL Rp 3.000.000, Langsung Rp 2.500.000 & Rp 100.000/cbm (bukan angka Jakarta)',
    /Sidoarjo → Cust \/ Sto/.test(tt7n) && /Rp 3\.000\.000/.test(tt7n) && /Rp 2\.500\.000/.test(tt7n) && /Rp 100\.000\/cbm/.test(tt7n) && !/Rp 4\.000\.000/.test(tt7n), tt7n);
  const heads7n = await tbl7n.locator('thead th').evaluateAll(e => e.map(x => x.textContent.trim()));
  await tbl7n.locator('tbody tr').nth(0).locator('td').nth(heads7n.findIndex(h => /^Langsung/.test(h))).click();
  const tot7n = await p7.locator('#seg-armada .arm-total').nth(i7n).evaluate(e => e.innerText.replace(/\s+/g, ' '));
  check('NDC baris ke-2: pilih Langsung -> total Project rute 2 = Rp 2.500.000 & Rp 100.000/cbm', /Rp 2\.500\.000/.test(tot7n) && /Rp 100\.000\/cbm/.test(tot7n), tot7n);
  check('NDC baris ke-2: tanpa JS error', err7.length === 0, err7.join(' | '));
  await ctx7.close();

  // --- transit di NDC lain: "Jakarta - Sidoarjo - Pekanbaru - Dumai" (NDC Sidoarjo sebagai titik transit dari NDC Jakarta) + keterangan di legend
  const ctx8 = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
  const p8 = await ctx8.newPage();
  await injectDumai(p8);
  const err8 = [];
  p8.on('pageerror', e => err8.push(e.message));
  await p8.route(/sheet=Rute%20Numbered%20HCI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body:
    '"Kabupaten/Kota","Provinsi","Rute 2"\n"Kota Dumai","Riau","Jakarta - Sidoarjo - Pekanbaru - Dumai"\n' }));
  await p8.route(/sheet=Rute%20Numbered%20AHI/, route => route.fulfill({ status: 200, contentType: 'text/csv', body: '"Kabupaten/Kota","Provinsi"\n' }));
  await p8.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await p8.waitForTimeout(3500);
  await p8.click('.island-chip[data-island=\"Sumatera\"]');
  await p8.fill('#seg-search-input', 'Kota Dumai'); await p8.waitForTimeout(400);
  await p8.click('#seg-ac-list .autocomplete-item'); await p8.waitForTimeout(1500);
  const tx8t = await p8.$eval('#seg-compare', e => e.textContent.replace(/\s+/g, ' '));
  const lg8 = await p8.$eval('.seg-legend', e => e.textContent.replace(/\s+/g, ' '));
  check('transit NDC: "Jakarta - Sidoarjo - Pekanbaru - Dumai" dikenali (tanpa peringatan "Sidoarjo tidak ditemukan"), 2 titik transit', !/"Sidoarjo" tidak ditemukan/.test(tx8t) && /Jakarta → Sidoarjo → Pekanbaru → Dumai → Cust \/ Sto/.test(tx8t), tx8t.slice(-300));
  check('transit NDC: breakdown punya segmen "Jakarta → Sidoarjo" (NDC → NDC) dan "Sidoarjo → Pekanbaru"', /Jakarta → Sidoarjo\s*NDC → NDC/.test(tx8t) && /Sidoarjo → Pekanbaru/.test(tx8t), '');
  check('transit NDC: legend rute memberi keterangan "Rute 2 · transit NDC Sidoarjo", rute lain tanpa keterangan', /Rute 2 · transit NDC Sidoarjo/.test(lg8) && (lg8.match(/transit NDC/g) || []).length === 1, lg8);
  check('transit NDC: tanpa JS error', err8.length === 0, err8.join(' | '));
  await ctx8.close();

  await browser.close();
  if (server) server.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} lolos. Screenshot: ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
