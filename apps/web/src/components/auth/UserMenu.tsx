"use client";

import { LogOut, UserRound } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { isAuthDisabled } from "@/lib/auth-disabled";

export function UserMenu() {
  if (isAuthDisabled()) {
    return (
      <span className="text-xs text-muted-foreground">Dev mode (auth off)</span>
    );
  }
  return <UserMenuSession />;
}

function UserMenuSession() {
  const { data: session } = useSession();

  const label = session?.user?.email ?? session?.user?.name ?? "Account";

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
        <UserRound className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap" title={label}>
          {label}
        </span>
        {session?.user?.role === "admin" ? (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">
            Admin
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
