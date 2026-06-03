import { redirect } from "next/navigation";

import { CognixLogo } from "@/components/brand/CognixLogo";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { auth } from "@/auth";
import { isAuthDisabled } from "@/lib/auth-disabled";

export default async function ChangePasswordPage() {
  if (isAuthDisabled()) {
    redirect("/dashboard");
  }

  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.mustChangePassword) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-12 shadow-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <CognixLogo variant="inline" markSize={64} />
          <h1 className="text-2xl font-semibold">Change your password</h1>
        <p className="max-w-lg text-base text-muted-foreground">
          Your account uses a temporary password. Choose a new password before
          continuing.
        </p>
        </div>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
