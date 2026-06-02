import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import type { Provider } from "next-auth/providers";

import { authConfig } from "@/auth.config";
import { createAgentToken } from "@/lib/agent-token";

function buildProviders(): Provider[] {
  const providers: Provider[] = [];

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

  const emailServer = process.env.EMAIL_SERVER?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  if (emailServer && emailFrom) {
    providers.push(
      Nodemailer({
        server: emailServer,
        from: emailFrom,
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
    async jwt({ token, user, account }) {
      const userId =
        user?.id ??
        token.sub ??
        (typeof token.email === "string" ? token.email : undefined);

      if (userId) {
        token.userId = userId;
        token.agentToken = await createAgentToken(userId);
      }

      if (account?.provider) {
        token.provider = account.provider;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.agentToken = token.agentToken as string;
      }
      return session;
    },
  },
});
