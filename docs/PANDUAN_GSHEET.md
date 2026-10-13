# Panduan maintain gsheet → dashboard

Dashboard **baca langsung** dari gsheet. Edit di sheet → klik **Refresh** di dashboard → langsung berubah. Gak perlu ubah kode.

## Aturan emas (biar gak error)
1. **Nama fasilitas harus konsisten.** Semua nama HUB/SDC/RDC/NDC di tab mana pun harus ada di tab `Name of Facility`. Prefix `HUB ` / `BKS ` boleh (otomatis dibuang), tapi huruf lain harus sama (mis. `Yogya` dan `Yogyakarta` sudah dikenal; nama baru = kabarin gua).
2. **Satu kab/kota = satu baris per tab.** Jangan dobel.
3. **Kosong = rantai berhenti di level itu.** HUB kosong → liat SDC/RDC; semua kosong → NDC langsung.
4. **Jangan rename/hapus tab & header kolom** tanpa kabarin. Kalau terpaksa, bilang nama barunya.
5. **Jangan timpa isi tab** dengan data tab lain (pernah kejadian di Facility to Facility).
6. Angka lead time = **hari** (angka murni, `-` kalau moda tidak ada). Jangan tulis "2 hari" / "2h".

## Mau ngapain → edit di mana
| Mau... | Edit tab | Catatan |
|---|---|---|
| Tambah fasilitas baru (hub/SDC/RDC/NDC) | `Name of Facility` | Isi BU (`HCI`, `AHI`, atau `HCI & AHI`), Type, Name Site, Long, Lat (urutan Long/Lat sering tertukar, tidak masalah). Jangan lupa BU benar — fasilitas BU "HCI" tidak muncul di AHI. |
| Tambah/ubah coverage kab/kota | `Hub/SDC/RDC/NDC <BU>` | Isi kolom nama fasilitas di baris kab/kota itu. NDC wajib terisi semua. |
| Isi SLA last mile | `Hub/SDC/RDC <BU>` kolom `Lead Time land` | Hari, dari fasilitas ke kab/kota itu. |
| Isi lead time/cost Project rute (NDC → Cust / Sto langsung) | `NDC <BU>` kolom `Lead Time Land/Sea`, `Cost Land/Sea` | Dipakai sebagai pembanding semua Rute 1, 2, 3. |
| Rute di Perbandingan rute (**Project rute**, **Rute 1, 2, 3…**) | `NDC <BU>` | **Project rute** = direct NDC → Cust / Sto: kolom `NDC` (asal) + `Lead Time Land/Sea`, `Cost Land/Sea`. **Rute 1** = lewat HUB/SDC/RDC mulai dari NDC di kolom `NDC`; kalau Rute 1 harus mulai dari NDC lain, tambah kolom **`NDC Reguler`** (header persis itu) dan isi di baris kab/kota itu saja (mis. Palu: `NDC`=Sidoarjo, `NDC Reguler`=Jakarta → Project rute dari Sidoarjo, Rute 1 dari Jakarta). Kosong = sama dengan kolom `NDC`. |
| **Rute 2, 3, …** (Kalimantan & Sulawesi) | — (otomatis) | Rantai fasilitas **sama dengan Rute 1**, tapi mulai dari NDC lain. Tiap NDC lain di BU (Name of Facility, Type `NDC`) otomatis jadi satu rute: BU dengan 2 NDC (Jakarta/Sidoarjo) → Rute 1 + Rute 2; kalau nanti ada NDC ke-3 → Rute 3. Mau paksa satu NDC tertentu untuk 1 kab/kota: kolom `NDC Other` di tab `NDC <BU>`. **Syarat data:** leg dari NDC itu ke fasilitas pertama (mis. `Sidoarjo → Tallo`) harus ada di `Lead Time Facility to Facility <BU>` / `Cost ...` — kalau belum, total rute tampil partial (`≥ … *`). Kab/kota tanpa HUB/SDC/RDC cuma punya Project rute (= Rute 1). |
| Atur rantai resmi suatu hub | `Matriks Facility to Facility <BU>` | Kolom: `HUB`, `HUB` (ke-2 = hub feeder, mis. Pekanbaru → Dumai), `SDC`, `RDC`, `NDC`. Baris SDC-only: kolom HUB dikosongkan. |
| Isi lead time antar fasilitas | `Lead Time Facility to Facility <BU>` | Satu baris per leg: `Remark, Facility (asal), Facility (tujuan), Lead Time Land, Lead Time Sea`. Remark: `NDC to Hub`, `NDC to SDC`, `NDC to RDC`, `RDC to Hub`, `SDC to Hub`, `Hub to Hub`. |
| Cost antar fasilitas | `Cost Facility to Facility <BU>` | Format sama dengan Lead Time (`Remark, Facility, Facility, Cost Land, Cost Sea`). Dibaca dashboard untuk breakdown cost per segmen. |

