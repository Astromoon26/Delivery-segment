#!/usr/bin/env node
/**
 * Bandingkan hasil dashboard: 18 tab lama (?src=old) vs master baru (default).
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/compare_sources.js --old <folder CSV tab lama> --new <folder CSV master baru> [--sample N]
 *
 * Folder lama: "<nama tab>.csv" (mis. "Hub HCI.csv", "Name of Facility.csv"); folder baru: "master_data_<Nama_Tab>.csv" (spasi -> _).
 * Request gviz ke gsheet lama/baru dicegat dan dijawab dari folder itu, jadi hasilnya deterministik (tidak tergantung gsheet live).
 * Yang dibandingkan: (1) struktur data setelah dibaca (FACILITIES, COVERAGE, F2F, LEAD_TIME, COST_LEG, ROUTE_ALT, ARMADA),
 * (2) teks panel Delivery Segment (#seg-left) untuk tiap kab/kota di kedua BU. Exit 1 kalau ada beda.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const OLD = arg('old'), NEW = arg('new'), SAMPLE = parseInt(arg('sample', '1'), 10);
if (!OLD || !NEW) { console.error('pakai --old <folder> --new <folder>'); process.exit(2); }
const ROOT = path.join(__dirname, '..');
const OLD_ID = '1hfl1n3E8tc-1YLfHlBelDl58TM_zPh99O2hgA56cn0Q', NEW_ID = 'TESTMASTERBARU';

const dumpFn = () => {
  const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'raw' || k === '_island' || k === '_key' ? undefined : v)));
  return { FACILITIES: strip(FACILITIES), COVERAGE: strip(COVERAGE), F2F: strip(F2F), LEAD_TIME: strip(LEAD_TIME), COST_LEG: strip(COST_LEG), ROUTE_ALT: strip(ROUTE_ALT), ARMADA: strip(ARMADA) };
};
// samakan hal yang memang tidak dibedakan di tampilan: '-' == '' ; angka string vs angka; leg tanpa isi
const norm = v => {
  if (Array.isArray(v)) { const a = v.map(norm); while (a.length && a[a.length - 1] === '') a.pop(); return a; }   // kolom ekstra kosong di ujung tidak berarti
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = norm(v[k]); return o; }
  if (typeof v === 'string') { const t = v.trim(); if (t === '-' || t === '') return ''; if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return String(parseFloat(t.replace(/,/g, '')));   // "14,380,000" == 14380000
  if (/^-?\d+(\.\d+)?$/.test(t)) return String(parseFloat(t)); return t; }
  return v;
};
const dropEmptyLegs = d => {
  for (const k of ['LEAD_TIME', 'COST_LEG']) for (const bu of Object.keys(d[k])) for (const lk of Object.keys(d[k][bu])) {
    const e = d[k][bu][lk]; const vals = JSON.stringify(norm(e), (kk, vv) => (kk === 'remark' || kk === 'a' || kk === 'b' ? undefined : vv));
    if (!/[0-9]/.test(vals)) delete d[k][bu][lk];
  }
  return d;
};
const diff = (a, b, p = '', out = []) => {
  if (out.length > 40) return out;
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + '/' + k, out);
  } else out.push(`${p}: lama=${JSON.stringify(a)} baru=${JSON.stringify(b)}`);
  return out;
};

(async () => {
  const port = 8900 + Math.floor(Math.random() * 100);
  const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1000));
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const run = async (query) => {
    const pg = await (await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true })).newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => { errs.push('dialog: ' + d.message()); d.dismiss(); });
    await pg.route(/docs\.google\.com\/spreadsheets\/d\/([^/]+)\/gviz/, async route => {
      const u = new URL(route.request().url()); const id = u.pathname.split('/')[3]; const name = u.searchParams.get('sheet');
      const f = id === NEW_ID ? path.join(NEW, 'master_data_' + name.replace(/ /g, '_') + '.csv') : path.join(OLD, name + '.csv');
      if (fs.existsSync(f)) await route.fulfill({ status: 200, contentType: 'text/csv', body: fs.readFileSync(f) });
      else await route.fulfill({ status: 200, contentType: 'text/csv', body: fs.readFileSync(id === NEW_ID ? path.join(NEW, 'master_data_Master_Kab-Kota.csv') : path.join(OLD, 'Name of Facility.csv')) });   // meniru gviz: tab tak ada -> tab pertama
    });
    await pg.goto(`http://localhost:${port}/index.html${query}`);
    await pg.waitForFunction(() => document.getElementById('last-updated') && /Update:/.test(document.getElementById('last-updated').textContent), null, { timeout: 90000 });
    const data = await pg.evaluate(dumpFn);
    const segs = {};
    for (const bu of ['HCI', 'AHI']) {
      await pg.click(`.bu-btn[data-bu="${bu}"]`); await pg.waitForTimeout(300);
      const keys = await pg.evaluate(() => Object.keys(COVERAGE[currentBU]));
      let i = 0;
      for (const key of keys) {
        if (i++ % SAMPLE) continue;
        segs[bu + '|' + key] = await pg.evaluate(k => { const c = COVERAGE[currentBU][k]; selectKabkota(c); return document.getElementById('seg-left').textContent.replace(/\s+/g, ' ').trim(); }, key);
      }
    }
    await pg.close();
    return { data, segs, errs };
  };
  const a = await run('?src=old');
  const b = await run(`?id=${NEW_ID}`);
  const da = norm(dropEmptyLegs(a.data)), db = norm(dropEmptyLegs(b.data));
  let bad = 0;
  for (const k of Object.keys(da)) {
    const d = diff(da[k], db[k]);
    console.log(`${d.length ? 'BEDA' : 'SAMA'}  ${k}${d.length ? ' (' + d.length + '+ beda)' : ''}`);
    d.slice(0, 8).forEach(x => console.log('     ' + x.slice(0, 300))); if (d.length) bad++;
  }
  const keys = Object.keys(a.segs); let segBad = 0;
  for (const k of keys) if (norm(a.segs[k]) !== norm(b.segs[k])) { if (segBad++ < 5) console.log('BEDA panel Delivery Segment ' + k + '\n   lama: ' + a.segs[k].slice(0, 400) + '\n   baru: ' + (b.segs[k] || '').slice(0, 400)); }
  console.log(`${segBad ? 'BEDA' : 'SAMA'}  panel Delivery Segment: ${keys.length - segBad}/${keys.length} kab/kota identik`);
  console.log(`error halaman lama: ${a.errs.length}, baru: ${b.errs.length}`, [...a.errs, ...b.errs].slice(0, 5));
  await browser.close(); server.kill();
  process.exit(bad || segBad || a.errs.length || b.errs.length ? 1 : 0);
})();
