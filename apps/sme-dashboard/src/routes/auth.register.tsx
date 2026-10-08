import { createFileRoute } from "@tanstack/react-router";
import { authSearch } from "@/features/auth/validation";
import { CredentialsScreen } from "@/components/auth/CredentialsScreen";

export const Route = createFileRoute("/auth/register")({
  validateSearch: authSearch,
  head: () => ({ meta: [{ title: "Create account — Sokoni Digital SME" }] }),
  component: Register,
});
function Register() {
  const { redirect } = Route.useSearch();
  return <CredentialsScreen mode="register" redirect={redirect} />;
}
