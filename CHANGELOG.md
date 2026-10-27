# Changelog

Format: tanggal · perubahan · alasan. Entri terbaru di atas. Update tiap kali `index.html` berubah.

## 2026-10-27
- **Revisi tampilan besar: tab menu dihapus.** Tampilan utama (Home) = peta seluruh Indonesia + semua fasilitas DC + kab/kota berwarna per area; **7 area** (Sumatera, Jawa, Bali Nusra, Kalimantan, Sulawesi, Maluku, Papua) yang bisa diklik (di peta atau daftar).
- Klik area → **3 panel**: kiri peta zoom ke pulau, tengah daftar fasilitas DC area itu (per tipe NDC/RDC/SDC/HUB, toggle tipe), kanan Delivery Segment. Klik fasilitas = zoom + highlight kab/kota yang dilayani + daftar kab/kota-nya; klik kab/kota = Delivery Segment. Pencarian kab/kota otomatis pindah area. Esc / "← Semua area" / "× Tutup" untuk mundur.
- **Tabel Coverage → tombol "Export Coverage"** di header (CSV semua kab/kota BU terpilih). **Rantai Fasilitas** & popup detail kab/kota dihapus dari tampilan.
- Satu instance peta dipakai semua tampilan (`segMap` = `map`); lebar panel kanan tetap bisa digeser.
- Smoke test: disesuaikan ke layout baru, +13 tes (131 total); `injectDumai` menyuntik baris Dumai/Padang karena gsheet live berubah (tab Hub HCI sempat tinggal 1 baris, Dumai hilang dari semua tab).
- Temuan data: tab `Hub HCI` hanya berisi 1 baris (Sidoarjo) → "Sampai HUB" tinggal 1 kab/kota; Kota Dumai tidak ada di tab NDC/RDC/SDC/Hub HCI.

## 2026-10-14 (siang, 4)
- **Transit di NDC lain** (mis. `Jakarta - Sidoarjo - Bali`: barang dari NDC Jakarta transit di NDC Sidoarjo, lanjut ke fasilitas tujuan). Titik tengah rute di tab `Rute Numbered` sekarang boleh NDC (sebelumnya hanya RDC/SDC/HUB → muncul peringatan "fasilitas Sidoarjo tidak ditemukan", titik transitnya dilewati di garis peta dan segmen NDC → NDC tidak punya LT/cost). Sekarang segmen `Jakarta → Sidoarjo` (NDC → NDC) ikut LT/Cost F2F, marker NDC Sidoarjo digambar di garis, dan **legend rute** memberi keterangan: *"Opsional rute 2 · transit NDC Sidoarjo"*. Di data live ini dipakai 9 kab/kota Bali (HCI, Opsional rute 2).
- Smoke test: +4 tes transit NDC (118 total).

## 2026-10-14 (siang, 3)
- **Project rute direct dari NDC lain** (mis. Singkawang: Project rute 1 = Jakarta, Project rute 2 = Sidoarjo) sekarang bisa diisi: tambah **baris kedua di tab `NDC <BU>`** untuk kab/kota yang sama dengan kolom `NDC` = NDC itu, isi Lead Time Land/Sea, kolom armada, `Cost/Trip`, `Cost/CBM`. Baris pertama tetap NDC utama (Project rute 1, tabel Coverage); baris dengan NDC berbeda disimpan di `COVERAGE[bu][key].NDC.others` (`ndcData(c, name)`) dan dipakai `buildSegments` + `armLegs`. Sebelumnya datanya tidak ada tempat (selalu "belum diisi"). Peringatan "belum tersedia" sekarang menunjuk ke cara ini.
- `validate_sheet.py`: baris NDC ke-2 dengan NDC berbeda tidak lagi dihitung "dobel".
- Smoke test: +7 tes (114 total); `#seg-breakdown` dipakai sebagai selektor breakdown.

## 2026-10-14 (siang, 2)
- **Urutan bagian tab Delivery Segment diubah:** Perbandingan rute → **Cost per armada** → **Breakdown per segmen** → Selisih LT (Selisih tetap tepat di bawah Breakdown). Sebelumnya Cost per armada ada paling bawah.
- Smoke test: tes urutan disesuaikan (107 total).

