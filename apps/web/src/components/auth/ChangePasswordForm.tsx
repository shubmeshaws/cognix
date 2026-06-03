"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { changePasswordWithAgent } from "@/lib/auth-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    const token = session?.user?.agentToken;
    if (!token) {
      setError("Session expired. Sign in again.");
      return;
    }

    setLoading(true);
    try {
      const result = await changePasswordWithAgent(token, {
        currentPassword,
        newPassword,
      });

      await update({
        agentToken: result.token,
        mustChangePassword: false,
      });

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <Input
        type="password"
        autoComplete="current-password"
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        required
      />
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
