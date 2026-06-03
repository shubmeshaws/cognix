import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

export const { auth: middlewareAuth } = NextAuth(authConfig);

export default middlewareAuth;

/** Must live in this file — re-exported config is ignored by Next.js. */
export const config = {
  matcher: ["/dashboard/:path*", "/change-password"],
};
