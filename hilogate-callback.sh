#!/usr/bin/env bash

# ───────── CONFIG ─────────
REFID="681ce2f694ee4bb15daea59a"        # ganti dengan ref_id-mu
AMOUNT=10000                           # ganti dengan jumlah sebenarnya
SECRET="aa6f89a6e03d63a541a902d06"     # HILOGATE_SECRET_KEY-mu
HOST="http://localhost:5006"          # base URL backend-mu

# ───────── Bentuk JSON body callback ─────────
BODY='{"data":{"ref_id":"'"$REFID"'","resp_code":"0000","amount":'"$AMOUNT"'}}'

# ───────── Hitung MD5 signature ─────────
SIG=$(printf "%s%s" "$BODY" "$SECRET" \
  | openssl dgst -md5 \
  | sed 's/^.* //'
)

echo "→ POST /api/v1/transaction/callback"
echo "  X-Signature: $SIG"
echo "  Body: $BODY"
echo

# ───────── Kirim callback ─────────
curl -i -X POST "$HOST/api/v1/transaction/callback" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIG" \
  -d "$BODY"

echo; echo

# ───────── Cek status setelah callback ─────────
echo "→ GET /api/v1/order/$REFID/status"
curl -i "$HOST/api/v1/order/$REFID/status"
echo
