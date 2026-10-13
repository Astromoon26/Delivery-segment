# Delivery Segment Dashboard — panduan buat Claude

Dashboard jaringan pengiriman Kawan Lama Group (BU **HCI** & **AHI**): coverage NDC → RDC → SDC → HUB per kabupaten/kota, rute, lead time. Owner: Apip (Transport Services Analyst). Bahasa: Indonesia santai.

- Repo: `Astromoon26/Delivery-segment` · Live: `https://astromoon26.github.io/Delivery-segment/`
- **Satu file statis `index.html`** (HTML+CSS+JS inline, tanpa build). Deploy = Apip upload `index.html` ke repo (GitHub Pages).
- Sumber data: Google Sheet `1hfl1n3E8tc-1YLfHlBelDl58TM_zPh99O2hgA56cn0Q`, dibaca live lewat gviz CSV. **Dashboard read-only.**

## Arahan tetap dari Apip (jangan dilanggar)
1. Semua edit data (coverage, lead time/SLA, cost) dilakukan di gsheet. Jangan hardcode data di `index.html`.
2. Delivery segment dibedakan per BU (toggle HCI/AHI).
3. Cuma **NDC** yang cover semua kab/kota. HUB/SDC/RDC cuma sebagian.
4. Logika rantai (mid mile + last mile): kalau RDC/SDC kosong → lihat HUB; kalau semua kosong → NDC langsung.
5. Peta per kabupaten/kota (choropleth), bukan per provinsi.
6. Format lead time seragam: **"Darat Xh · Laut Yh"** (h = hari). Last mile pakai template yang sama.
7. Hub-to-hub (mis. Pekanbaru → Dumai) adalah segmen resmi dan harus tampil di tabel, rute, dan export.
8. *(diganti arahan 13)* Istilah lama "Reguler rute" / "Direct NDC" / "Flow sekarang" tidak dipakai lagi di UI Delivery Segment.
9. Tab Delivery Segment **tidak menampilkan daftar langkah rute lagi** (dihapus atas permintaan Apip). Rincian ada di *Perbandingan rute → Breakdown per segmen* (lead time Darat/Laut + cost per segmen).
10. Project rute dan awal Rute 1 boleh beda NDC (kolom opsional `NDC Reguler` di tab NDC); jangan hardcode pengecualian per kab/kota di `index.html`.
11. *(diganti arahan 13)* "Other rute" sekarang bernama **Opsional rute** (khusus Kalimantan & Sulawesi).
12. Di tab Delivery Segment, titik akhir rute disebut **"Cust / Sto"** (bukan "Tujuan"). Legend garis rute ada di pojok kiri bawah peta (`setSegLegend`), bukan di tabel.
13. Perbandingan rute di Delivery Segment: **Project rute** (= direct NDC → Cust / Sto, data dari tab NDC) + **Rute 1** + **Opsional rute**, satu rute per NDC yang meng-cover kab/kota, semuanya lewat rantai fasilitas yang sama. Rute 1 = asal `NDC Reguler` (atau NDC project kalau kolom itu kosong); **Opsional rute** = NDC lain di BU (hanya pulau di `OTHER_RUTE_PULAU` = Kalimantan & Sulawesi, hanya kalau ada HUB/SDC/RDC); kalau ada >1 NDC lain jadi "Opsional rute 1, 2, …". Pakai istilah ini di UI dan dokumen.