## 2026-10-14 (siang, 1)
- **Cost Project rute per armada.** Tab `NDC <BU>` sekarang boleh punya (di kanan kolom yang sudah ada) kolom armada seperti Cost F2F / Hub (`CDDL Darat`, `Fuso Darat`, `Cont-20 Laut`, …) dan **`Cost/Trip`** & **`Cost/CBM`** (diisi langsung), sama seperti Hub/SDC/RDC. Di Cost per armada, rute direct NDC (Project rute, atau Rute 1 kalau tidak ada HUB/SDC/RDC) kini punya segmen **"NDC → Cust / Sto"** (label *project NDC (tab NDC)*), bisa dipilih dan ikut total rute. Kolom NDC digabung dengan kolom Hub/SDC/RDC/F2F per nama armada + mode, dan Cost/Trip + Cost/CBM masuk kolom **Langsung**. Hanya dipakai kalau asal rute = NDC project di tab itu (kalau NDC asal beda dari kolom `NDC`, tidak ada angkanya).
- Code: `LAST_HDR` dan `raw` juga diisi untuk NDC; `armLegs` menambah leg `last|NDC|…`; `costColsAll` ikut membaca NDC. Template: `docs/templates/NDC_cost_header.csv`.
- Smoke test: +6 tes Project; tab SDC/RDC HCI di-stub di tes armada (tab live sudah punya kolom armada sehingga mengubah kolom tabel) (107 total).

## 2026-10-14 (pagi, 2)
- **Cost last mile per armada.** Tab `Hub|SDC|RDC <BU>` sekarang boleh punya (di kanan kolom `Cost`): kolom armada seperti Cost F2F (`CDDL Darat`, `Fuso Darat`, `Cont-20 Laut`, dst.) dan dua kolom **`Cost/Trip`** & **`Cost/CBM`** (diisi langsung). Di Cost per armada tiap rute muncul segmen **"Fasilitas → Cust / Sto"** (label *last mile HUB/SDC/RDC*), bisa diklik/dipilih seperti segmen lain dan ikut total rute. Kolom armada Cost F2F dan tab Hub digabung per nama armada + mode (Darat/Laut), plus kolom **Langsung** (Cost/Trip & Cost/CBM langsung; cost/cbm tidak dihitung dari kapasitas). Total Cost/Trip dan Cost/CBM dihitung terpisah (`≥…*` per angka kalau ada segmen yang kosong). Direct NDC → Cust / Sto belum.
- Code: `LAST_HDR`, `armadaColsFrom`, `directHdrs`, `costColsAll`; `SEG_ARM` menyimpan kunci kolom (string). Template: `docs/templates/Hub_SDC_RDC_cost_header.csv`.
- Smoke test: +6 tes last mile/Langsung, tes lain tidak bergantung pada kolom tab Hub asli (101 total).
- Catatan: gsheet yang punya **filter aktif** di tab (mis. NDC HCI) hanya mengirim baris yang lolos filter lewat gviz → dashboard ikut menyusut. Pakai *filter view* (bukan filter biasa) atau lepas filter setelah selesai.

## 2026-10-14 (pagi, 1)
- **Rapikan tampilan Cost per armada:** lebar kolom tidak lagi timpang (aturan lebar kolom 2–3 milik tabel breakdown ikut kena tabel armada: CDDL & Fuso jadi 203 px, kolom lain 63 px, nama segmen terpotong per huruf). Sekarang tabel `table-layout:fixed`: kolom Segmen 150 px (sticky saat scroll ke kanan), tiap kolom armada 104 px rata kanan. **Total armada terpilih** dipindah dari baris tabel ke blok sendiri di bawah tabel (label + jumlah segmen terpilih di kiri, dua kotak Cost/Trip & Cost/CBM di kanan) supaya selalu terlihat dan tidak ikut scroll. Teks petunjuk dipendekkan.
- Tes: selektor total diganti ke `.arm-total` (95 total).

## 2026-10-14 (dini hari, 3)
- **Selisih LT** dipindah tepat di bawah *Breakdown per segmen* (sebelum Cost per armada) dan sekarang **hanya lead time** (selisih cost dihapus; sel hanya "lebih cepat / lebih lama X hari").
- **Cost per armada:** tabel "Total per armada" (baris rute × kolom armada) dihapus. Di tiap rute, **sel armada per segmen bisa diklik** untuk memilih armada segmen itu (klik lagi = batal; klik nama armada di header = pilih untuk semua segmen rute itu; juga bisa lewat keyboard Enter/Spasi). Total rute hanya **Cost/Trip & Cost/CBM dari armada terpilih** (jumlah per segmen; cost/cbm = jumlah cost/trip ÷ kapasitas efektif tiap segmen; `≥…*` + "n dari m segmen terpilih" kalau belum semua segmen dipilih / ada yang kosong). Pilihan disimpan di memori halaman saja (`SEG_ARM`), hilang saat refresh.
- Smoke test: +8 tes (urutan bagian, selisih tanpa cost, pilih/ganti/batal armada, header pilih semua, segmen kosong tidak bisa dipilih) (95 total).

