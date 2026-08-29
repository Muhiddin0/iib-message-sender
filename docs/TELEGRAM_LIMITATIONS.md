# Telegram API limitations

Osing analitikani simulyatsiya qilmaydi. Worker `messages.getMessages` ekvivalentidagi mtcute `getMessages(peer, ids)` natijasini o‘qiydi.

| Metric | Qachon mavjud | Mavjud bo‘lmaganda |
|---|---|---|
| Views | Odatda broadcast channel post | `null` / “Mavjud emas” |
| Reactions | Message reaction summary Telegram tomonidan qaytarilganda | `null` / “Mavjud emas” |
| Replies/comments | Group reply metadata yoki channel discussion mavjud bo‘lganda | `null` / “Mavjud emas” |

Muhim cheklovlar:

- Private 1:1 dialoglar sync qilinmaydi.
- `community` va `monoforum` birinchi versiyada target emas.
- Channel’ga faqat creator yoki `postMessages` admin right bilan yuboriladi.
- Guruh media permission’lari photo va video uchun alohida saqlanadi.
- Telegram message’ni keyin o‘chirsa yoki access o‘zgarsa refresh metric bera olmaydi.
- Content protection yoqilgan yoki ulangan hisob ko‘ra olmaydigan xabarni forward qilib bo‘lmaydi.
- Telegram basic guruh xabarlari uchun permalink bermaydi; bunday muvaffaqiyatli delivery’da message ID saqlanadi, link esa `null` bo‘ladi.
- Metrics realtime push emas; yuborishdan keyin boshlang‘ich job va foydalanuvchi bosgan refresh orqali olinadi.
- Rate limit/flood-wait’ni chetlab o‘tish yoki agressiv retry yo‘q.
