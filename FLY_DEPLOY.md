# Fly.io ga Deploy Qilish Qo'llanmasi

Loyiha uchun barcha kerakli fayllar (`Dockerfile`, `fly.toml`, `.dockerignore`) to'liq tayyorlandi.

---

### 1. Terminalda deploy qilish (Tavsiya etiladi)

Kompyuteringiz terminalida loyiha papkasiga o'tib, quyidagi buyruqni bering:

```bash
fly deploy
```

> **Muhim:** Agar terminalda `Tigris object storage yaratilsinmi?` deb so'rasa, **`N` (No)** deb yozing, chunki sizda Cloudflare R2 mavjud.

---

### 2. Maxfiy kalitlarni (Cloudflare R2 va DB) sozlash

Fly.io da o'zgaruvchilarni kiritish uchun:

```bash
fly secrets set \
  R2_ACCOUNT_ID="sizning_cloudflare_account_id" \
  R2_ACCESS_KEY_ID="sizning_r2_access_key" \
  R2_SECRET_ACCESS_KEY="sizning_r2_secret_key" \
  R2_BUCKET_NAME="sizning_bucket_nomi" \
  R2_PUBLIC_DOMAIN="https://sizning-r2-domeningiz.r2.dev" \
  DATABASE_URL="mysql://foydalanuvchi:parol@host:3306/baza_nomi"
```

---

### 3. Server holatini tekshirish

Deploy tugagach, server loglarini jonli ko'rish uchun:

```bash
fly logs
```

Ilovani brauzerda ochish uchun:
```bash
fly open
```