## 2026-10-14 (dini hari, 2)
- **Revisi tab Delivery Segment:** (1) tabel **Perbandingan rute** tidak lagi menampilkan baris *Cost Darat* dan *Cost Laut* (Lead time Darat / Laut tetap); (2) **Breakdown per segmen** tanpa cost di tiap segmen maupun baris Total (tinggal lead time); (3) **Cost per armada** tanpa kapasitas armada di header (nama armada + Darat/Laut saja). Cost/trip dan cost/cbm di sel tetap tampil; kapasitas efektif tetap dipakai menghitung cost/cbm dari tab `Armada`.
- Bagian "Selisih LT & cost antar rute" tidak berubah (masih memuat selisih cost).
- Smoke test: tes kapasitas diganti (header tanpa cbm), +2 tes (tabel utama tanpa cost, breakdown tanpa cost), tes Dumai menunggu filter tabel selesai (flaky saat data live lambat) (87 total).

## 2026-10-14 (dini hari, 1)
- **Fix: tab Cost HCI kehilangan 15 baris pertama.** gviz menebak jumlah baris header; di tab dengan kolom berisi tanda "-" di baris-baris awal (mis. `Cont-20 Darat`) beberapa baris data ikut terbaca sebagai header. `gvizUrl` sekarang menambah `&headers=1` (tepat 1 baris header) untuk semua tab.
- Smoke test: tes "tanpa tab Armada" men-stub tab Armada (tab asli di gsheet sudah dibuat) + cek `headers=1` (85 total).

## 2026-10-13 (malam, 6)
- **Cost per armada** (cost/trip + cost/cbm) di Delivery Segment, bagian baru **setelah Breakdown per segmen** (sebelum Selisih): tabel "Total per armada" (baris = rute, kolom = armada) + rincian per segmen per rute.
  - **Tab baru `Armada`** (opsional): `Armada`, `Kapasitas (cbm)`, `Utilisasi (%)` (default 85). Kapasitas efektif = kapasitas × utilisasi (CDDL 16 → 13,6 · Fuso 32 → 27,2 · Wingbox 42 → 35,7 · Cont-20 25 → 21,25 · Cont-40 50 → 42,5). Kapasitas diubah di gsheet, bukan di kode. Template: `docs/templates/Armada.csv`.
  - **Kolom armada di tab `Cost Facility to Facility <BU>`**, di kanan kolom `Cost Sea` (kolom 1–5 tidak berubah): header = nama armada + opsional `Darat` / `Laut` (mis. `CDDL Darat`, `Cont-20 Laut`, atau cuma `Fuso`); isi = cost/trip per leg. Kolom yang namanya tidak ada di tab Armada diabaikan. Cost/cbm = cost/trip ÷ kapasitas efektif. Total = jumlah leg antar fasilitas; `≥ … *` kalau ada leg yang kosong. Last mile & direct NDC belum per armada (masih satu kolom Cost).
  - Tanpa tab Armada / tanpa kolom armada, bagian ini tidak muncul dan tampilan lama tidak berubah. LT tetap satu angka per segmen (Darat / Laut), tidak per armada.
- Smoke test +4 (84 total).

## 2026-10-13 (malam, 5)
- **Selisih LT & cost dikeluarkan dari tabel Perbandingan rute** dan dipindah ke bagian sendiri **setelah Breakdown per segmen** ("Selisih LT & cost antar rute"). Sekarang membandingkan **tiap rute yang tampil** (ikut toggle Opsional/Project): matriks Selisih Darat dan Selisih Laut, baris dibanding kolom (mis. baris Rute 1 × kolom Project rute = Rute 1 dibanding Project rute). Hanya angka yang dimiliki kedua sisi; total partial (*) tidak dibandingkan. Kalau yang tampil cuma satu rute, bagian ini hilang. Sebelumnya hanya dibanding Project rute 1 di baris tabel utama.
- Smoke test +1 (79 total); selector tes tabel utama pakai `.seg-main-tbl:not(.seg-diff-tbl)`.

