# Osing — Telegram Campaign Dashboard

Osing PocketBase email/paroli yoki Google OAuth orqali kirgan foydalanuvchiga bitta shaxsiy Telegram hisobini MTProto orqali ulash, guruh va kanallarni sinxronlash, yangi matn/rasm/video yuborish yoki mavjud xabarni link orqali forward qilish va har bir yetkazishni jonli kuzatish imkonini beradi.

## Arxitektura

```text
Browser
  ├─ PocketBase password yoki Google OAuth → NextAuth JWT
  ├─ Next.js route handlers → application services → PocketBase repositories
  └─ authenticated SSE ← PocketBase realtime

Next.js → PocketBase job queue ← Telegram worker → mtcute/MTProto → Telegram
```

- Next.js 16 App Router — UI, PocketBase/Google autentifikatsiyasi, ownership tekshiruvlari va API.
- PocketBase — yagona ma’lumotlar bazasi, media vaqtinchalik ombori va realtime manbasi.
- `@mtcute/node` — serverdagi MTProto authorization, chat sync, send va message metrics.
- Alohida bitta worker — uzoq yuborish jarayonini browser request’idan ajratadi; Redis yoki boshqa database kerak emas.
- Kumo UI — asosiy UI komponentlari; katta sidebar’siz ixcham Telegram-uslubidagi interfeys.

Batafsil qarorlar [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) da.

## Talablar

- Node.js 20.6+ va npm
- PocketBase 0.39.x CLI/binary
- Google Cloud OAuth client (Google login ishlatilsa)
- `my.telegram.org/apps` orqali olingan Telegram API ID/hash

## Lokal ishga tushirish

1. Dependency’larni o‘rnating:

   ```bash
   npm ci
   ```

2. Environment faylini tayyorlang:

   ```bash
   cp .env.example .env.local
   openssl rand -base64 32
   openssl rand -base64 32
   ```

   Birinchi qiymatni `NEXTAUTH_SECRET`, ikkinchisini `TELEGRAM_SESSION_ENCRYPTION_KEY` sifatida kiriting. Telegram kaliti base64’dan aynan 32 byte bo‘lib ochilishi kerak.

3. PocketBase’ni ishga tushiring va migratsiyani qo‘llang:

   ```bash
   npm run pocketbase:serve
   npm run pocketbase:migrate
   ```

   Admin UI odatda `http://127.0.0.1:8090/_/` da. `_superusers` uchun token yoki email/parolni `.env.local` ga kiriting.

4. Next.js va Telegram worker’ni birga ishga tushiring:

   ```bash
   npm run dev
   ```

   `npm run dev` `.env`/`.env.local` ni yuklaydi va web server bilan bitta Telegram worker’ni boshqaradi.

5. Production yoki alohida process kerak bo‘lsa, workerni mustaqil ishga tushiring:

   ```bash
   npm run worker
   ```

   Lokal va tavsiya etilgan VPS konfiguratsiyasida aynan **bitta worker nusxasi** ishlaydi.

## PocketBase email/parol va Google OAuth

Email/parol login uchun PocketBase Admin UI’dagi `users` kolleksiyasida user yarating va email hamda password belgilang. `google_subject` password-only user uchun bo‘sh qolishi mumkin. Bu forma Google parolini tekshirmaydi — faqat PocketBase’da saqlangan ilova parolini qabul qiladi.

Muvaffaqiyatli tekshiruvdan keyin PocketBase auth token darhol server xotirasidan tozalanadi; browser faqat NextAuth JWT session oladi. Noto‘g‘ri email va noto‘g‘ri parol bir xil umumiy xato bilan qaytariladi.

Google OAuth ham parallel ravishda ishlaydi. Google Cloud Console’da Web Application OAuth client yarating:

Google Cloud Console’da Web Application OAuth client yarating:

- JavaScript origin: `http://localhost:3000`
- Redirect URI: `http://localhost:3000/api/auth/callback/google`

