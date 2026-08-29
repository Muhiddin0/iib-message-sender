"use client";

import { Button } from "@cloudflare/kumo";
import { SignOutIcon } from "@phosphor-icons/react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      icon={SignOutIcon}
      onClick={() => void signOut({ callbackUrl: "/" })}
    >
      Chiqish
    </Button>
  );
}