## 2026-10-13 (malam, 4)
- **Satu nama di sel rute** sekarang valid untuk Rute / Opsional rute / Project rute (sebelumnya Rute & Opsional minimal 2 nama, satu nama diabaikan). NDC saja = direct NDC → Cust / Sto (seperti Project rute default); **RDC/SDC/HUB saja = fasilitas itu → Cust / Sto** (buat priority booking dari RDC/SDC), mis. Rute 1 = `Tamora`. Lead time/cost = last mile fasilitas itu dari tab coverage-nya, hanya kalau fasilitas itu memang yang melayani kab/kota tsb; kalau bukan → peringatan + lead time kosong. Peta: garis fasilitas → Cust / Sto. Helper `isDirectSteps` (satu langkah NDC = direct).
- `validate_sheet.py` ikut. Smoke test +3 (78 total).

## 2026-10-13 (malam, 3)
- **Rute boleh dimulai dari RDC/SDC/HUB** (mis. Rute 1 `Tamora - Aceh`, tanpa NDC di depan). Sebelumnya langkah pertama dipaksa NDC → fasilitas awal tidak punya titik di peta, garis Rute 1 cuma menyisakan potongan terakhir, judul "mulai dari NDC Tamora", dan muncul peringatan "bukan NDC". Sekarang langkah pertama = fasilitas itu (tier asli), ada marker + garis dari titik itu, judul "mulai dari RDC Tamora", segmen "RDC → HUB". Berlaku untuk Rute/Opsional/Project yang berantai (≥2 nama); satu nama non-NDC tetap diperingatkan.
- `validate_sheet.py`: langkah pertama boleh RDC/SDC/HUB kalau rute berantai. Smoke test +4 (75 total).

## 2026-10-13 (malam, 2)
- **Semua kelompok rute bisa ditulis di tab `Rute Numbered <BU>`**: kolom `Rute 1`, `Rute 2`, … · `Opsional rute 1`, `Opsional rute 2`, … · `Project rute 1`, `Project rute 2`, … (satu kolom `Opsional rute` / `Project rute` tanpa angka juga boleh). Format sel sama (`Jakarta - Pekanbaru - Dumai`).
  - **Rute 1** ditulis → menggantikan rantai Rute 1 dari coverage (dan Opsional rute otomatis dihitung dari NDC selain asal Rute 1 itu).
  - **Project rute** ditulis → menggantikan Project rute default (direct NDC → Cust / Sto). Boleh cuma NDC (`Jakarta` = direct; lead time/cost dari tab NDC, hanya kalau NDC-nya sama dengan NDC di tab itu, kalau beda muncul peringatan) atau rantai fasilitas (`Sidoarjo - Pekanbaru - Dumai`). Lebih dari satu → Project rute 1, 2, …; toggle Project rute menyembunyikan semuanya; Selisih dibandingkan ke Project rute 1; note "Pengiriman direct Cust / Sto" hanya untuk Project rute direct.
  - Yang tidak ditulis tetap memakai logika otomatis. Peta/legend/breakdown ikut.
- `validate_sheet.py` cek kolom baru (Project rute boleh 1 fasilitas). Smoke test: tab Rute Numbered di-stub kosong untuk test lama (gsheet sudah berisi data sungguhan) + 9 cek slot (71 total).

## 2026-10-13 (malam)
- **Opsional rute custom per kab/kota**: tab `Rute Numbered <BU>` sekarang juga boleh punya kolom **`Opsional rute 1`**, **`Opsional rute 2`**, … (atau satu kolom `Opsional rute`), format sel sama dengan Rute 2 (`Sidoarjo - Tallo - Palu`). Kalau kab/kota punya isian di kolom ini, Opsional rute otomatis (NDC lain) untuk kab/kota itu **diganti** oleh isian tersebut; berlaku untuk pulau mana pun dan ikut toggle Opsional rute. Kab/kota yang tidak diisi tetap pakai Opsional rute otomatis.
- Tabel perbandingan: kalau kolom > 4 tabel bisa digeser horizontal (kolom label tetap di kiri) supaya teks tidak ke-wrap per huruf.
- Warna garis Opsional rute (`OPSIONAL_STYLES`) dibedakan dari Rute 2+ (`NUMBERED_STYLES`) — sebelumnya "Rute 2" dan "Opsional rute 2" sama-sama pink. Smoke test +2 cek (62 total).