## Peta kode `index.html` (cari via nama fungsi)
| Bagian | Fungsi utama |
|---|---|
| Config | `GSHEET_ID`, `SHEETS`, `LT_SHEETS`, `TOPO_BASE/TOPO_FILES`, `TYPE_COLOR`, `TIER_ORDER`, `OTHER_RUTE_PULAU`, `ROUTE_STYLES` |
| Baca sheet | `gvizUrl`, `fetchSheet`, `loadGoogleSheetData`, `parseCSV` (keyed) — **`parseF2FHci`, `parseLegSheet` (posisional, karena header dobel)** |
| Nama & matching | `normName`, `cleanSpacedLetters`, `joinKey`, `resolveGeo`, **`normFacName` + `FAC_ALIAS`**, `legKey` |
| Model data | `buildFacilities`, `resolveLatLon`, `buildCoverage` (`COVERAGE[bu][key][tier]`), `buildLeadTime`, `buildHubFeeder/applyHubFeeder` (`HUB.via`) |
| Tampilan | `addBasemap/initMap`, `renderChoropleth`, `renderFacilityMarkers`, `renderTable`, `exportTableCSV`, `renderF2F`, `openDetail` |
| Delivery Segment | `renderSegmentRoute` (peta mini), `routeNdcNames`, `buildSegments` (per segmen: lead time + cost), `totalsOf`, `renderCompare` (tabel perbandingan + breakdown per segmen), `buildCostLeg`, `parseMoney` |
| Bootstrap | `loadAll` → `rerenderAll` |

## Skema gsheet (detail kolom: `docs/PANDUAN_GSHEET.md`)
`Name of Facility` · `Hub|SDC|RDC|NDC` × `AHI|HCI` · `Matriks Facility to Facility AHI|HCI` · `Lead Time Facility to Facility AHI|HCI` · `Cost Facility to Facility AHI|HCI` (format sama dengan Lead Time: Remark, Facility, Facility, Cost Land, Cost Sea; dibaca ke `COST_LEG`).
Tab `NDC <BU>`: kolom `NDC` = asal **Project rute** (+ nilai di Tabel Coverage + lead time/cost project). Kolom **opsional** `NDC Reguler` (alias: `Reguler NDC`, `NDC Rute Reguler`) = asal **Rute 1** kalau beda dari NDC project (nama kolom di sheet tidak diganti supaya data lama tetap jalan). Dibaca ke `COVERAGE[bu][key].NDC.reguler`; `regulerDiffers(c)` menentukan; hanya berlaku bila kab/kota punya HUB/SDC/RDC.
**Opsional rute** (hanya pulau di `OTHER_RUTE_PULAU` = Kalimantan & Sulawesi, hanya kalau ada HUB/SDC/RDC): rantai yang sama dengan Rute 1 tapi mulai dari NDC lain (id rute: `Rute 1`, `Opsional rute` / `Opsional rute N`). `routeNdcNames(c, hasMid)` = [asal Rute 1, lalu semua NDC lain di BU, atau satu NDC dari override kolom opsional `NDC Other`]; `renderCompare(c, routes)` membuat kolom + breakdown per rute; peta: satu garis per rute (`ROUTE_STYLES`) + legend.
Kolom wajib per tab coverage: `No, Kabupaten/Kota, Tipe, Provinsi, Pulau/Kepulauan, <Tier>, Lead Time land, Cost` (NDC: `Lead Time Land/Sea`, `Cost Land/Sea`). Header sering di-rename Apip → selalu baca lewat `pickField(...alias)`.

## Quirk yang sudah pernah bikin bug
- **Long/Lat di Name of Facility tertukar** → `resolveLatLon` deteksi otomatis lewat rentang Indonesia.
- **Header dobel** (Matriks HCI `HUB,HUB`; Lead Time `Facility,Facility`) → wajib parsing posisional. Kolom HUB ke-2 = hub feeder (hub yang menyuplai hub itu).
- **Nama fasilitas beda antar tab**: prefix `HUB ` / `BKS ` dibuang, alias (Yogya, Tasik, Jogja, Kuta Bali, Denpasar/Sempidi Bali), spasi dirapikan. Tambah alias di **dua tempat**: `FAC_ALIAS` di `index.html` dan di `scripts/validate_sheet.py`.
- **Nama kab/kota spasi-huruf** ("S I A K") → `cleanSpacedLetters`; Kabupaten vs Kota dibedakan di `joinKey` / `resolveGeo` (id topojson suffix ≥71 = Kota).
- gviz/Drive-MCP/XLSX export bisa **basi** dan memotong nama tab 31 karakter. Tarik live via gviz + `&_ts=`.
- Peta: **CARTO dark_all sekarang butuh API key** (watermark "API KEY REQUIRED"). Basemap sekarang Esri World Dark Gray (tanpa key, fallback OSM). Jangan balik ke CARTO. Kalau ganti ke provider berkey (Mapbox/MapTiler), key publik di GitHub Pages → wajib di-restrict ke domain.
- Polygon sumber `ghapsara/indonesia-atlas` tidak punya 8 kab/kota baru → muncul di tabel, tidak di peta (`unmatchedKabkota`).
- Tab Delivery Segment menyembunyikan `.sidebar` (`body.tab-segment`) → elemen di dalamnya `display:none`: di tes baca pakai `textContent`, bukan `innerText`. Lebar panel `--seg-w` bisa digeser (`initSegResizer`, localStorage `seg-panel-w`).
- Test dari `file://` kena CORS ke gviz → selalu lewat server HTTP lokal.

