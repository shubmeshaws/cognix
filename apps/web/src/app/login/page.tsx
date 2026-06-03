import { redirect } from "next/navigation";

import { CognixLogo } from "@/components/brand/CognixLogo";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { isAuthDisabled } from "@/lib/auth-disabled";

export default function LoginPage() {
  if (isAuthDisabled()) {
    redirect("/dashboard");
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <CognixLogo variant="hero" markSize={76} />
        <p className="text-muted-foreground">
          Sign in to monitor and heal your clusters
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-sm">
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" className="w-full">
            Continue with Google
          </Button>
        </form>
        <form
          action={async () => {
            "use server";
            await signIn("nodemailer", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" variant="outline" className="w-full">
            Email magic link
          </Button>
        </form>
      </div>
    </main>
  );
}
