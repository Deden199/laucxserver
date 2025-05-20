#!/usr/bin/env bash

# Konfigurasi merchant
MERCHANT_ID="321efdf9-7fd0-4846-811b-e9b3a27a235f"
SECRET_KEY="aa6f89a6e03d63a541a902d06"
ENVIRONMENT="sandbox"

# Endpoint path (tanpa domain)
PATH="/api/v1/references/bank-codes"

# Hitung signature MD5 pakai openssl (tersedia di macOS & Linux)
SIGNATURE=$(printf "%s%s" "$PATH" "$SECRET_KEY" | openssl md5 | awk '{print $2}')

# Panggil endpoint
curl -X GET "https://app.hilogate.com${PATH}" \
  -H "Content-Type: application/json" \
  -H "X-Merchant-ID: ${MERCHANT_ID}" \
  -H "X-Environment: ${ENVIRONMENT}" \
  -H "X-Signature: ${SIGNATURE}"
