## Apa yang berubah
<!-- 1–3 kalimat. Fitur / fix / data-handling? -->

## Kenapa
<!-- Request dari siapa / bug apa. Link screenshot kalau ada. -->

## Cek sebelum merge
- [ ] `python3 -I scripts/validate_sheet.py` dijalankan; temuan baru sudah dikabarkan
- [ ] `node scripts/smoke_test.js` lolos semua (screenshot dicek)
- [ ] Tidak ada data yang di-hardcode di `index.html` (semua dari gsheet)
- [ ] Berlaku untuk HCI **dan** AHI (atau dijelaskan kenapa tidak)
- [ ] `CHANGELOG.md` diupdate; `CLAUDE.md` / `docs/PANDUAN_GSHEET.md` diupdate jika skema/quirk berubah
