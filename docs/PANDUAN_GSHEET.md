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
| Isi lead time/cost Project rute (NDC → Cust / Sto langsung) | `NDC <BU>` kolom `Lead Time Land/Sea`, `Cost Land/Sea` | Dipakai sebagai pembanding Rute 1 dan Opsional rute. |
| Rute di Perbandingan rute (**Project rute**, **Rute 1**, **Opsional rute**) | `NDC <BU>` | **Project rute** = direct NDC → Cust / Sto: kolom `NDC` (asal) + `Lead Time Land/Sea`, `Cost Land/Sea`. **Rute 1** = lewat HUB/SDC/RDC mulai dari NDC di kolom `NDC`; kalau Rute 1 harus mulai dari NDC lain, tambah kolom **`NDC Reguler`** (header persis itu) dan isi di baris kab/kota itu saja (mis. Palu: `NDC`=Sidoarjo, `NDC Reguler`=Jakarta → Project rute dari Sidoarjo, Rute 1 dari Jakarta). Kosong = sama dengan kolom `NDC`. |
| **Opsional rute** (Kalimantan & Sulawesi) | — (otomatis) | Rantai fasilitas **sama dengan Rute 1**, tapi mulai dari NDC lain. Tiap NDC lain di BU (Name of Facility, Type `NDC`) otomatis jadi satu rute: BU dengan 2 NDC (Jakarta/Sidoarjo) → Rute 1 + Opsional rute; kalau nanti ada NDC ke-3 → Opsional rute 1 dan 2. Mau paksa satu NDC tertentu untuk 1 kab/kota: kolom `NDC Other` di tab `NDC <BU>`. **Syarat data:** leg dari NDC itu ke fasilitas pertama (mis. `Sidoarjo → Tallo`) harus ada di `Lead Time Facility to Facility <BU>` / `Cost ...` — kalau belum, total rute tampil partial (`≥ … *`). Kab/kota tanpa HUB/SDC/RDC cuma punya Project rute (= Rute 1). |
| **Rute 2, 3, …** (rute numbered: rantai alternatif per kab/kota, mis. Dumai: Jakarta → Pekanbaru → Dumai) | Tab baru **`Rute Numbered HCI`** / **`Rute Numbered AHI`** (opsional) | Kolom: `Kabupaten/Kota` (persis seperti di tab coverage), `Provinsi` (info saja), lalu satu kolom per rute: header **`Rute 2`**, **`Rute 3`**, … Isi sel = urutan fasilitas dipisah ` - ` atau `>` atau `→`, **mulai dari NDC dan berakhir di fasilitas yang melayani kab/kota** (Hub/SDC/RDC di tab coverage). Contoh: `Jakarta - Pekanbaru - Dumai`. "Cust / Sto" di akhir otomatis (boleh ditulis, boleh tidak). Nama fasilitas harus sama dengan `Name of Facility`. Kab/kota yang tidak ada di tab ini cuma punya Rute 1. **Semua kelompok rute bisa ditulis di sini:** kolom `Rute 1`, `Rute 2`, … (Rute 1 menggantikan rantai Rute 1 dari coverage), `Opsional rute 1`, `Opsional rute 2`, … , dan `Project rute 1`, `Project rute 2`, … (Project rute boleh cuma NDC, mis. `Jakarta` = direct NDC → Cust / Sto; lead time/cost direct-nya dari tab `NDC <BU>` dan hanya tersedia untuk NDC yang ada di tab itu). Kab/kota yang kolomnya kosong memakai logika otomatis. **Opsional rute custom:** tambah kolom `Opsional rute 1`, `Opsional rute 2`, … (atau satu kolom `Opsional rute`) di tab yang sama, isi dengan format yang sama (mis. Palu: `Sidoarjo - Tallo - Palu`). Kalau sebuah kab/kota punya isian di kolom Opsional, Opsional rute otomatis (NDC lain) untuk kab/kota itu diganti isian ini (berlaku untuk pulau mana pun, ikut toggle Opsional rute); kab/kota yang kolom Opsional-nya kosong tetap pakai Opsional rute otomatis. Template: `docs/templates/Rute_Numbered_HCI.csv`. |
| **Lead time & cost Rute 2, 3, …** | Antar fasilitas: `Lead Time Facility to Facility <BU>` dan `Cost Facility to Facility <BU>` (satu baris per leg, mis. `Jakarta → Pekanbaru`, `Tamora → Padang`; leg yang sudah ada dipakai bersama Rute 1). Last mile (fasilitas terakhir → Cust / Sto): kolom `Lead Time land` dan `Cost` di tab `Hub/SDC/RDC <BU>` baris kab/kota itu (sama dengan Rute 1). | Leg yang belum ada → total rute tampil partial (`≥ … *`) + catatan leg mana yang kosong. |
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
| Opsional rute tidak muncul | Pulau bukan Kalimantan/Sulawesi, kab/kota tidak punya HUB/SDC/RDC, atau di Name of Facility cuma ada 1 NDC untuk BU itu |
| Rute 1 Palu masih mulai dari NDC yang sama dengan Project rute | Kolom `NDC Reguler` belum ada / header salah ketik / nama NDC-nya beda dengan Name of Facility |
| Kolom Opsional rute / Project rute hilang di Perbandingan rute | Dimatikan lewat toggle "Tampilkan" di atas tabel (pilihan diingat per browser) — klik lagi untuk menampilkan |
| Rute 2 tidak muncul | Tab `Rute Numbered <BU>` belum dibuat / header kolom bukan persis `Kabupaten/Kota` dan `Rute 2` / nama kab/kota beda tulisan dengan tab coverage (mis. lupa awalan `Kota`/`Kabupaten`) / sel berisi < 2 fasilitas. Jalankan `validate_sheet.py` — ada pengecekan khusus tab ini |
| Rute cuma satu nama (mis. `Tamora`) | Valid: RDC/SDC/HUB → Cust / Sto langsung (priority booking); lead time diambil dari last mile fasilitas itu kalau dia yang melayani kab/kota tsb |
| Ada catatan merah di bawah Perbandingan rute ("fasilitas … tidak ditemukan") | Nama fasilitas di sel `Rute N` beda dengan `Name of Facility`, atau langkah pertama bukan fasilitas yang dikenal (NDC; boleh RDC/SDC/HUB kalau rute berantai, mis. `Tamora - Aceh`), atau langkah terakhir bukan fasilitas yang melayani kab/kota itu |
| Rute 2 lead time-nya `≥ … *` | Ada leg yang belum diisi di `Lead Time Facility to Facility <BU>` (catatan * menyebut leg-nya) |
| Rute kelewat RDC | Tab `RDC <BU>` belum memuat kab/kota itu padahal Matriks bilang lewat RDC |
| Tulisan "API KEY REQUIRED" di peta | Provider tile butuh key — kabarin, jangan diutak-atik sendiri |