## Alur kerja tiap permintaan update
1. **Tarik data live & validasi dulu**: `python3 -I scripts/validate_sheet.py` (tambah `--bu HCI`, `--max 20`). Kalau ada ERROR/WARN baru yang relevan, kabari Apip — sering akar masalahnya data, bukan kode.
2. Edit `index.html` (pertahankan satu file; jangan tambah dependency baru tanpa alasan kuat; CDN hanya cdnjs/jsdelivr/unpkg dengan versi tetap).
3. **Smoke test wajib**: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/smoke_test.js` (jangan `playwright install`). Lihat screenshot di `.smoke/`.
4. Tambah assertion di `smoke_test.js` untuk fitur baru yang rawan regresi.
5. Update `CHANGELOG.md` (tanggal, apa, kenapa) dan, kalau skema/quirk berubah, bagian terkait di file ini + `docs/PANDUAN_GSHEET.md`.
6. Kirim `index.html` ke Apip (`SendUserFile`) + ringkasan: apa yang berubah, temuan data yang perlu dia benahi di gsheet.
Commit/PR hanya kalau diminta; pakai template di `.github/pull_request_template.md`.

## Definition of done
Smoke test 100% lolos · tidak ada error console · tampilan dicek lewat screenshot (Peta, Delivery Segment, Tabel) · angka lead time dicek manual untuk 1 contoh · temuan data dilaporkan.

## Backlog & temuan data (per 2026-10-12, hasil `validate_sheet.py`)
**Fitur:**
- Validasi coverage vs Matriks di dalam dashboard (sekarang cuma lewat script).
- Baca kolom baru SDC AHI: `aging POO`, `Sailing Time`, `Aging POD`.
- Tabel massal selisih direct vs flow semua kab/kota + export CSV.
- 8 kab/kota tanpa polygon (Kota Pontianak, Buton Selatan, Buton Tengah, Konawe Kepulauan, Muna Barat, Pegunungan Arfak, Bayung Lencir, Musi Banyuasin Exclude Bayung Lencir).
- Review 2 PR terbuka di repo. Masa depan: pergerakan barang, outbound lead time RDC/SDC/HUB.

**Data di gsheet (yang harus Apip benahi):**
- HCI: 41 kab/kota di bawah hub yang Matriks-nya RDC=Tamora, tapi tab `RDC HCI` kosong untuk mereka (mis. Aceh Besar, Pidie, Bengkalis, Indragiri Hilir/Hulu, Kampar) → langkah RDC hilang di rute.
- HCI: tab Hub berisi nama gabungan "Jember / banyuwangi" (bukan satu fasilitas) → pecah per hub.
- HCI Lead Time: leg `Sidoarjo → Tallo` belum ada (Palopo); leg `Jakarta → Pekanbaru` dobel.
- AHI: SDC Abepura, Lombok, Ternate dipakai di tab SDC/Matriks/Lead Time AHI tapi di `Name of Facility` cuma berlabel BU "HCI" (tidak ada marker AHI). AHI Palu: Matriks tanpa RDC, tab RDC bilang Tallo.
- Isian kosong (cek ulang dengan `validate_sheet.py`, angka cepat berubah): cost di semua tab (last mile, direct NDC, Cost F2F) belum terisi → breakdown cost tampil "cost —".
- Cost F2F HCI baris pertama memakai asal "NDC" (bukan "Jakarta") → tidak akan nyambung ke leg manapun.
