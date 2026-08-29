const messages: Record<string, string> = {
  OAuthSignin:
    "Google kirishini boshlash amalga oshmadi. Google Client ID va Client Secret bir-biriga mosligini tekshiring.",
  OAuthCallback:
    "Google callback tasdiqlanmadi. Saytni NEXTAUTH_URL dagi aynan shu hostname orqali oching (localhost va 127.0.0.1 aralashtirilmasin) va redirect URI’ni tekshiring.",
  Callback:
    "Google tasdiqladi, ammo ilova foydalanuvchini yakunlay olmadi. PocketBase ulanishi va server logini tekshiring.",
  AccessDenied:
    "Google hisobiga kirishga ruxsat berilmadi. Consent Screen test userlari va email tasdiqlanganini tekshiring.",
  OAuthCreateAccount:
    "Google foydalanuvchisini PocketBase’da yaratib bo‘lmadi.",
  OAuthAccountNotLinked:
    "Bu email boshqa kirish usuliga bog‘langan. Avval email/parol bilan kirib ko‘ring.",
  CredentialsSignin: "Email yoki parol noto‘g‘ri.",
  Configuration:
    "Autentifikatsiya serveri to‘liq sozlanmagan. NEXTAUTH_SECRET va provider credential’larini tekshiring.",
};

export function authErrorMessage(code?: string) {
  return code
    ? messages[code] ?? "Kirish amalga oshmadi. Ma’lumotlarni tekshirib qayta urinib ko‘ring."
    : null;
}

