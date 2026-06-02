interface PuterSignInResult {
  success: boolean;
  token?: string;
  username?: string;
  error?: string;
  msg?: string;
}

interface PuterUser {
  username: string;
}

interface PuterAuth {
  signIn(options?: { attempt_temp_user_creation?: boolean }): Promise<PuterSignInResult>;
  signOut(): Promise<void>;
  isSignedIn(): boolean;
  getUser(): Promise<PuterUser>;
}

interface PuterAiChatResponse {
  message?: { content?: string | { toString(): string } };
  text?: string;
}

interface PuterAI {
  chat(
    prompt: string,
    options?: { model?: string },
  ): Promise<PuterAiChatResponse>;
  listModels?(provider?: string): Promise<Array<{ id: string; provider: string }>>;
}

interface PuterGlobal {
  auth: PuterAuth;
  ai: PuterAI;
}

declare global {
  interface Window {
    puter?: PuterGlobal;
  }
}

export {};
