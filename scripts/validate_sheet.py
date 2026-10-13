#!/usr/bin/env python3
"""
Validasi gsheet Delivery Segment sebelum / sesudah update dashboard.

Pakai:
  python3 scripts/validate_sheet.py                 # tarik live dari gsheet (HCI + AHI)
  python3 scripts/validate_sheet.py --bu HCI        # satu BU saja
  python3 scripts/validate_sheet.py --cache .cache  # simpan/baca CSV lokal (hemat request)
  python3 scripts/validate_sheet.py --max 5         # contoh per temuan (default 8)

Exit code: 1 kalau ada ERROR (skema rusak / fasilitas tak dikenal), selain itu 0.
Aturan normalisasi nama HARUS sama dengan normFacName() di index.html
(buang prefix "HUB "/"BKS ", alias Yogya/Tasik, huruf kecil).
"""
import argparse, csv, io, os, re, ssl, sys, urllib.parse, urllib.request
from collections import defaultdict

GSHEET_ID = '1hfl1n3E8tc-1YLfHlBelDl58TM_zPh99O2hgA56cn0Q'
TABS = {
    'facility': 'Name of Facility',
    'cov': lambda bu, t: f'{t} {bu}',                       # Hub/SDC/RDC/NDC + BU
    'f2f': lambda bu: f'Matriks Facility to Facility {bu}',
    'lt':  lambda bu: f'Lead Time Facility to Facility {bu}',
    'cost': lambda bu: f'Cost Facility to Facility {bu}',
}
# KEEP IN SYNC with FAC_ALIAS in index.html
FAC_ALIAS = {'yogya': 'yogyakarta', 'tasik': 'tasikmalaya',
             'jogja': 'yogyakarta', 'kuta bali': 'kuta', 'denpasar/sempidi bali': 'denpasar'}
TIERS = ['HUB', 'SDC', 'RDC', 'NDC']
EXPECTED = {  # kolom wajib per tab (case-insensitive, substring boleh)
    'HUB': ['kabupaten/kota', 'provinsi', 'hub'],
    'SDC': ['kabupaten/kota', 'provinsi', 'sdc'],
    'RDC': ['kabupaten/kota', 'provinsi', 'rdc'],
    'NDC': ['kabupaten/kota', 'provinsi', 'ndc'],
}

# ---------- util ----------
def norm_fac(s):
    n = re.sub(r'^(hub|bks)\s+', '', (s or '').strip(), flags=re.I).lower()
    n = re.sub(r'\s+', ' ', n)
    return FAC_ALIAS.get(n, n)

def clean_spaced(s):
    t = (s or '').strip().split(' ')
    return ''.join(t) if len(t) > 2 and all(len(x) <= 2 for x in t) else (s or '').strip()

def kab_key(name, prov):
    s = (name or '').strip()
    m = re.match(r'^(Kabupaten|Kota Administrasi|Kota)\s+', s, re.I)
    pre = 'other'
    if m:
        pre = 'kota' if m.group(1).lower().startswith('kota') else 'kabupaten'
        s = s[m.end():]
    s = clean_spaced(s).lower().replace('-', ' ').replace('.', '')
    return f"{pre}|{re.sub(chr(32)+'+', ' ', s).strip()}|{(prov or '').strip().lower()}"

def num(v):
    v = (v or '').strip()
    if v in ('', '-'):
        return None
    try:
        return float(v.replace(',', '.'))
    except ValueError:
        return None

def ssl_ctx():
    ca = os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if os.path.exists('/root/.ccr/ca-bundle.crt') else None)
    return ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()

def fetch(tab, cache):
    path = os.path.join(cache, re.sub(r'\W+', '_', tab) + '.csv') if cache else None
    if path and os.path.exists(path):
        return open(path, encoding='utf-8').read()
    url = (f'https://docs.google.com/spreadsheets/d/{GSHEET_ID}/gviz/tq?tqx=out:csv&sheet=' + urllib.parse.quote(tab))
    with urllib.request.urlopen(url, context=ssl_ctx(), timeout=60) as r:
        text = r.read().decode('utf-8')
    if path:
        os.makedirs(cache, exist_ok=True)
        open(path, 'w', encoding='utf-8').write(text)
    return text

def rows(text):
    return list(csv.reader(io.StringIO(text)))

