"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Add user</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a user with a random temporary password. They must change it
          on first login.
        </p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <Input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            placeholder="Username (optional)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as AppUserRole)}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <div className="md:col-span-2">
            <Button type="submit" disabled={createMutation.isPending || !token}>
              Create user
            </Button>
          </div>
        </form>
        {createdPassword ? (
          <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            Temporary password:{" "}
            <code className="font-mono font-semibold">{createdPassword}</code>
          </p>
        ) : null}
        {resetPasswordFor ? (
          <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            New temporary password:{" "}
            <code className="font-mono font-semibold">{resetPasswordFor}</code>
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Users</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Username</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data?.users.map((user: AppUser) => {
                const protectedOwner = isProtectedOwner(user);

                return (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span>{user.name}</span>
                        {protectedOwner ? (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">
                            Primary admin
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{user.email}</td>
                    <td className="py-3 pr-4">{user.username ?? "—"}</td>
                    <td className="py-3 pr-4">
                      {protectedOwner ? (
                        <span className="text-xs capitalize">{user.role}</span>
                      ) : (
                        <select
                          className="rounded-md border bg-background px-2 py-1 text-xs"
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
                    <td className="py-3 pr-4">
                      {protectedOwner ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                          Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            user.active
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground"
                          }`}
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
                        <span className="ml-2 text-xs text-amber-600">
                          Must change password
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3">
                      {protectedOwner ? (
                        <span className="text-xs text-muted-foreground">
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
      </section>
    </div>
  );
}
