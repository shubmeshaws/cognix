"use client";

import { useQuery } from "@tanstack/react-query";
import { SessionProvider, useSession } from "next-auth/react";
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import { DEV_USER_ID } from "@/lib/dev-user";

async function fetchDevToken(): Promise<string> {
  const res = await fetch("/api/dev/token");
  if (!res.ok) {
    throw new Error("Failed to load dev API token");
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

const AgentTokenContext = createContext<string | undefined>(undefined);
const ActorIdentityContext = createContext<{
  id?: string;
  email: string;
}>({ email: "unknown" });

export function useAgentToken(): string | undefined {
  return useContext(AgentTokenContext);
}

export function useActorIdentity(): { id?: string; email: string } {
  return useContext(ActorIdentityContext);
}

function DevAuthBridge({ children }: { children: ReactNode }) {
  const tokenQuery = useQuery({
    queryKey: ["dev-agent-token", DEV_USER_ID],
    queryFn: fetchDevToken,
    staleTime: 60_000,
    refetchInterval: false,
    retry: 2,
  });

  const identity = { id: DEV_USER_ID, email: "dev@local" };

  return (
    <AgentTokenContext.Provider value={tokenQuery.data}>
      <ActorIdentityContext.Provider value={identity}>
        {children}
      </ActorIdentityContext.Provider>
    </AgentTokenContext.Provider>
  );
}

function SessionAuthBridge({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const token =
    status === "authenticated" ? session?.user?.agentToken : undefined;

  const identity = {
    id: session?.user?.id,
    email: session?.user?.email ?? "unknown",
  };

  return (
    <AgentTokenContext.Provider value={token}>
      <ActorIdentityContext.Provider value={identity}>
        {children}
      </ActorIdentityContext.Provider>
    </AgentTokenContext.Provider>
  );
}

/** Auth disabled: dev token only (no NextAuth session fetch). */
export function DevAuthProvider({ children }: { children: ReactNode }) {
  return <DevAuthBridge>{children}</DevAuthBridge>;
}

/** Auth enabled: NextAuth session + agent token in JWT. */
export function AppAuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <SessionAuthBridge>{children}</SessionAuthBridge>
    </SessionProvider>
  );
}
