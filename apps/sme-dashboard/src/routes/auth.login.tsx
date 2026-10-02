import { createFileRoute } from "@tanstack/react-router";
import { authSearch } from "@/features/auth/validation";
import { CredentialsScreen } from "@/components/auth/CredentialsScreen";

export const Route = createFileRoute("/auth/login")({
  validateSearch: authSearch,
  head: () => ({ meta: [{ title: "Log in — Sokoni Digital SME" }] }),
  component: Login,
});
function Login() {
  const { redirect } = Route.useSearch();
  return <CredentialsScreen mode="login" redirect={redirect} />;
}
