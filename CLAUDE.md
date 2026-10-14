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
14. Urutan kolom/breakdown/legend di Perbandingan rute: **Rute 1 (dst.) → Opsional rute → Project rute** (tersegmen, ada pemisah). **Opsional rute & Project rute punya toggle tampil/sembunyi** (`SEG_VIS`, disimpan di `localStorage['seg-route-vis']`); Rute 1 selalu tampil. Selisih **LT saja** (tanpa cost) **tidak di tabel utama**: bagian "Selisih LT antar rute" **tepat setelah Breakdown per segmen** (sebelum Cost per armada), matriks (baris dibanding kolom) antar semua rute yang sedang tampil (ikut toggle); hilang kalau cuma satu rute tampil.

15. **Rute numbered (Rute 2, 3, …)** = rantai fasilitas alternatif per kab/kota, dibaca dari tab opsional **`Rute Numbered <BU>`** (`ROUTE_SHEETS`, `buildRouteAlt`, `ROUTE_ALT`, `resolveAltRoute`). Jangan hardcode rute per kab/kota di `index.html`. Urutan tampil: Rute 1, Rute 2, … → Opsional rute → Project rute (Rute 2+ selalu tampil, tidak ada toggle). Tab yang sama juga bisa berisi kolom **`Opsional rute N`** = Opsional rute custom per kab/kota (menggantikan Opsional rute otomatis untuk kab/kota itu, pulau mana pun, ikut toggle Opsional). Warna: `NUMBERED_STYLES` (Rute 2+) vs `OPSIONAL_STYLES` (Opsional) dibedakan.

16. Tab `Rute Numbered <BU>` mengatur **ketiga** kelompok: kolom `Rute N` (N ≥ 1; Rute 1 menggantikan rantai coverage), `Opsional rute N`, `Project rute N` (boleh cuma NDC = direct). Yang tidak ditulis per kab/kota → logika otomatis. Project rute 1 = pembanding Selisih. Test lain harus men-stub tab ini kosong (`emptyRouteTabs` di smoke test) karena gsheet sudah berisi data sungguhan.

17. Langkah pertama rute di tab `Rute Numbered` = NDC, **atau RDC/SDC/HUB** untuk rute berantai (≥2 nama, mis. `Tamora - Aceh`); `resolveAltRoute` memberi `steps[0].tier` aslinya (+`start:true`), jadi jangan mengasumsikan `steps[0]` selalu NDC (judul, marker peta, tooltip pakai `tier`). Satu nama juga valid: NDC = direct, RDC/SDC/HUB = fasilitas → Cust / Sto (last mile dari `c[tier]` kalau melayani kab/kota itu); pakai `isDirectSteps(steps)` untuk membedakan direct NDC dari rute satu langkah non-NDC.

18. **Cost per armada**: tab opsional `Armada` (`ARMADA_SHEET`, `buildArmada`: Armada, Kapasitas (cbm), Utilisasi (%) default 85 → `eff`) + kolom armada di kanan `Cost Sea` pada tab `Cost Facility to Facility <BU>` (header = nama armada [+ `Darat`/`Laut`], dibaca posisional ke `COST_LEG[bu][leg].ext` + `COST_HDR[bu]`, dikenali lewat `armadaCols(bu)`). Cost/cbm = cost/trip ÷ `eff`. Bagian "Cost per armada" (`armadaHtml` di `renderCompare`) ada **setelah Selisih LT**, per rute hanya tabel segmen × armada: **sel armada per segmen bisa diklik** untuk memilih armada segmen itu (klik lagi = batal; klik header armada = pilih untuk semua segmen rute itu), state di `SEG_ARM` (kunci `BU|id rute|legKey`, hanya memori). Total tiap rute = **hanya Cost/Trip & Cost/CBM dari armada terpilih** (jumlah per segmen, `≥…*` kalau ada segmen belum dipilih/kosong); tidak ada lagi tabel total per armada. Klik hanya menggambar ulang `#seg-armada`. Tabel armada = `table.seg-arm-tbl` (`table-layout:fixed`, kolom Segmen 150px sticky, kolom armada 104px rata kanan; **jangan** pakai aturan lebar `.seg-bd th:nth-child(2/3)` untuk tabel ini) dan total rute = blok `.arm-total` di bawah tabel (bukan baris tabel). Kapasitas jangan di-hardcode di kode dan **tidak ditampilkan** di header (arahan Apip). Tabel Perbandingan rute, Breakdown per segmen, dan Selisih **tanpa cost** (cost hanya di Cost per armada). **LT tetap satu angka per segmen** (Darat/Laut), tidak per armada. **Last mile** (Hub/SDC/RDC → Cust / Sto) ikut: tab `Hub|SDC|RDC <BU>` boleh punya kolom armada (header sama seperti Cost F2F, dikenali `armadaColsFrom` dari `LAST_HDR[bu][tier]`, nilai dari `d.raw`) + kolom `Cost/Trip` & `Cost/CBM` (`directHdrs`) = kolom **Langsung**; kolom digabung lewat `costColsAll(bu)` (kunci `ai|mode`), nilai per segmen lewat `legVal(leg, col)` → `{trip, cbm}`; `SEG_ARM` menyimpan kunci kolom (string). Direct NDC → Cust / Sto (tab NDC) belum per armada. Tes jangan bergantung pada kolom tab Hub asli: `LAST_HDR` dikosongkan / tab Hub di-stub. Judul bagian di-uppercase lewat CSS → di tes pakai regex `/i` atau `textContent`.

