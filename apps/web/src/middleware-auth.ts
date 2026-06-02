import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

export const config = {
  matcher: ["/dashboard/:path*"],
};

export const { auth: middlewareAuth } = NextAuth(authConfig);

export default middlewareAuth;
