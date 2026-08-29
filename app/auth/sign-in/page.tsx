import { Banner, LayerCard, Link } from "@cloudflare/kumo";
import { PaperPlaneTiltIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { SignInButton } from "@/components/auth/sign-in-button";
import { EmailPasswordSignIn } from "@/components/auth/email-password-sign-in";
import { authOptions } from "@/lib/auth/options";
import { authErrorMessage } from "@/lib/auth/error-message";
import { isGoogleAuthConfigured } from "@/lib/env";

export const metadata = { title: "Kirish" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) redirect("/dashboard");
  const { error } = await searchParams;
  const configured = isGoogleAuthConfigured();
  const errorMessage = authErrorMessage(error);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div aria-hidden className="app-grid pointer-events-none absolute inset-0 opacity-70" />
      <LayerCard className="relative w-full max-w-md rounded-3xl p-7 shadow-xl shadow-black/5 sm:p-9">
        <Link href="/" variant="plain" className="mx-auto flex w-fit items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-kumo-brand text-white">
            <PaperPlaneTiltIcon aria-hidden size={21} weight="fill" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Osing</span>
        </Link>
        <div className="mt-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Xush kelibsiz</h1>
          <p className="mt-2 leading-6 text-kumo-subtle">
            PocketBase email/paroli yoki Google hisobingiz orqali kiring.
          </p>
        </div>
        {errorMessage ? <Banner variant="error" className="mt-6">{errorMessage}</Banner> : null}
        <div className="mt-6"><EmailPasswordSignIn /></div>
        <div className="my-6 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-kumo-hairline" />
          <span className="text-xs text-kumo-subtle">yoki</span>
          <span className="h-px flex-1 bg-kumo-hairline" />
        </div>
        <SignInButton configured={configured} />
        {!configured ? <Banner variant="alert" className="mt-4">Google OAuth sozlanmagan, lekin PocketBase email/parol orqali kirish ishlaydi.</Banner> : null}
        <div className="mt-6 flex items-start gap-2 rounded-xl bg-kumo-recessed p-3 text-sm text-kumo-subtle">
          <ShieldCheckIcon aria-hidden className="mt-0.5 shrink-0" size={17} />
          Bu Google paroli emas — PocketBase’dagi ilova account paroli. Telegram akkaunti keyingi alohida bosqichda ulanadi.
        </div>
      </LayerCard>
    </main>
  );
}
