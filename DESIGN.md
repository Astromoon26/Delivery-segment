# DESIGN — Delivery Network

Sistem visual yang **ada di kode** (`index.html`, blok `<style>` + `:root`). Dokumen ini mencatat, bukan merancang ulang. Ubah token di `:root`, jangan menyebar hex baru.

## Tema
Gelap tunggal. Tidak ada mode terang.

## Warna (token `:root`)
| Token | Nilai | Pakai |
|---|---|---|
| `--bg` | `#0f1117` | latar halaman |
| `--surface` | `#181c27` | header, panel |
| `--surface2` | `#1e2335` | kartu, tabel, kontrol |
| `--border` / `--border2` | `rgba(255,255,255,.07)` / `.13` | garis halus / garis kontrol |
| `--text` | `#e8eaf0` | teks utama |
| `--muted` | `#8b93a3` | label, teks sekunder (≥ 5:1 di `--surface2`) |
| `--NDC` `--RDC` `--SDC` `--HUB` | `#f59e0b` `#3b82f6` `#a78bfa` `#34d399` | tipe fasilitas (+ varian `-bg` 12% untuk chip) |
| aksi primer | `#2563eb` (hover `#1d4ed8`) | tombol aktif (HCI/AHI), `.btn.primary`; putih di atasnya 5,2:1 |
| tautan atribusi | `#9db4ff` | atribusi Leaflet |

Warna garis rute ada di kode JS (bukan CSS): Project rute `DIRECT_COLOR #f59e0b`, Rute 1 putih, Rute 2+ `NUMBERED_STYLES` (pink, hijau muda, ungu, teal), Opsional `OPSIONAL_STYLES` (cyan, merah, kuning, biru). Warna encode makna rute; jangan dipakai ulang untuk dekorasi.

Peta: basemap Esri World Dark Gray diredupkan (`#map.seg-on .leaflet-tile-pane{opacity:.28}`), latar `#map` `#0b0f17`. Polygon area diwarnai per area (`ISLANDS`).

## Tipografi
- **Sora** untuk UI (judul, nama, tombol). **DM Mono** untuk label kapital kecil, angka, sub-keterangan, timestamp.
- Skala yang dipakai (px): 11 (label mono kapital, minimum), 11.5 (keterangan), 12 / 12.5 (isi, tombol), 15 (judul panel; angka lead time), 22 (angka ringkasan). **Lantai 11px**: jangan ada teks di bawahnya.
- Angka di tabel/KPI memakai DM Mono; angka lead time rute `font-variant-numeric: tabular-nums`.
- Label kapital: `letter-spacing` 0,06–0,08em, hanya untuk label pendek.

## Spasi & bentuk
- Radius: 5–9px untuk kontrol dan kartu (8 paling umum), 999px hanya untuk chip/pil kecil (`type-chip`, `fl-pill`, `mini-badge`).
- Panel dipisah garis `--border`, bukan bayangan. Bayangan hanya untuk kontrol mengambang (zoom, popup).
- Panel kanan (Delivery Segment) lebarnya bisa digeser (`--seg-w`, disimpan di `localStorage['seg-panel-w']`).

## Komponen kunci
- **Chip tipe fasilitas** (`.type-chip`, `.mini-badge`): titik berwarna + nama + jumlah; hover = sorot di peta, klik = toggle, klik 2x = solo.
- **Baris fasilitas** (`.fac-item`): titik, nama, jumlah kab/kota; kalau 0 → "belum ada coverage" diredupkan (miring).
- **Tabel Perbandingan rute** (`.seg-cmp`): kolom per rute dengan garis aksen warna rute di atas (`c-top`), grup dipisah garis (`grp`). Urutan baris: Rute → **Lead time Darat → Lead time Laut (headline: 15px, 600, tabular)** → Titik transit (hanya kalau ada yang > 0) → Note (hanya kalau ada).
- **Petunjuk Cost per armada**: satu kalimat aksi + `<details class="seg-help">` untuk cara hitung.
- **Legenda rute** (`setSegLegend`): pojok kiri bawah peta; contoh garis solid/putus-putus/titik-titik sesuai jenis yang tampil.
- **Pil label fasilitas** (`.fl-pill`) dan **cincin tujuan** di peta.
- **Kontrol Leaflet** (zoom, atribusi) di-theme gelap lewat token.
- **Landing page** (`#landing`): layar pembuka satu kolom (maks 520px) di kiri, peta Home redup terlihat di kanan (gradien dari `--bg`); judul `clamp(32px,4.2vw,44px)` 600, penjelasan 15px, pilih BU, angka ringkasan (DM Mono 26px tabular) + chip tipe fasilitas, **kartu status data** (titik hijau/oranye/merah + progres bar 3px) dan CTA primer "Buka dashboard". Mobile ≤ 900px: latar solid, kolom penuh. Tanpa animasi berulang; keluar = fade 250 ms.
- **Overlay Refresh** (`#refresh-ov`): kartu 360px di tengah di atas latar redup `rgba(9,10,14,.62)` (tanpa blur): judul, langkah saat ini, progres bar; error = pesan + Tutup / Coba lagi.

## State
Setiap kontrol interaktif: default, hover, `focus-visible` (outline jelas), aktif/terpilih, disabled. Empty state mengajari (mis. "Pilih kab/kota Cust / Sto…"). Loading memakai tampilan bertahap, bukan spinner di tengah konten.

## Gerak
Durasi UI 150–250 ms. Animasi rute memakai pengali `ROUTE_SLOW` (lihat `CLAUDE.md` #21); semua dilewati bila `prefers-reduced-motion`. Tidak ada animasi yang jalan terus-menerus.

## Responsif
- ≤ 900px: island view menumpuk vertikal (peta 42vh → panel fasilitas → segmen).
- ≤ 600px: header membungkus, subjudul disembunyikan, tombol "← Semua area" jadi ikon.
- Perangkat sentuh (`pointer: coarse`): tombol/chip minimal 40px tinggi.

## Kontras (sudah diaudit 2026-11-04)
Teks `--muted` ≥ 5:1 di `--surface2`; putih di biru aksi 5,2:1. Detector `impeccable detect` hanya menyisakan 2 peringatan tiny-text (label kapital mono 11px, sengaja).
