"use client";

import { useRouter } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginFormProps {
  initialEmailOrUsername?: string;
  initialPassword?: string;
}

export function LoginForm({
  initialEmailOrUsername = "",
  initialPassword = "",
}: LoginFormProps) {
  const router = useRouter();
  const [emailOrUsername, setEmailOrUsername] = useState(initialEmailOrUsername);
  const [password, setPassword] = useState(initialPassword);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        emailOrUsername,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email/username or password");
        return;
      }

      const session = await getSession();
      router.push(
        session?.user?.mustChangePassword ? "/change-password" : "/dashboard",
      );
      router.refresh();
    } catch {
      setError("Sign in failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <Input
        type="text"
        autoComplete="username"
        placeholder="Email or username"
        value={emailOrUsername}
        onChange={(e) => setEmailOrUsername(e.target.value)}
        required
      />
      <Input
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
