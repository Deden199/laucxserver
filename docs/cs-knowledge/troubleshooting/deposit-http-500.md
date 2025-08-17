---
title: "Deposit Gagal HTTP 500"
updated: "2025-08-17"
owner: "Tim CS"
---

### Gejala
Merchant tidak bisa melakukan deposit, dashboard menampilkan pesan "HTTP 500".

### Langkah Cek Cepat
1. Pastikan koneksi internet merchant stabil.
2. Cek status layanan di [status page](/) internal.
3. Cari log transaksi di dashboard admin menggunakan ID transaksi.

### Template Balasan
"Mohon maaf, sedang terjadi gangguan server saat proses deposit. Silakan coba kembali dalam beberapa menit. Kami pantau lebih lanjut."

### Kapan Eskalasi ke Dev
- Gangguan terjadi lebih dari 3 kali dalam 1 jam.
- Banyak merchant melaporkan kasus serupa.
- Sertakan ID transaksi dan waktu kejadian saat eskalasi.
