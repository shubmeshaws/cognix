"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { AppAuthProvider, DevAuthProvider } from "@/components/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { isAuthDisabled } from "@/lib/auth-disabled";
import { queryClientDefaults } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";
import { useSettingsStore } from "@/stores/settings";

function ZustandInit({ children }: { children: React.ReactNode }) {
  const resetCluster = useClusterStore((s) => s.reset);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    hydrateSettings();
    return () => resetCluster();
  }, [resetCluster, hydrateSettings]);

  return children;
}

function AuthWrapper({ children }: { children: React.ReactNode }) {
  if (isAuthDisabled()) {
    return <DevAuthProvider>{children}</DevAuthProvider>;
  }
  return <AppAuthProvider>{children}</AppAuthProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: queryClientDefaults,
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthWrapper>
          <ZustandInit>{children}</ZustandInit>
        </AuthWrapper>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
