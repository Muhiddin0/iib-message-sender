"use client";

import { Button } from "@cloudflare/kumo";
import { GoogleLogoIcon } from "@phosphor-icons/react";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function SignInButton({ configured }: { configured: boolean }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      variant="primary"
      size="lg"
      icon={GoogleLogoIcon}
      loading={loading}
      disabled={!configured || loading}
      className="w-full justify-center"
      onClick={() => {
        setLoading(true);
        void signIn("google", { callbackUrl: "/dashboard" });
      }}
    >
      Google bilan kirish
    </Button>
  );
}
