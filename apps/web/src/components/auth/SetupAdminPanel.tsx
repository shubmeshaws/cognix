"use client";

import { useState } from "react";

import { bootstrapAdminWithAgent } from "@/lib/auth-agent";
import { Button } from "@/components/ui/button";

export interface GeneratedAdminCreds {
  email: string;
  username: string;
  password: string;
}

interface SetupAdminPanelProps {
  onGenerated: (creds: GeneratedAdminCreds) => void;
}

export function SetupAdminPanel({ onGenerated }: SetupAdminPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setLoading(true);

    try {
      const creds = await bootstrapAdminWithAgent();
      onGenerated({
        email: creds.email,
        username: creds.username,
        password: creds.password,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6">
      <p className="mb-2 text-base font-medium text-foreground">First-time setup</p>
      <p className="mb-5 text-sm text-muted-foreground">
        No admin account exists yet. Generate credentials to create the initial
        admin user.
      </p>
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      <Button
        type="button"
        className="w-full bg-blue-600 text-white shadow hover:bg-blue-700"
        disabled={loading}
        onClick={() => void handleGenerate()}
      >
        {loading ? "Generating…" : "Generate admin credentials"}
      </Button>
    </div>
  );
}