def table(text):
    """list of dict, header-keyed (kolom duplikat ditangani lewat rows() positional)."""
    r = rows(text)
    if not r:
        return [], []
    h = [c.strip() for c in r[0]]
    return h, [dict(zip(h, row)) for row in r[1:]]

# ---------- report ----------
class Report:
    def __init__(self, maxn):
        self.maxn, self.items, self.errors = maxn, [], 0
    def add(self, level, title, details=None):
        if level == 'ERROR':
            self.errors += 1
        self.items.append((level, title, details or []))
    def print(self):
        order = {'ERROR': 0, 'WARN': 1, 'INFO': 2, 'OK': 3}
        for level, title, det in sorted(self.items, key=lambda x: order[x[0]]):
            print(f'[{level}] {title}')
            for d in det[:self.maxn]:
                print(f'    - {d}')
            if len(det) > self.maxn:
                print(f'    ... +{len(det) - self.maxn} lagi')

# ---------- checks ----------
def check_bu(bu, cache, rep):
    P = f'{bu}: '
    texts = {}
    try:
        texts['fac'] = fetch(TABS['facility'], cache)
        for t in TIERS:
            texts[t] = fetch(TABS['cov'](bu, 'Hub' if t == 'HUB' else t), cache)
        texts['f2f'] = fetch(TABS['f2f'](bu), cache)
        texts['lt'] = fetch(TABS['lt'](bu), cache)
        texts['cost'] = fetch(TABS['cost'](bu), cache)
    except Exception as e:
        rep.add('ERROR', P + f'gagal tarik sheet: {e}')
        return

    # --- facilities
    fh, fac = table(texts['fac'])
    facs = [f for f in fac if (f.get('Name Site') or '').strip() and bu in (f.get('Bussines Unit') or '')]
    fac_names = {norm_fac(f['Name Site']): f for f in facs}
    fac_type = {norm_fac(f['Name Site']): f['Type'].strip().upper() for f in facs}
    bad_coord = []
    for f in facs:
        try:
            a, b = float(f['Long']), float(f['Lat'])
        except (ValueError, KeyError):
            bad_coord.append(f"{f['Name Site']}: koordinat bukan angka")
            continue
        lon, lat = (a, b) if 95 <= a <= 141 else (b, a)      # kolom Long/Lat di sheet tertukar
        if not (95 <= lon <= 141 and -11 <= lat <= 6):
            bad_coord.append(f"{f['Name Site']}: {a},{b} di luar Indonesia")
    rep.add('ERROR' if bad_coord else 'OK', P + f'{len(facs)} fasilitas, koordinat valid' if not bad_coord else P + 'koordinat fasilitas bermasalah', bad_coord)

    # --- coverage tabs: schema, duplicates, fill rate, unknown facility
    cov = {}   # tier -> {key: {'name':..., 'raw':...}}
    for t in TIERS:
        h, data = table(texts[t])
        hl = [c.lower() for c in h]
        miss = [e for e in EXPECTED[t] if not any(e in c for c in hl)]
        if miss:
            rep.add('ERROR', P + f'tab {t}: kolom wajib hilang {miss} (header: {h})')
            continue
        col = next(c for c in h if c.strip().upper() == t)
        lt_cols = [c for c in h if 'lead time' in c.lower() or c.lower() == 'sla']
        cost_cols = [c for c in h if 'cost' in c.lower()]
        seen, dup, unknown = {}, [], set()
        cov[t] = {}
        for r in data:
            if not (r.get('Kabupaten/Kota') or '').strip():
                continue
            k = kab_key(r['Kabupaten/Kota'], r.get('Provinsi'))
            if k in seen:
                dup.append(f"{r['Kabupaten/Kota']} ({r.get('Provinsi')}) dobel di tab {t}")
            seen[k] = 1
            nm = (r.get(col) or '').strip()
            if nm:
                cov[t][k] = {'name': nm, 'raw': r}
                if norm_fac(nm) not in fac_names:
                    unknown.add(nm)
        if t == 'NDC':
            # kolom opsional "NDC Reguler": asal rantai Reguler rute kalau beda dari NDC direct
            rcol = next((c for c in h if c.strip().lower() in ('ndc reguler', 'reguler ndc', 'ndc rute reguler', 'ndc reguler rute')), None)
            if rcol:
                bad_reg, n_reg = set(), 0
                for v in cov[t].values():
                    rv = (v['raw'].get(rcol) or '').strip()
                    if rv:
                        n_reg += 1
                        if norm_fac(rv) not in fac_names:
                            bad_reg.add(rv)
                if bad_reg:
                    rep.add('ERROR', P + 'tab NDC: "NDC Reguler" berisi nama tak ada di "Name of Facility"', sorted(bad_reg))
                rep.add('INFO', P + f'tab NDC: kolom "{rcol}" terisi {n_reg} kab/kota (asal Rute 1 beda dari NDC project rute)')
            ocol = next((c for c in h if c.strip().lower() in ('ndc other', 'other ndc', 'ndc other rute', 'ndc rute other')), None)
            if ocol:
                bad_oth, n_oth = set(), 0
                for v in cov[t].values():
                    ov = (v['raw'].get(ocol) or '').strip()
                    if ov:
                        n_oth += 1
                        if norm_fac(ov) not in fac_names:
                            bad_oth.add(ov)
                if bad_oth:
                    rep.add('ERROR', P + 'tab NDC: "NDC Other" berisi nama tak ada di "Name of Facility"', sorted(bad_oth))
                rep.add('INFO', P + f'tab NDC: kolom "{ocol}" terisi {n_oth} kab/kota (override asal Opsional rute)')
            ndcs = sorted(f['Name Site'].strip() for f in facs if (f.get('Type') or '').strip().upper() == 'NDC')
            if len(ndcs) != 2:
                rep.add('WARN', P + f'Opsional rute otomatis dari NDC lain di Name of Facility; BU ini punya {len(ndcs)} NDC (normal: 2) — cek, atau isi kolom "NDC Other" per kab/kota', ndcs)
        if dup:
            rep.add('WARN', P + f'tab {t}: kab/kota dobel', dup)
        if unknown:
            rep.add('ERROR', P + f'tab {t}: nama fasilitas tidak ada di "Name of Facility"', sorted(unknown))
        n = len(cov[t])
        fills = []
        for c in lt_cols + cost_cols:
            f = sum(1 for k, v in cov[t].items() if (v['raw'].get(c) or '').strip())
            fills.append(f'{c}: {f}/{n}')
        rep.add('INFO', P + f'tab {t}: {n} kab/kota ter-assign; isian kolom -> ' + ('; '.join(fills) or '(tidak ada kolom lead time/cost)'))

    # --- matriks (posisional: kolom HUB bisa dobel)
    mr = rows(texts['f2f'])
    mat = []
    if not mr or 'hub' not in ','.join(mr[0]).lower():
        rep.add('ERROR', P + 'Matriks F2F: header harus diawali kolom HUB (sheet ketimpa?)', [str(mr[:1])])
    else:
        hdr = [c.strip().upper() for c in mr[0]]
        two_hub = hdr.count('HUB') > 1
        for r in mr[1:]:
            r = [c.strip() for c in r] + [''] * 6
            if two_hub:
                mat.append({'hub': r[0], 'hub2': r[1], 'sdc': r[2], 'rdc': r[3], 'ndc': r[4]})
            else:
                mat.append({'hub': r[0], 'hub2': '', 'sdc': r[1], 'rdc': r[2], 'ndc': r[3]})
        unknown = set()
        for m in mat:
            for k in ('hub', 'hub2', 'sdc', 'rdc', 'ndc'):
                if m[k] and norm_fac(m[k]) not in fac_names:
                    unknown.add(f"{m[k]} (kolom {k.upper()})")
        if unknown:
            rep.add('WARN', P + 'Matriks: nama tidak ada di "Name of Facility"', sorted(unknown))

    # --- hub di coverage vs matriks
    hubs_cov = {norm_fac(v['name']) for v in cov.get('HUB', {}).values()}
    hubs_mat = {norm_fac(m['hub']) for m in mat if m['hub']}
    if mat:
        a = sorted(hubs_cov - hubs_mat); b = sorted(hubs_mat - hubs_cov)
        if a: rep.add('WARN', P + 'Hub ada di tab Hub tapi TIDAK ada di Matriks', a)
        if b: rep.add('WARN', P + 'Hub ada di Matriks tapi TIDAK dipakai di tab Hub', b)

    # --- coverage vs matriks: SDC/RDC/NDC yang seharusnya
    mrow = {norm_fac(m['hub']): m for m in mat if m['hub']}
    sdc_only = {norm_fac(m['sdc']): m for m in mat if not m['hub'] and m['sdc']}
    mism = []
    for k, h in cov.get('HUB', {}).items():
        m = mrow.get(norm_fac(h['name']))
        if not m:
            continue
        for tier, mk in (('SDC', 'sdc'), ('RDC', 'rdc'), ('NDC', 'ndc')):
            want = norm_fac(m[mk]); got = norm_fac(cov.get(tier, {}).get(k, {}).get('name', ''))
            if want != got:
                mism.append(f"{h['raw']['Kabupaten/Kota']}: hub {h['name']} -> matriks {tier}={m[mk] or '(kosong)'}, tab {tier}={cov.get(tier, {}).get(k, {}).get('name', '(kosong)')}")
    for k, s in cov.get('SDC', {}).items():
        if k in cov.get('HUB', {}):
            continue
        m = sdc_only.get(norm_fac(s['name']))
        if not m:
            continue
        for tier, mk in (('RDC', 'rdc'), ('NDC', 'ndc')):
            want = norm_fac(m[mk]); got = norm_fac(cov.get(tier, {}).get(k, {}).get('name', ''))
            if want != got:
                mism.append(f"{s['raw']['Kabupaten/Kota']}: SDC {s['name']} -> matriks {tier}={m[mk] or '(kosong)'}, tab {tier}={cov.get(tier, {}).get(k, {}).get('name', '(kosong)')}")
    rep.add('WARN' if mism else 'OK', P + f'coverage vs Matriks: {len(mism)} kab/kota beda dari rantai resmi' if mism else P + 'coverage cocok dengan Matriks', mism)

    # --- lead time legs
    lr = rows(texts['lt'])
    legs = {}
    dup_leg, typo = [], []
    for r in lr[1:]:
        r = [c.strip() for c in r] + [''] * 5
        remark, a, b, land, sea = r[0], r[1], r[2], r[3], r[4]
        if not (a and b):
            continue
        k = f'{norm_fac(a)}|{norm_fac(b)}'
        if k in legs:
            dup_leg.append(f'{a} -> {b} muncul lebih dari sekali')
        legs[k] = (num(land), num(sea))
        for x in (a, b):
            ty = fac_type.get(norm_fac(x))
            if norm_fac(x) not in fac_names:
                typo.append(f'"{x}" ({remark}) tidak ada di Name of Facility')
    if dup_leg: rep.add('WARN', P + 'Lead Time: leg dobel', dup_leg)
    if typo: rep.add('WARN', P + 'Lead Time: nama fasilitas tak dikenal (typo/beda nama?)', sorted(set(typo)))

    miss_legs = []
    def need(a, b, ctx):
        k = f'{norm_fac(a)}|{norm_fac(b)}'
        v = legs.get(k)
        if v is None or (v[0] is None and v[1] is None):
            miss_legs.append(f'{a} -> {b}  (untuk {ctx})')
    for m in mat:
        chain = [m['ndc'], m['rdc'], m['sdc'], m['hub2'], m['hub']]
        chain = [c for c in chain if c]
        for a, b in zip(chain, chain[1:]):
            need(a, b, m['hub'] or m['sdc'])
    miss_legs = sorted(set(miss_legs))
    rep.add('WARN' if miss_legs else 'OK', P + f'leg lead time yang dibutuhkan rantai Matriks tapi belum ada/kosong: {len(miss_legs)}' if miss_legs else P + 'semua leg Matriks punya lead time', miss_legs)

    # --- cost F2F
    cr = rows(texts['cost'])
    filled = sum(1 for r in cr[1:] if any(c.strip() for c in r[3:]))
    rep.add('INFO', P + f'Cost Facility to Facility: {filled} baris berisi (0 = belum diisi; dashboard membacanya untuk breakdown cost per segmen)')
    bad_cost = []
    for r in cr[1:]:
        r = [c.strip() for c in r] + [''] * 5
        for x in (r[1], r[2]):
            if x and norm_fac(x) not in fac_names:
                bad_cost.append(f'"{x}" ({r[0]}) tidak ada di Name of Facility')
    if bad_cost: rep.add('WARN', P + 'Cost F2F: nama fasilitas tak dikenal (typo/beda nama?)', sorted(set(bad_cost)))

    # --- Rute Numbered (opsional): tab "Rute Numbered <BU>" berisi Rute 2, 3, ... per kab/kota
    try:
        rt = fetch(f'Rute Numbered {bu}', cache)
    except Exception:
        rt = ''
    rh, rdata = table(rt)
    rcols = [c for c in rh if re.match(r'^(rute\s*\d+|opsional(\s*rute)?\s*\d*|project(\s*rute)?\s*\d*)$', c.strip(), re.I)]
    if 'Kabupaten/Kota' not in rh or not rcols:
        rep.add('INFO', P + 'tab "Rute Numbered ' + bu + '" belum ada / belum berisi (opsional; dipakai untuk Rute 2, 3, ... per kab/kota)')
        return
    served = {}          # kab/kota (tanpa provinsi) -> nama fasilitas yang melayani (HUB/SDC/RDC)
    for t in ('HUB', 'SDC', 'RDC'):
        for k, v in cov.get(t, {}).items():
            served.setdefault('|'.join(k.split('|')[:2]), {})[t] = norm_fac(v['name'])
    nroute, bad_name, bad_first, bad_last, bad_kab, miss = 0, [], [], [], [], []
    for r in rdata:
        kab = (r.get('Kabupaten/Kota') or '').strip()
        if not kab:
            continue
        kk = '|'.join(kab_key(kab, '').split('|')[:2])
        if kk not in served and not any(kk == '|'.join(k.split('|')[:2]) for k in cov.get('NDC', {})):
            bad_kab.append(f'{kab}: tidak ada di tab coverage BU {bu}')
        for col in rcols:
            raw = (r.get(col) or '').strip()
            if not raw:
                continue
            names = [x.strip() for x in re.split(r'\s*(?:→|->|=>|>|–|—|\s-\s)\s*', raw) if x.strip()]
            while names and re.match(r'^(cust\s*/?\s*sto|customer|tujuan)$', names[-1], re.I):
                names.pop()
            is_proj = bool(re.match(r'^project', col.strip(), re.I))
            if len(names) < (1 if is_proj else 2):
                continue
            nroute += 1
            ctx = f'{kab} {col}'
            for n in names:
                if norm_fac(n) not in fac_names:
                    bad_name.append(f'{ctx}: "{n}" tidak ada di Name of Facility')
            if fac_type.get(norm_fac(names[0])) != 'NDC':
                bad_first.append(f'{ctx}: langkah pertama "{names[0]}" bukan NDC')
            if len(names) > 1 and kk in served and norm_fac(names[-1]) not in served[kk].values():
                bad_last.append(f'{ctx}: "{names[-1]}" bukan fasilitas yang melayani kab/kota ini ({", ".join(f"{t} {n}" for t, n in served[kk].items())}) -> last mile kosong')
            for x, y in zip(names, names[1:]):
                v = legs.get(f'{norm_fac(x)}|{norm_fac(y)}')
                if v is None or (v[0] is None and v[1] is None):
                    miss.append(f'{x} -> {y}  (untuk {ctx})')
    if bad_kab: rep.add('ERROR', P + 'Rute Numbered: kab/kota tidak dikenal', bad_kab)
    if bad_name: rep.add('ERROR', P + 'Rute Numbered: nama fasilitas tidak ada di "Name of Facility"', bad_name)
    if bad_first: rep.add('ERROR', P + 'Rute Numbered: langkah pertama harus NDC', bad_first)
    if bad_last: rep.add('WARN', P + 'Rute Numbered: langkah terakhir bukan fasilitas yang melayani kab/kota', bad_last)
    miss = sorted(set(miss))
    rep.add('WARN' if miss else 'OK', P + f'Rute Numbered: {len(miss)} leg belum punya lead time (isi di tab Lead Time Facility to Facility {bu})' if miss else P + f'Rute Numbered: {nroute} rute, semua leg punya lead time', miss)
    rep.add('INFO', P + f'Rute Numbered: {nroute} rute tambahan terbaca')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bu', choices=['HCI', 'AHI'])
    ap.add_argument('--cache')
    ap.add_argument('--max', type=int, default=8)
    a = ap.parse_args()
    for bu in ([a.bu] if a.bu else ['HCI', 'AHI']):
        print(f'\n===== {bu} =====')
        rep = Report(a.max)
        check_bu(bu, a.cache, rep)
        rep.print()
        if rep.errors:
            globals().setdefault('_fail', True)
    sys.exit(1 if globals().get('_fail') else 0)

if __name__ == '__main__':
    main()