## 2026-10-13 (sore, 2)
- **Rute numbered (Rute 2, 3, …)**: kab/kota bisa punya rantai rute alternatif, mis. Dumai: Rute 1 = Jakarta → Tamora → Pekanbaru → Dumai, Rute 2 = Jakarta → Pekanbaru → Dumai; Padang: Rute 1 = Jakarta → Padang, Rute 2 = Jakarta → Tamora → Padang. Didefinisikan di tab gsheet baru **`Rute Numbered HCI/AHI`** (opsional; kolom `Kabupaten/Kota`, `Provinsi`, `Rute 2`, `Rute 3`, …; isi sel "Jakarta - Pekanbaru - Dumai"). Tidak ada data yang di-hardcode di `index.html`.
- Tampil sebagai kolom/breakdown/legend/garis peta sendiri tepat setelah Rute 1 (urutan: Rute 1, 2, … → Opsional rute → Project rute). Lead time & cost memakai leg yang sama dengan Rute 1 (tab Lead Time/Cost Facility to Facility) + last mile dari tab Hub/SDC/RDC; leg yang belum ada → total partial + catatan. Nama fasilitas tak dikenal / langkah pertama bukan NDC / langkah terakhir bukan fasilitas yang melayani kab/kota → catatan peringatan di bawah perbandingan.
- Tab yang belum ada ditangani: gviz mengembalikan sheet pertama, jadi dibaca hanya kalau header cocok (`Kabupaten/Kota` + `Rute N`).
- `validate_sheet.py`: cek tab Rute Numbered (kab/kota, nama fasilitas, NDC di awal, fasilitas pelayan di akhir, leg lead time yang hilang). Template: `docs/templates/Rute_Numbered_HCI.csv`. Smoke test +13 cek (60 total).

## 2026-10-13 (sore)
- **Note Project rute**: "Note : Pengiriman direct Cust / Sto" ditambahkan di kolom Project rute (baris Note) dan di bawah judul breakdown Project rute (termasuk kasus Project rute = Rute 1). Smoke test +1 cek (47 total).
- **Perbandingan rute disegmentasi**: urutan kolom (dan breakdown per segmen, dan legend peta) sekarang **Rute 1 (dst.) → Opsional rute → Project rute**, tiap kelompok diberi label kecil di header + garis pemisah.
- **Toggle "Tampilkan"** di atas tabel untuk **Opsional rute** dan **Project rute** (Rute 1 selalu tampil). Yang dimatikan hilang dari tabel, breakdown, notes, legend, dan garis/marker di peta; kalau Project rute dimatikan baris Selisih ikut disembunyikan (selisih = vs Project rute). Pilihan diingat di browser (`localStorage['seg-route-vis']`); posisi/zoom peta tidak loncat saat toggle. Kab/kota tanpa HUB/SDC/RDC (Project rute = Rute 1) tidak ada toggle. Smoke test +12 cek (46 total).

## 2026-10-13 (siang, 2)
- Rute dari NDC lain (sebelumnya "Rute 2") sekarang bernama **Opsional rute** (kalau ada lebih dari satu NDC lain: Opsional rute 1, 2, …). Rute 1 dan Project rute tidak berubah.

## 2026-10-13 (siang)
- **Perbandingan rute**: "Direct NDC" → **Project rute**; "Reguler rute" → **Rute 1**; "Other rute" → **Rute 2**, dan seterusnya (satu rute per NDC di BU yang meng-cover kab/kota; tiap NDC tambahan otomatis jadi Rute 3, 4, …). Selisih sekarang dibandingkan terhadap Project rute. Legend, peta, breakdown, Tabel Coverage ("Rute 1 dari …") ikut. Nama kolom sheet (`NDC`, `NDC Reguler`, `NDC Other`) tidak berubah.

## 2026-10-13
- Delivery Segment: istilah "Tujuan" diganti **"Cust / Sto"** (rute, breakdown, catatan, kolom pencarian, teks kosong, tooltip peta).
- Legend garis rute (Direct NDC / Reguler rute / Other rute, putus-putus berwarna) dipindah dari header tabel Perbandingan rute ke **pojok kiri bawah peta** (`setSegLegend`); entri Other rute hanya muncul kalau berlaku. Smoke test +4 cek.

