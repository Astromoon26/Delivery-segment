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
8. Di tab Delivery Segment, rute lewat fasilitas disebut **"Reguler rute"** (bukan "Flow sekarang"); pembandingnya **"Direct NDC"**. Pakai istilah ini di UI dan dokumen.

## Peta kode `index.html` (cari via nama fungsi)
| Bagian | Fungsi utama |
|---|---|
| Config | `GSHEET_ID`, `SHEETS`, `LT_SHEETS`, `TOPO_BASE/TOPO_FILES`, `TYPE_COLOR`, `TIER_ORDER` |
| Baca sheet | `gvizUrl`, `fetchSheet`, `loadGoogleSheetData`, `parseCSV` (keyed) — **`parseF2FHci`, `parseLegSheet` (posisional, karena header dobel)** |
| Nama & matching | `normName`, `cleanSpacedLetters`, `joinKey`, `resolveGeo`, **`normFacName` + `FAC_ALIAS`**, `legKey` |
| Model data | `buildFacilities`, `resolveLatLon`, `buildCoverage` (`COVERAGE[bu][key][tier]`), `buildLeadTime`, `buildHubFeeder/applyHubFeeder` (`HUB.via`) |
| Tampilan | `addBasemap/initMap`, `renderChoropleth`, `renderFacilityMarkers`, `renderTable`, `exportTableCSV`, `renderF2F`, `openDetail` |
| Delivery Segment | `renderSegmentRoute`, `computeRouteCompare`, `renderCompare` |
| Bootstrap | `loadAll` → `rerenderAll` |

## Skema gsheet (detail kolom: `docs/PANDUAN_GSHEET.md`)
`Name of Facility` · `Hub|SDC|RDC|NDC` × `AHI|HCI` · `Matriks Facility to Facility AHI|HCI` · `Lead Time Facility to Facility AHI|HCI` · (`Cost Facility to Facility AHI|HCI` ada, **belum dibaca**).
Kolom wajib per tab coverage: `No, Kabupaten/Kota, Tipe, Provinsi, Pulau/Kepulauan, <Tier>, Lead Time land, Cost` (NDC: `Lead Time Land/Sea`, `Cost Land/Sea`). Header sering di-rename Apip → selalu baca lewat `pickField(...alias)`.

## Quirk yang sudah pernah bikin bug
- **Long/Lat di Name of Facility tertukar** → `resolveLatLon` deteksi otomatis lewat rentang Indonesia.
- **Header dobel** (Matriks HCI `HUB,HUB`; Lead Time `Facility,Facility`) → wajib parsing posisional. Kolom HUB ke-2 = hub feeder (hub yang menyuplai hub itu).
- **Nama fasilitas beda antar tab**: prefix `HUB ` / `BKS ` dibuang, alias (Yogya, Tasik, Jogja, Kuta Bali, Denpasar/Sempidi Bali), spasi dirapikan. Tambah alias di **dua tempat**: `FAC_ALIAS` di `index.html` dan di `scripts/validate_sheet.py`.
- **Nama kab/kota spasi-huruf** ("S I A K") → `cleanSpacedLetters`; Kabupaten vs Kota dibedakan di `joinKey` / `resolveGeo` (id topojson suffix ≥71 = Kota).
- gviz/Drive-MCP/XLSX export bisa **basi** dan memotong nama tab 31 karakter. Tarik live via gviz + `&_ts=`.
- Peta: **CARTO dark_all sekarang butuh API key** (watermark "API KEY REQUIRED"). Basemap sekarang Esri World Dark Gray (tanpa key, fallback OSM). Jangan balik ke CARTO. Kalau ganti ke provider berkey (Mapbox/MapTiler), key publik di GitHub Pages → wajib di-restrict ke domain.
- Polygon sumber `ghapsara/indonesia-atlas` tidak punya 8 kab/kota baru → muncul di tabel, tidak di peta (`unmatchedKabkota`).
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
- Baca tab `Cost Facility to Facility` (kosong; HCI 1 baris) → total cost flow & perbandingan cost.
- Baca kolom baru SDC AHI: `aging POO`, `Sailing Time`, `Aging POD`.
- Tabel massal selisih direct vs flow semua kab/kota + export CSV.
- 8 kab/kota tanpa polygon (Kota Pontianak, Buton Selatan, Buton Tengah, Konawe Kepulauan, Muna Barat, Pegunungan Arfak, Bayung Lencir, Musi Banyuasin Exclude Bayung Lencir).
- Review 2 PR terbuka di repo. Masa depan: pergerakan barang, outbound lead time RDC/SDC/HUB.

**Data di gsheet (yang harus Apip benahi):**
- HCI: 41 kab/kota di bawah hub yang Matriks-nya RDC=Tamora, tapi tab `RDC HCI` kosong untuk mereka (mis. Aceh Besar, Pidie, Bengkalis, Indragiri Hilir/Hulu, Kampar) → langkah RDC hilang di rute.
- HCI: tab Hub berisi nama gabungan "Jember / banyuwangi" (bukan satu fasilitas) → pecah per hub.
- HCI Lead Time: leg `Sidoarjo → Tallo` belum ada (Palopo); leg `Jakarta → Pekanbaru` dobel.
- AHI: SDC Abepura, Lombok, Ternate dipakai di tab SDC/Matriks/Lead Time AHI tapi di `Name of Facility` cuma berlabel BU "HCI" (tidak ada marker AHI). AHI Palu: Matriks tanpa RDC, tab RDC bilang Tallo.
- Isian kosong: NDC direct lead time 1/514 & cost 0 (HCI & AHI); RDC lead time 0/34; SDC HCI 1/28; semua cost 0.
