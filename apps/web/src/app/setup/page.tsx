import { redirect } from "next/navigation";

import { SetupWizard } from "@/components/setup/SetupWizard";
import { auth } from "@/auth";
import { isAuthDisabled } from "@/lib/auth-disabled";
import { fetchSetupStatus } from "@/lib/setup-api";

export default async function SetupPage() {
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
      redirect("/login");
    }
  } catch {
    // Agent unreachable — still show setup UI
  }

  return <SetupWizard />;
}
