# Changelog

Format: tanggal · perubahan · alasan. Entri terbaru di atas. Update tiap kali `index.html` berubah.

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
