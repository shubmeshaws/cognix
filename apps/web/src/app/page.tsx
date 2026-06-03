import { redirect } from "next/navigation";

import { CognixLogo } from "@/components/brand/CognixLogo";
import { isAuthDisabled } from "@/lib/auth-disabled";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  if (isAuthDisabled()) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <CognixLogo variant="hero" showTagline />
      <p className="max-w-md text-center text-muted-foreground">
        Detect, diagnose, and auto-heal pod issues in real time.
      </p>
      <Button asChild>
        <a href="/login">Get started</a>
      </Button>
    </main>
  );
}
