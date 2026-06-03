import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      agentToken: string;
      role?: "admin" | "user";
      mustChangePassword?: boolean;
    };
  }

  interface User {
    agentToken?: string;
    role?: "admin" | "user";
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    agentToken?: string;
    provider?: string;
    role?: "admin" | "user";
    mustChangePassword?: boolean;
  }
}
