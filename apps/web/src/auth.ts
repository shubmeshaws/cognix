import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";

import { authConfig } from "@/auth.config";
import {
  loginWithAgentCredentials,
  syncOAuthUserWithAgent,
} from "@/lib/auth-agent";

function buildProviders(): Provider[] {
  const providers: Provider[] = [
    Credentials({
      name: "Email and password",
      credentials: {
        emailOrUsername: { label: "Email or username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const emailOrUsername = credentials?.emailOrUsername;
        const password = credentials?.password;
        if (typeof emailOrUsername !== "string" || typeof password !== "string") {
          return null;
        }

        const result = await loginWithAgentCredentials({
          emailOrUsername,
          password,
        });
        if (!result) {
          return null;
        }

        return {
          id: result.userId,
          email: result.email,
          name: result.name,
          agentToken: result.token,
          role: result.role,
          mustChangePassword: result.mustChangePassword,
        };
      },
    }),
  ];

  const googleId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (googleId && googleSecret) {
    providers.push(
      Google({
        clientId: googleId,
        clientSecret: googleSecret,
      }),
    );
  }

  const githubId = process.env.GITHUB_CLIENT_ID?.trim();
  const githubSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (githubId && githubSecret) {
    providers.push(
      GitHub({
        clientId: githubId,
        clientSecret: githubSecret,
      }),
    );
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: buildProviders(),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, trigger, session }) {
      if (user && "agentToken" in user && typeof user.agentToken === "string") {
        token.userId = user.id;
        token.agentToken = user.agentToken;
        token.role = (user as { role?: "admin" | "user" }).role;
        token.mustChangePassword = Boolean(
          (user as { mustChangePassword?: boolean }).mustChangePassword,
        );
        return token;
      }

      if (
        account &&
        (account.provider === "google" || account.provider === "github") &&
        account.providerAccountId
      ) {
        const email =
          (typeof user?.email === "string" && user.email) ||
          (typeof token.email === "string" ? token.email : "");
        if (!email) {
          throw new Error("OAuth account is missing an email address");
        }

        const synced = await syncOAuthUserWithAgent({
          provider: account.provider,
          providerId: account.providerAccountId,
          email,
          name: user?.name ?? token.name ?? email.split("@")[0] ?? "User",
        });

        token.userId = synced.userId;
        token.agentToken = synced.token;
        token.role = synced.role;
        token.mustChangePassword = synced.mustChangePassword;
        token.email = synced.email;
        token.name = synced.name;
        return token;
      }

      if (trigger === "update" && session) {
        if (typeof session.agentToken === "string") {
          token.agentToken = session.agentToken;
        }
        if (typeof session.mustChangePassword === "boolean") {
          token.mustChangePassword = session.mustChangePassword;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.agentToken = token.agentToken as string;
        session.user.role = token.role as "admin" | "user" | undefined;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
});