Production’da ikkalasini HTTPS domen bilan almashtiring va `NEXTAUTH_URL=https://example.com` qiling. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` va `NEXTAUTH_SECRET` server-only qiymatlardir.

## Telegram sozlamasi

`https://my.telegram.org/apps` dan API ID/hash yarating va `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` ga kiriting. Ular hech qachon `NEXT_PUBLIC_*` bo‘lmasligi kerak.

Authorization oqimi:

1. Telefon xalqaro formatda tekshiriladi.
2. mtcute code hash va vaqtinchalik session oladi.
3. Challenge serverda shifrlanib, 10 daqiqaga saqlanadi.
4. Kod va zarur bo‘lsa 2FA paroli serverda tekshiriladi.
5. Yakuniy session alohida `telegram_sessions` record’iga shifrlangan holda yoziladi.
6. Chat sync job avtomatik navbatga qo‘yiladi.

Kod, 2FA paroli, API hash va ochilgan session log yoki API response’iga kirmaydi.

## Sessiya xavfsizligi

Session va authorization challenge AES-256-GCM bilan shifrlanadi:

- har yozishda 96-bit tasodifiy IV;
- 128-bit authentication tag;
- AAD: purpose + application user ID + optional resource ID;
- ciphertext, IV, tag va key version PocketBase’da alohida saqlanadi;
- kalit faqat server environment’ida saqlanadi.

Bir user session’i boshqa user AAD context’ida ochilmaydi. Joriy versiyada kalitni almashtirish mavjud Telegram session’larini qayta ulashni talab qiladi; key version maydoni keyingi bosqichdagi controlled rotation uchun tayyor.

## PocketBase kolleksiyalari

| Collection | Vazifa |
|---|---|
| `users` | PocketBase password identity, optional Google identity va application session version |
| `telegram_accounts` | Bitta userga bitta Telegram account metadata/status |
| `telegram_sessions` | AES-GCM ciphertext, IV, tag, key version |
| `telegram_auth_challenges` | 10 daqiqalik code/2FA authorization holati |
| `telegram_chats` | Guruh/kanal metadata va send permissions |
| `campaigns` | Xabar snapshot’i, forward manbasi, agregat holat va vaqtinchalik protected media |
| `campaign_deliveries` | Har chat uchun status, stable Telegram random ID, yakuniy message link va metrics |
| `telegram_jobs` | VPS worker navbati, lease va flood-wait `not_before` |
| `activities` | Userga ko‘rsatiladigan xavfsiz real-time eventlar |

NextAuth foydalanuvchisi PocketBase auth token olmaydi. Shu sabab user-owned kolleksiyalar direct PocketBase API uchun yopiq (`null` rules); barcha kirish Next.js repository layer’dagi authenticated user va ownership tekshiruvlari orqali amalga oshadi. Bu boshqa user record’iga direct/IDOR kirishni bloklaydi.

## Yuborish va idempotency

- Browser faqat campaign yaratadi; yuborish worker’da bajariladi.
- Tanlangan chat ID’lari serverda user va connected account bo‘yicha qayta tekshiriladi.
- Har delivery’da stable 64-bit `telegram_random_id` bor. Flood-wait’dan keyingi xavfsiz retry shu ID bilan bajariladi va Telegram duplicate send’dan himoya qiladi.
- Forward rejimida server `t.me` linkini ulangan Telegram session orqali tekshiradi; protected yoki ko‘rinmaydigan xabar kampaniya yaratilishidan oldin rad etiladi.
- Kanal va superguruhga muvaffaqiyatli yuborilgan xabarning permalink’i delivery bilan saqlanadi. Telegram permalink bermaydigan basic guruhlar UI’da “Mavjud emas” bo‘lib ko‘rinadi.
- Default concurrency `1`; maksimum `3`. Telegram account xavfsizligi tezlikdan ustun.
- Flood wait raw RPC xatosi UI’ga chiqmaydi; job `not_before` vaqtigacha pauza qilinadi.
- Noaniq oddiy network xatosi avtomatik agressiv qayta yuborilmaydi.
- Protected media yakuniy success/partial/failure’dan keyin PocketBase va OS temp katalogidan tozalanadi.