## Cost per armada (tab `Armada` + kolom armada di Cost Facility to Facility)
1. Buat tab **`Armada`** (template `docs/templates/Armada.csv`): kolom `Armada`, `Kapasitas (cbm)`, `Utilisasi (%)` (kosong = 85). Kapasitas efektif = kapasitas × utilisasi.
2. Di tab **`Cost Facility to Facility HCI|AHI`**, tambah kolom di kanan `Cost Sea` (jangan geser kolom 1–5): header = nama armada persis seperti di tab Armada, opsional diikuti `Darat` / `Laut`, mis. `CDDL Darat`, `Fuso Darat`, `Cont-20 Laut`. Isi = **cost per trip** satu leg (angka biasa atau `Rp 12.500.000`). Template header: `docs/templates/Cost_F2F_Armada_header.csv`.
3. Dashboard menampilkan cost/trip dan cost/cbm (= cost/trip ÷ kapasitas efektif) per armada per segmen. Armada tiap segmen dipilih dengan klik di dashboard; total rute = Cost/Trip & Cost/CBM dari armada yang terpilih. Total memakai leg antar fasilitas + last mile (lihat di bawah); direct NDC → Cust / Sto (Project rute) juga per armada lewat tab NDC (lihat di bawah); `≥ … *` = ada leg yang kosong.
4. Lead time tetap **satu angka per segmen** (tab Lead Time Facility to Facility), tidak per armada.
5. **Last mile (tab `Hub HCI|AHI`, `SDC HCI|AHI`, `RDC HCI|AHI`)**: di kanan kolom `Cost` (kolom lama tidak berubah) boleh ditambah kolom yang sama seperti Cost F2F: header = nama armada persis seperti di tab Armada + opsional `Darat` / `Laut` (mis. `CDDL Darat`, `Fuso Darat`, `Wingbox Darat`), isi = cost per trip dari fasilitas itu ke Cust / Sto kab/kota tersebut. Tambahan **dua kolom** `Cost/Trip` dan `Cost/CBM` untuk mengisi angka langsung tanpa memilih armada. Template header: `docs/templates/Hub_SDC_RDC_cost_header.csv`. Di dashboard, segmen "Fasilitas → Cust / Sto" (last mile) muncul di Cost per armada dan bisa dipilih seperti segmen lain; kolom armada yang namanya sama dengan di Cost F2F digabung jadi satu kolom (jadi pakai penulisan header yang sama persis, mis. `CDDL Darat` di kedua tab), dan `Cost/Trip` + `Cost/CBM` tampil sebagai satu kolom **Langsung**.
6. **Project rute (tab `NDC HCI|AHI`)**: sama persis dengan Hub/SDC/RDC. Di kanan kolom yang sudah ada (`NDC Reguler` dst., jangan digeser) tambah kolom armada (`CDDL Darat`, `Fuso Darat`, `Cont-20 Laut`, …) + `Cost/Trip` dan `Cost/CBM`. Isinya = cost dari NDC langsung ke Cust / Sto kab/kota di baris itu. Di dashboard muncul sebagai segmen **"NDC → Cust / Sto" (project NDC)** di tabel Project rute pada Cost per armada, bisa dipilih seperti segmen lain; kolom dengan nama armada yang sama digabung dengan kolom lain. Template header: `docs/templates/NDC_cost_header.csv`. Kolom `Cost Land` / `Cost Sea` lama tidak dipakai di bagian ini.
