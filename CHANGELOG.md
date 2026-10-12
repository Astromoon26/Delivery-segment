# Changelog

Format: tanggal · perubahan · alasan. Entri terbaru di atas. Update tiap kali `index.html` berubah.

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
