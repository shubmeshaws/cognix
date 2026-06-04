"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { isAuthDisabled } from "@/lib/auth-disabled";

export function AuthGate({ children }: { children: React.ReactNode }) {
  if (isAuthDisabled()) {
    return <>{children}</>;
  }
  return <AuthGateSession>{children}</AuthGateSession>;
}

function AuthGateSession({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    if (session?.user?.mustChangePassword) {
      router.replace("/change-password");
    }
  }, [session?.user?.mustChangePassword, status, router]);

  if (status === "authenticated" && session?.user?.mustChangePassword) {
    return null;
  }

  return <>{children}</>;
}
