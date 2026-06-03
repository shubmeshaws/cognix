import { redirect } from "next/navigation";

import { signIn, auth } from "@/auth";
import { CognixLogo } from "@/components/brand/CognixLogo";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { isAuthDisabled } from "@/lib/auth-disabled";
import {
  fetchAuthSetupStatus,
  fetchSsoPublicConfig,
} from "@/lib/auth-agent";
import { fetchSetupStatus } from "@/lib/setup-api";

export default async function LoginPage() {
  if (isAuthDisabled()) {
    redirect("/dashboard");
  }

  const session = await auth();
  if (session?.user?.mustChangePassword) {
    redirect("/change-password");
  }
  if (session) {
    redirect("/dashboard");
  }

  try {
    const status = await fetchSetupStatus();
    if (status.initialSetupComplete) {
      // Setup finished — login only (no redirect to /setup)
    } else if (!status.readyForLogin) {
      redirect("/setup");
    }
  } catch {
    redirect("/setup");
  }

  const [{ needsSetup }, ssoPublic] = await Promise.all([
    fetchAuthSetupStatus(),
    fetchSsoPublicConfig(),
  ]);

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/dashboard" });
  }

  async function signInWithGithub() {
    "use server";
    await signIn("github", { redirectTo: "/dashboard" });
  }

  async function signInWithLinkedin() {
    "use server";
    await signIn("linkedin", { redirectTo: "/dashboard" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <CognixLogo variant="inline" markSize={64} showTagline />
          <p className="text-base text-muted-foreground">
            {needsSetup
              ? "Set up your admin account to get started"
              : "Sign in to monitor and heal your clusters"}
          </p>
        </div>

        <LoginPanel
          needsSetup={needsSetup}
          ssoProviders={ssoPublic.providers}
          onGoogleSignIn={signInWithGoogle}
          onGithubSignIn={signInWithGithub}
          onLinkedinSignIn={signInWithLinkedin}
        />
      </div>
    </main>
  );
}
