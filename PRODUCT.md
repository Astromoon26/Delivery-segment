# PRODUCT — Delivery Network (Delivery Segment Dashboard)

Konteks produk untuk pekerjaan desain. Sumber kebenaran perilaku & data: `CLAUDE.md`. Kalau dua dokumen beda, `CLAUDE.md` menang.

## Platform & bentuk
- Satu file statis `index.html` (HTML + CSS + JS inline, tanpa build), Leaflet untuk peta. Deploy: upload ke repo → GitHub Pages / Vercel.
- **Read-only**: semua data dibaca live dari Google Sheet master; dashboard tidak mengedit data.
- Bahasa UI: Indonesia santai-profesional ("Cust / Sto", "Darat/Laut", "Opsional rute").

## Pengguna
- **Utama:** Apip dan rekan Transport Services di Kawan Lama Group (analis transport/supply chain). Membuka dashboard untuk memeriksa jalur pengiriman, lead time, dan cost per armada ke satu kab/kota, lalu membandingkan beberapa rute.
- **Sekunder:** tim operasional/penjualan yang perlu tahu "barang ke kota X lewat mana dan berapa hari", sering dari laptop, kadang dari HP.
- Pengguna paham istilah domain (NDC/RDC/SDC/HUB, mid mile, last mile). Tidak perlu dijelaskan panjang; yang perlu cepat adalah **angka dan jalurnya**.

## Tujuan permukaan (mode: Operate)
1. Home: lihat seluruh jaringan fasilitas (NDC/RDC/SDC/HUB) per area dan BU (HCI/AHI).
2. Area: lihat fasilitas di satu area dan kab/kota yang dilayaninya.
3. Delivery Segment: untuk satu kab/kota, tampilkan rute (Rute 1, Rute 2, Opsional, Project) di peta + tabel perbandingan lead time + cost per armada + breakdown per segmen + selisih LT.
4. Export Coverage (CSV) seluruh kab/kota BU terpilih.

Keberhasilan: pengguna menjawab "berapa lama (Darat/Laut) dan lewat mana ke kab/kota ini?" dalam beberapa detik, dan percaya angkanya.

## Prinsip desain
- **Operate, bukan promosi**: presisi, ringan, mudah dipindai. Aksen hanya untuk tipe fasilitas, status, dan aksi; bukan dekorasi.
- **Angka lead time adalah headline** tiap rute; label dan petunjuk di belakangnya.
- Warna tipe fasilitas konsisten di mana pun (peta, chip, legenda, daftar): HUB hijau, SDC ungu, RDC biru, NDC oranye.
- Garis rute: **solid = Rute**, **putus-putus = Opsional/Project**, **titik-titik = laut (perkiraan)**. Jalur laut selalu diberi label perkiraan, bukan rute kapal resmi.
- Animasi halus dan profesional, tidak jalan terus-menerus, menghormati reduce motion.
- Gelap sebagai tema tunggal (analis bekerja lama di layar; peta gelap membuat garis rute menonjol).

## Batasan (jangan dilanggar)
- Jangan hardcode data (coverage, lead time, cost, rute) di `index.html`; semua dari gsheet.
- Jangan menambah tab/menu baru tanpa diminta Apip (arahan #19).
- Satu file, tanpa dependensi baru tanpa alasan kuat; CDN hanya cdnjs/jsdelivr/unpkg dengan versi tetap.
- Smoke test (`scripts/smoke_test.js`) harus 100% lolos; teks/label baris tertentu dipakai tes (mis. "Lead time Darat/Laut"), ubah struktur dengan hati-hati.
- Kapasitas armada tidak ditampilkan di header tabel (arahan #18).
- Tidak ada fitur yang mengklaim data pelayaran resmi untuk jalur laut.

## Konteks pemakaian
- Layar utama: laptop 1440px; sering ditampilkan ke tim (proyektor/layar bersama) → teks minimal 11–12px dan kontras ≥ 4,5:1.
- Mobile: panel menumpuk vertikal (peta → fasilitas → segmen); tidak boleh ada scroll horizontal halaman.
