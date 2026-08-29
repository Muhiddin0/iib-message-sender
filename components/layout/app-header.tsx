import { LinkButton } from "@cloudflare/kumo";
import { PaperPlaneTiltIcon, PlusIcon } from "@phosphor-icons/react/ssr";

import { SignOutButton } from "@/components/auth/sign-out-button";
import type { AppUser } from "@/types/domain";

export function AppHeader({ user }: { user: AppUser }) {
  return (
    <header className="sticky top-0 z-20 border-b border-kumo-hairline bg-kumo-canvas/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a href="/dashboard" className="flex items-center gap-2.5" aria-label="Osing bosh sahifa">
          <span className="flex size-9 items-center justify-center rounded-xl bg-kumo-brand text-white">
            <PaperPlaneTiltIcon aria-hidden size={19} weight="fill" />
          </span>
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">Osing</span>
        </a>
        <nav className="ml-auto flex items-center gap-1.5" aria-label="Asosiy navigatsiya">
          <LinkButton href="/message/new" variant="primary" size="sm" icon={<PlusIcon size={15} />}>
            Yangi xabar
          </LinkButton>
          <div className="hidden items-center gap-2 rounded-lg px-2 text-sm text-kumo-subtle md:flex">
            <span className="flex size-7 items-center justify-center rounded-full bg-kumo-recessed font-medium text-kumo-default">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="max-w-36 truncate">{user.name}</span>
          </div>
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
