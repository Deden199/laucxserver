---
title: "Reset Settlement Cursor"
updated: "2025-08-17"
owner: "Tim Ops"
---

### Tujuan
Mengulang proses settlement yang tertahan.

### Langkah
1. Login ke server settlement: `ssh ops@<settlement-host>`.
2. Jalankan perintah:
   ```bash
   ./reset-cursor.sh --merchant <MID>
   ```
3. Pastikan log menunjukkan `cursor reset success`.
4. Informasikan ke merchant bahwa settlement akan diproses ulang.

### Kapan Hubungi Dev
- Skrip gagal dijalankan atau tidak ada respon.
- Cursor tetap tidak bergerak setelah reset.