## Resep cepat
**Tambah HUB baru** (mis. "Hub Kupang")
1. `Name of Facility`: tambah baris (BU, `HUB`, nama, koordinat).
2. `Hub <BU>`: isi nama hub di baris kab/kota yang dilayani + `Lead Time land`.
3. `Matriks ... <BU>`: tambah baris hub → isi SDC/RDC/NDC pemasoknya (+ hub feeder kalau ada).
4. `Lead Time ...`: tambah leg dari pemasok → hub (`NDC to Hub` / `RDC to Hub` / `SDC to Hub` / `Hub to Hub`).
5. Refresh dashboard → cek kab/kota itu di tab Delivery Segment.

**Pindahin kab/kota ke hub lain**: ganti nama di tab `Hub <BU>` baris kab/kota itu. Selesai.

**Pemekaran / kab/kota baru**: tambah baris di keempat tab coverage (NDC wajib). Kalau di peta gak muncul = polygon sumber belum ada (tetap muncul di tabel); kabarin gua.

## Checklist habis edit
- [ ] Refresh dashboard, buka 1–2 kab/kota yang diedit di tab **Delivery Segment**.
- [ ] Minta gua: **"validasi sheet"** → gua jalanin pengecekan otomatis (nama tak dikenal, leg lead time hilang, coverage beda dari Matriks, kab/kota dobel, dll).
- [ ] Kalau ada nama/kolom baru yang belum dikenal dashboard, sebutin di request.

## Template request ke Claude (copy-paste)
```
Update dashboard: <apa yang mau berubah, 1 kalimat>
Tab gsheet terkait: <nama tab>
Contoh kasus: <kab/kota atau fasilitas>  → yang diharapkan: <hasil>
Yang sekarang salah/kurang: <screenshot / deskripsi>
```
Untuk bug: sebut BU (HCI/AHI), tab dashboard, kab/kota, dan apa yang kelihatan vs yang seharusnya.

## Kalau dashboard kelihatan aneh
| Gejala | Biasanya karena |
|---|---|
| Lead time antar fasilitas kosong | Nama fasilitas di tab Lead Time beda dengan Name of Facility / leg belum ada |
| Marker fasilitas tidak muncul di AHI | BU di Name of Facility tidak mengandung AHI |
| Kab/kota tidak berwarna di peta | Polygon sumber tidak ada (lihat catatan di sidebar) atau nama beda ejaan |
| Rute 2 tidak muncul | Pulau bukan Kalimantan/Sulawesi, kab/kota tidak punya HUB/SDC/RDC, atau di Name of Facility cuma ada 1 NDC untuk BU itu |
| Rute 1 Palu masih mulai dari NDC yang sama dengan Project rute | Kolom `NDC Reguler` belum ada / header salah ketik / nama NDC-nya beda dengan Name of Facility |
| Rute kelewat RDC | Tab `RDC <BU>` belum memuat kab/kota itu padahal Matriks bilang lewat RDC |
| Tulisan "API KEY REQUIRED" di peta | Provider tile butuh key — kabarin, jangan diutak-atik sendiri |
