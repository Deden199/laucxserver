---
title: "Ubah Jadwal Cron"
updated: "2025-08-17"
owner: "Tim Ops"
---

### Tujuan
Menyesuaikan jadwal tugas otomatis.

### Langkah
1. Login ke server terkait: `ssh ops@<server>`.
2. Edit crontab: `crontab -e`.
3. Ubah jadwal sesuai kebutuhan, contoh:
   ```
   0 2 * * * /usr/local/bin/settlement.sh
   ```
4. Simpan dan keluar.
5. Verifikasi dengan `crontab -l`.

### Kapan Hubungi Dev
- Tidak yakin perintah yang akan dijalankan.
- Cron tidak berjalan setelah diubah.
