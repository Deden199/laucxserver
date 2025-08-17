---
title: "Error QRIS 1450001"
updated: "2025-08-17"
owner: "Tim CS"
---

### Gejala
Pembayaran QRIS gagal dengan kode error `1450001`.

### Langkah Cek Cepat
1. Verifikasi MID merchant sudah aktif.
2. Pastikan merchant terdaftar di penyelenggara QRIS.
3. Cek log response dari provider QRIS di dashboard admin.

### Template Balasan
"Transaksi QRIS ditolak karena status merchant tidak aktif. Mohon hubungi bank penerbit untuk mengaktifkan kembali akun QRIS Anda."

### Kapan Eskalasi ke Dev
- Jika MID sudah aktif tetapi error tetap muncul.
- Jika terjadi pada banyak merchant secara bersamaan.
- Sertakan screenshot log response saat eskalasi.
