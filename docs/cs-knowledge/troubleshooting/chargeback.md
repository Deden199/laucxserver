---
title: "Penanganan Chargeback"
updated: "2025-08-17"
owner: "Tim CS"
---

### Gejala
Merchant menerima notifikasi penarikan dana (chargeback) dari transaksi kartu.

### Langkah Cek Cepat
1. Verifikasi detail transaksi: tanggal, nominal, kartu.
2. Minta merchant kirim bukti transaksi dan bukti pengiriman barang/jasa.
3. Catat batas waktu respon dari bank.

### Template Balasan
"Kami telah menerima permintaan chargeback. Mohon kirim bukti transaksi dan pengiriman dalam waktu 2x24 jam agar kami dapat membantu proses disput."

### Kapan Eskalasi ke Dev
- Sistem tidak menampilkan detail chargeback.
- Ada perbedaan data antara dashboard dan bank.
- Sertakan seluruh bukti dari merchant saat eskalasi.