## 2026-10-12 (malam, 3)
- **Layout tab Delivery Segment**: panel kiri lebih lebar (default `clamp(460px, 38vw, 640px)`, sebelumnya 390px fix) sehingga tabel 3 kolom (Direct / Reguler / Other) tidak ke-wrap; garis pemisah panel–peta **bisa digeser** (drag, tombol ←/→, klik 2x = reset; lebar disimpan di browser); kolom pencarian sticky saat scroll; sidebar global (ringkasan + legenda peta coverage) disembunyikan di tab ini (tampil lagi di tab lain); di layar ≤ 900px panel dan peta ditumpuk atas–bawah. Smoke test +5 cek layout.

## 2026-10-12 (malam, 2)
- **Other rute** (rute ke-3) di Delivery Segment untuk kab/kota Kalimantan & Sulawesi yang punya HUB/SDC/RDC: rantai fasilitas sama dengan Reguler rute, tapi mulai dari NDC lain (otomatis = NDC satunya di BU; override per kab/kota lewat kolom opsional `NDC Other` di tab NDC). Kolom baru di Perbandingan rute (lead time, cost, selisih vs Direct), breakdown per segmen, garis cyan + marker NDC di peta. Pulau lain tidak berubah.
- `validate_sheet.py`: cek `NDC Other` + peringatan kalau jumlah NDC di BU ≠ 2. Smoke test +4 cek.

## 2026-10-12 (malam)
- Kolom opsional **`NDC Reguler`** di tab `NDC HCI/AHI`: asal Reguler rute bisa beda dari Direct NDC (kolom `NDC`). Contoh Palu: `NDC`=Sidoarjo (direct), `NDC Reguler`=Jakarta (reguler Jakarta → Tallo → Palu). Tanpa kolom / kosong → perilaku lama.
- Tampil di: perbandingan rute + breakdown, peta segmen (marker NDC kedua untuk asal Direct), Tabel Coverage ("reguler dari …"), detail kab/kota, export CSV (`NDC Reguler`). `validate_sheet.py` cek nama NDC Reguler. Smoke test +4 cek (intercept CSV NDC HCI).

## 2026-10-12 (sore)
- Delivery Segment: daftar langkah rute (NDC → … → Tujuan) **dihapus**; diganti **Breakdown per segmen** di dalam Perbandingan rute — lead time Darat/Laut + cost tiap segmen untuk Direct NDC dan Reguler rute, plus total. Selisih lead time dan cost dihitung terpisah.
- Dashboard sekarang membaca tab `Cost Facility to Facility AHI/HCI` (`COST_LEG`); cost last mile dari kolom Cost tab Hub/SDC/RDC; direct dari tab NDC. Total bertanda `≥ … *` kalau ada segmen yang belum terisi.
- Label "Flow sekarang" → "Reguler rute".

## 2026-10-12
- **Basemap** diganti ke Esri World Dark Gray (fallback OSM). CARTO dark_all sekarang butuh API key dan menampilkan watermark "API KEY REQUIRED".
- **Hub-to-hub**: feeder dari kolom HUB ke-2 Matriks dipasang ke tiap kab/kota (`HUB.via`) — tampil di Tabel Coverage ("← via Pekanbaru"), detail kab/kota, rute Delivery Segment, dan kolom baru export CSV (`HUB Feeder (via)`, `Lead Time Feeder ke HUB`).
- **Fix nama fasilitas**: prefix `BKS ` dibuang, spasi dirapikan, alias baru (Yogya, Tasik, Jogja, Kuta Bali, Denpasar/Sempidi Bali). Sebelumnya lead time ke 7 hub BKS tidak pernah nyambung.
- **Perbandingan rute** di tab Delivery Segment: Direct NDC → tujuan vs Reguler rute (sebelumnya berlabel "Flow sekarang") (lead time Darat/Laut, titik transit, cost, selisih) + garis kedua di peta.
- **Tooling**: `scripts/validate_sheet.py` (validasi gsheet), `scripts/smoke_test.js` (tes browser headless), `CLAUDE.md`, `docs/PANDUAN_GSHEET.md`, template PR.

## Sebelum 2026-10-12 (ringkas)
- Rebuild dashboard di backend gsheet: choropleth per kab/kota, toggle HCI/AHI, tabel coverage.
- Tab Delivery Segment (rute NDC → RDC → SDC → HUB → tujuan).
- Integrasi Lead Time Facility to Facility; format "Darat Xh · Laut Yh" disamakan (termasuk last mile).
- Export CSV tabel coverage.
- Isi kolom Lead Time di file CTS 25-26 Sheet37 berdasarkan rantai coverage HCI (mismatch SITE ditandai).
