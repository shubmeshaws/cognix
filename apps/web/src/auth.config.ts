import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config for middleware only.
 * Do not import providers, nodemailer, or Node-only modules here.
 */
export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      if (process.env.NEXT_PUBLIC_AUTH_DISABLED === "true") {
        return true;
      }
      return !!auth;
    },
  },
} satisfies NextAuthConfig;