## Realtime va analitika

PocketBase realtime subscription serverdagi authenticated SSE endpoint orqali browser’ga uzatiladi. Browser PocketBase superuser tokenini olmaydi. Campaign detail har delivery va campaign o‘zgarishida, dashboard esa campaign/activity o‘zgarishida yangilanadi.

Worker yuborilgan message’ni `getMessages` orqali tekshiradi:

- **Views** — asosan broadcast channel postlarida mavjud.
- **Reactions** — Telegram message reaksiyalarni qaytargandagina jami count.
- **Replies/comments** — reply metadata yoki channel discussion thread mavjud bo‘lganda.

Guruh/chat turi yoki permission sabab metric berilmasa UI `0` emas, **“Mavjud emas”** ko‘rsatadi. Qo‘shimcha cheklovlar [docs/TELEGRAM_LIMITATIONS.md](docs/TELEGRAM_LIMITATIONS.md) da.

## Excel eksport

Har bir kampaniya tafsilotidagi **Excel eksport** tugmasi faqat o‘sha kampaniya va uning delivery ma’lumotlarini `.xlsx` faylga chiqaradi. Fayl quyidagi varaqlardan iborat:

- `Dashboard` — kampaniya ma’lumotlari, maxfiylik eslatmasi, umumiy KPI’lar, analitika qamrovi va eng faol kanallar;
- `Kanallar statistikasi` — har bir kanal/chat bo‘yicha status, views, reactions, replies, engagement va Telegram xabar linki;
- `Kampaniya` va `Yetkazishlar` — batafsil xom ma’lumotlar;
- `Ogohlantirish` — maxfiylik eslatmasi va eksport vaqti.

## Tekshiruvlar

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Testlar PocketBase credentials, Google identity siyosati, AES-GCM user isolation, telefon code/2FA oqimi, invalid session, Telegram permission, ownership, idempotency, multiple recipients, partial failure, flood-wait mapping va message composer interaction’ini qoplaydi.

## Private VPS deployment

1. PocketBase data katalogi uchun persistent disk va faqat localhost listener ishlating.
2. `.env.local` ni repo tashqarisida yoki mode `0600` bilan saqlang.
3. `npm ci && npm run build` bajaring.
4. Uch process’ni systemd/supervisor bilan boshqaring: PocketBase, Next.js, bitta worker.
5. Nginx/Caddy orqali HTTPS termination qiling; SSE uchun buffering’ni o‘chiring va connection timeout’ni uzaytiring.
6. `pocketbase/pb_data` va environment secrets’ni backup qiling. Session encryption kalitisiz backup’dagi Telegram session’lar tiklanmaydi.

Worker Vercel/serverless uchun mo‘ljallanmagan; private VPS’dagi uzoq ishlaydigan process bu mahsulot uchun sodda va ishonchli modeldir.

## Ko‘p uchraydigan xatolar

- **Google login redirect error** — callback URI `NEXTAUTH_URL/api/auth/callback/google` bilan aynan bir xil ekanini tekshiring.
- **PocketBase configuration missing** — token yoki superuser email/parol juftligini kiriting.
- **Encryption key invalid** — `openssl rand -base64 32` natijasini o‘zgartirmasdan ishlating.
- **Campaign navbatda qoladi** — `npm run worker` process’i va uning environment’ini tekshiring.
- **Telegram sessiyasi eskirgan** — dashboard’dan account’ni uzib, qayta authorization qiling.
- **Chat ko‘rinmaydi** — chat sync’ni yangilang; private 1:1 chatlar va yuborib bo‘lmaydigan community/monoforum’lar birinchi versiyaga kiritilmagan.
