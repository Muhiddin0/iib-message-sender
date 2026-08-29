# Architecture decisions

## Server boundaries

UI faqat domain DTO’larni ko‘radi. Telegram credential/session bilan ishlaydigan fayllar `server-only`; React component’lar mtcute yoki PocketBase admin client’ni import qilmaydi.

```text
React UI
  → authenticated route handler
    → CampaignService / TelegramService
      → repositories
        → PocketBase
      → isolated mtcute client
        → Telegram MTProto
```

`repositories` ownership va persistence’ni, service’lar validation va business invariant’larni, worker esa delivery lifecycle’ni boshqaradi.

## Nega alohida worker

Bir campaign 200 tagacha chatni target qilishi, Telegram flood-wait esa request vaqtidan uzun bo‘lishi mumkin. Next.js request ichida jarayonni ushlab turish browser disconnect/redeploy’da ishonchsiz. PocketBase job collection qo‘shimcha broker talab qilmaydi va private VPS’da alohida bitta Node process uchun yetarli.

Worker job’ni 5 daqiqalik lease bilan claim qiladi. Crash’dan keyin eskirgan lease qayta queue qilinadi. Hozirgi model bitta worker instance uchun mo‘ljallangan; multi-worker atomik claim talab qilsa keyingi versiyada PocketBase transaction/hook bilan kengaytiriladi.

## Authorization model

- PocketBase password yoki Google OAuth + NextAuth JWT application user’ni aniqlaydi. PocketBase auth token browserga berilmaydi.
- JWT faqat PocketBase user ID va `session_version` saqlaydi.
- Har API request PocketBase user mavjudligi va session version’ni tekshiradi.
- Telegram authorization mutlaqo boshqa oqim; uning session’i NextAuth JWT’ga kirmaydi.
- PocketBase user-owned collections public/auth API’dan yopiq; server admin client ishlatishdan oldin route/service ownership’ni tekshiradi.

## Delivery lifecycle

```text
queued → sending → sent
                 ↘ failed | permission_denied | unauthorized
          ↘ flood_wait → sending (same random ID, safe time only)
```

Campaign status delivery aggregate’dan olinadi: pending bor bo‘lsa `sending`; hammasi sent bo‘lsa `completed`; sent va error aralash bo‘lsa `partial`; hammasi error bo‘lsa `failed`.

Forward kampaniya `source_message_link` mavjudligi bilan ajratiladi. Link request vaqtida ulangan Telegram session orqali tekshiriladi, worker esa har delivery uchun stable random ID bilan MTProto `messages.forwardMessages` chaqiradi. Telegram permalink bera olgan targetlarda natija linki delivery record’da saqlanadi.

## Media lifecycle

Upload serverda MIME, extension, size va magic bytes bilan tekshiriladi. PocketBase protected file worker olguncha saqlaydi. Worker uni mode `0600` temp file’ga yozadi, mtcute upload qilgach temp katalogni har qanday holatda o‘chiradi. Campaign terminal holatida PocketBase file ham o‘chiriladi.

## Realtime

Direct browser → PocketBase realtime admin credential talab qilardi. Shu sabab Next.js authenticated SSE proxy alohida PocketBase client bilan subscription ochadi, ownership bo‘yicha filter qiladi va faqat sanitized campaign/delivery DTO yoki invalidation event beradi.

## Excel eksport

Authenticated route handler faqat joriy userga tegishli tanlangan kampaniya record’larini repository orqali oladi va serverda `.xlsx` yaratadi. Workbook vizual KPI dashboard, kanal/chat kesimidagi statistika, batafsil kampaniya/delivery va `Ogohlantirish` varaqlaridan iborat; foydalanuvchi kiritgan matnlar formula sifatida ishlamasligi uchun xavfli prefixlar escape qilinadi.
