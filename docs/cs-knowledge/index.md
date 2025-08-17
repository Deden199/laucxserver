---
title: "Pusat Pengetahuan CS"
updated: "2025-08-17"
owner: "Tim CS"
---

# Peta Konten

- [Troubleshooting](./troubleshooting/)
- [Runbooks](./runbooks/)
- [Katalog Error](./error-catalog.md)
- [FAQ API](./api-faq.md)
- [Glosarium](./glossary.md)

## SOP Eskalasi

1. Cek cepat menggunakan panduan pada dokumen terkait.
2. Bila masalah berulang atau berdampak luas, catat detail kasus.
3. Hubungi Lead CS melalui chat internal.
4. Lead CS mengevaluasi dan eskalasi ke Dev bila perlu.

```mermaid
flowchart TD
    CS(\"CS Level 1\") -->|kasus kompleks| LeadCS(Lead CS)
    LeadCS -->|perlu analisa| Dev(Team Dev)
    Dev -->|solusi| LeadCS
    LeadCS --> CS
```

Catatan: gunakan tiket internal untuk setiap eskalasi.
