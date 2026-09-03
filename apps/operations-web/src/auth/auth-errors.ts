export function staffSignInError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials"))
    return "The email or password is incorrect.";
  if (normalized.includes("email not confirmed")) return "Confirm your email before signing in.";
  return message;
}
