"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, UserCircle, UserPlus, Users } from "lucide-react";
import { useState } from "react";

import { useAgentToken } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createUser,
  deleteUser,
  fetchUsers,
  resetUserPassword,
  updateUser,
} from "@/lib/api";
import { isProtectedOwner } from "@/lib/protected-owner";
import type { AppUser, AppUserRole } from "@/types/api";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function AdminUsersPanel() {
  const token = useAgentToken();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<AppUserRole>("user");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-users", token],
    queryFn: () => fetchUsers(token!),
    enabled: Boolean(token),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createUser(token!, {
        email,
        name,
        username: username.trim() || undefined,
        role,
      }),
    onSuccess: (data) => {
      setCreatedPassword(data.temporaryPassword);
      setEmail("");
      setName("");
      setUsername("");
      setRole("user");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: (userId: string) => resetUserPassword(token!, userId),
    onSuccess: (data) => {
      setResetPasswordFor(data.temporaryPassword);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const patchMutation = useMutation({
    mutationFn: (input: {
      id: string;
      patch: Parameters<typeof updateUser>[2];
    }) => updateUser(token!, input.id, input.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(token!, userId),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleDelete(user: AppUser) {
    const confirmed = window.confirm(
      `Delete ${user.email}? This cannot be undone.`,
    );
    if (confirmed) {
      deleteMutation.mutate(user.id);
    }
  }

  const userCount = usersQuery.data?.users.length ?? 0;

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">User management</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create accounts, assign roles, and manage access for Cognix users.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        <article className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-border bg-card p-2.5">
              <UserPlus className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Add user</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Creates a user with a random temporary password. They must change
                it on first login.
              </p>
            </div>
          </div>

          <form
            className="mt-5 grid gap-4 border-t border-border pt-5 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <label className="block space-y-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                Email
              </span>
              <Input
                type="email"
                placeholder="shubmeshaws@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 bg-card"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
                Full name
              </span>
              <Input
                placeholder="Shubham Meshram"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-10 bg-card"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
                Username
                <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <Input
                placeholder="i.am.shubhammeshram"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-10 bg-card"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium text-foreground">Role</span>
              <select
                className={selectClass}
                value={role}
                onChange={(e) => setRole(e.target.value as AppUserRole)}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            {createdPassword ? (
              <div className="md:col-span-2">
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                  Temporary password:{" "}
                  <code className="font-mono font-semibold">{createdPassword}</code>
                </p>
              </div>
            ) : null}

            {resetPasswordFor ? (
              <div className="md:col-span-2">
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                  New temporary password:{" "}
                  <code className="font-mono font-semibold">{resetPasswordFor}</code>
                </p>
              </div>
            ) : null}

            <div className="flex justify-end border-t border-border pt-4 md:col-span-2">
              <Button type="submit" disabled={createMutation.isPending || !token}>
                {createMutation.isPending ? "Creating…" : "Create user"}
              </Button>
            </div>
          </form>
        </article>

        <article className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-border bg-card p-2.5">
                <Users className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground">All users</h3>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {userCount} {userCount === 1 ? "user" : "users"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  View roles, status, and manage existing accounts.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Loading users…
                    </td>
                  </tr>
                ) : null}

                {!usersQuery.isLoading && userCount === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No users yet. Create one above.
                    </td>
                  </tr>
                ) : null}

                {usersQuery.data?.users.map((user: AppUser) => {
                  const protectedOwner = isProtectedOwner(user);

                  return (
                    <tr
                      key={user.id}
                      className={cn(
                        "border-b border-border last:border-0",
                        protectedOwner && "bg-primary/5",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {user.name}
                          </span>
                          {protectedOwner ? (
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                              Primary admin
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{user.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {user.username ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {protectedOwner ? (
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-foreground">
                            {user.role}
                          </span>
                        ) : (
                          <select
                            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs shadow-sm"
                            value={user.role}
                            onChange={(e) =>
                              patchMutation.mutate({
                                id: user.id,
                                patch: { role: e.target.value as AppUserRole },
                              })
                            }
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {protectedOwner ? (
                            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                                user.active
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-muted text-muted-foreground",
                              )}
                              onClick={() =>
                                patchMutation.mutate({
                                  id: user.id,
                                  patch: { active: !user.active },
                                })
                              }
                            >
                              {user.active ? "Active" : "Disabled"}
                            </button>
                          )}
                          {user.mustChangePassword ? (
                            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                              Must change password
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {protectedOwner ? (
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            Protected
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => resetMutation.mutate(user.id)}
                            >
                              Reset password
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => handleDelete(user)}
                            >
                              Delete
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