## Peta kode `index.html` (cari via nama fungsi)
| Bagian | Fungsi utama |
|---|---|
| Config | `GSHEET_ID`, `SHEETS`, `LT_SHEETS`, `TOPO_BASE/TOPO_FILES`, `TYPE_COLOR`, `TIER_ORDER`, `OTHER_RUTE_PULAU`, `ROUTE_STYLES` |
| Baca sheet | `gvizUrl`, `fetchSheet`, `loadGoogleSheetData`, `parseCSV` (keyed) — **`parseF2FHci`, `parseLegSheet` (posisional, karena header dobel)** |
| Nama & matching | `normName`, `cleanSpacedLetters`, `joinKey`, `resolveGeo`, **`normFacName` + `FAC_ALIAS`**, `legKey` |
| Model data | `buildFacilities`, `resolveLatLon`, `buildCoverage` (`COVERAGE[bu][key][tier]`), `buildLeadTime`, `buildHubFeeder/applyHubFeeder` (`HUB.via`) |
| Tampilan | `addBasemap/initMap`, `renderChoropleth`, `renderFacilityMarkers`, `renderTable`, `exportTableCSV`, `renderF2F`, `openDetail` |
| Delivery Segment | `renderSegmentRoute` (peta mini), `routeNdcNames`, `buildSegments` (per segmen: lead time + cost), `totalsOf`, `renderCompare` (tabel perbandingan + breakdown per segmen), `buildCostLeg`, `parseMoney`, `buildRouteAlt`/`resolveAltRoute`/`altKey`/`splitRouteChain` (Rute 2+), `NUMBERED_STYLES` |
| Bootstrap | `loadAll` → `rerenderAll` |

## Skema gsheet (detail kolom: `docs/PANDUAN_GSHEET.md`)
`Name of Facility` · `Hub|SDC|RDC|NDC` × `AHI|HCI` · `Matriks Facility to Facility AHI|HCI` · `Lead Time Facility to Facility AHI|HCI` · `Cost Facility to Facility AHI|HCI` (format sama dengan Lead Time: Remark, Facility, Facility, Cost Land, Cost Sea; dibaca ke `COST_LEG`).
Tab `NDC <BU>`: kolom `NDC` = asal **Project rute** (+ nilai di Tabel Coverage + lead time/cost project). Kolom **opsional** `NDC Reguler` (alias: `Reguler NDC`, `NDC Rute Reguler`) = asal **Rute 1** kalau beda dari NDC project (nama kolom di sheet tidak diganti supaya data lama tetap jalan). Dibaca ke `COVERAGE[bu][key].NDC.reguler`; `regulerDiffers(c)` menentukan; hanya berlaku bila kab/kota punya HUB/SDC/RDC.
**Opsional rute** (hanya pulau di `OTHER_RUTE_PULAU` = Kalimantan & Sulawesi, hanya kalau ada HUB/SDC/RDC): rantai yang sama dengan Rute 1 tapi mulai dari NDC lain (id rute: `Rute 1`, `Opsional rute` / `Opsional rute N`). `routeNdcNames(c, hasMid)` = [asal Rute 1, lalu semua NDC lain di BU, atau satu NDC dari override kolom opsional `NDC Other`]; `renderCompare(c, routes)` membuat kolom + breakdown per rute (urut Rute → Opsional → Project, filter `SEG_VIS`; toggle memanggil ulang `renderSegmentRoute(c,{keepView:true})`); peta: satu garis per rute (`ROUTE_STYLES`) + legend.
**Rute numbered**: tab `Rute Numbered HCI|AHI` (opsional): `Kabupaten/Kota` (dicocokkan lewat `altKey` = tipe+nama, provinsi diabaikan), `Provinsi` (info), `Rute 2`, `Rute 3`, … dan/atau `Rute 1` (menggantikan rantai coverage), `Opsional rute 1`, `Opsional rute 2`, … (atau `Opsional rute`), `Project rute 1`, `Project rute 2`, … (atau `Project rute`; boleh cuma NDC) ; sel = fasilitas dipisah ` - ` / `>` / `→`, NDC di awal, fasilitas pelayan kab/kota di akhir (last mile-nya diambil dari `c[tier]`), "Cust / Sto" opsional. Leg antar fasilitas pakai `LEAD_TIME`/`COST_LEG` yang sama dengan Rute 1. **Quirk:** gviz untuk tab yang belum ada mengembalikan sheet pertama (Name of Facility) → `buildRouteAlt` hanya menerima kalau header memuat `Kabupaten/Kota` dan `Rute N` / `Opsional ...`.
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
