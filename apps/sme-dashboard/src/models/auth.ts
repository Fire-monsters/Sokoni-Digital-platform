export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  userId: string;
  phoneVerified: true;
}

export interface PendingVerification {
  phoneNumber: string;
  resendAt: number;
}

export type AuthState =
  | { status: "loading" | "anonymous" }
  | { status: "authenticated"; session: AuthSession }
  | { status: "error"; message: string };
