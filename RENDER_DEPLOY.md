# Animem.uz Video CDN - Render.com ga joylash bo'yicha to'liq qo'llanma

Ushbu loyihani [Render.com](https://render.com) ga muammosiz joylash (deploy qilish) uchun quyidagi oddiy qadamlarni bajaring:

---

### 1. Render.com da yangi xizmat ochish
1. [Render Dashboard](https://dashboard.render.com/) ga kiring.
2. **New +** tugmasini bosing va **Web Service** ni tanlang.
3. GitHub / Git repository'ingizni ulang.

---

### 2. Sozlamalar (Build & Start Commands)
* **Name:** `animem-video-cdn` (yoki ixtiyoriy nom)
* **Language / Environment:** `Node`
* **Region:** `Frankfurt (EU Central)` yoki `Singapore`
* **Branch:** `main`
* **Build Command:**
  ```bash
  npm install && npm run build
  ```
* **Start Command:**
  ```bash
  npm start
  ```

---

### 3. Muhit o'zgaruvchilari (Environment Variables)
Render dagi **Environment** bo'limiga quyidagi kalitlarni kiriting:

| Kalit (Key) | Qiymat (Value) | Izoh |
|---|---|---|
| `NODE_ENV` | `production` | Ishlab chiqarish rejimi |
| `PG_HOST` | `psql.fr-roub1.bengt.wasmernet.com` | PostgreSQL Host |
| `PG_PORT` | `20184` | PostgreSQL Port |
| `PG_DATABASE` | `video` | Baza nomi |
| `PG_USER` | `user_9f0a1bbd` | Baza foydalanuvchisi |
| `PG_PASSWORD` | `pw_Nkmiu3Ab8L9fPXRfjABNHImvr6carZO` | Baza paroli |
| `ADMIN_PASSWORD` | `1213234` | CDN Admin kirish paroli |
| `JWT_SECRET` | `animem-uz-secure-jwt-key-2026` | Token imzolash kaliti |
| `ALLOWED_DOMAINS` | `animem.uz,www.animem.uz,localhost` | Ruxsat berilgan saytlar |

*(Eslatma: Render o'zi avtomatik tarzda `PORT` parametrini o'rnatadi, server uni to'g'ridan-to'g'ri qabul qiladi)*

---

### 4. Deploy tugmasini bosing
Render bir necha daqiqada kodni yig'adi (`vite build` + backend `esbuild`) va sizga doimiy ishlaydigan bepul HTTPS manzil beradi (masalan: `https://animem-cdn.onrender.com`).
