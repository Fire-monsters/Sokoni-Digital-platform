import { createFileRoute } from "@tanstack/react-router";
import { authSearch } from "@/features/auth/validation";
import { VerificationScreen } from "@/components/auth/VerificationScreen";

export const Route = createFileRoute("/auth/verify")({
  validateSearch: authSearch,
  head: () => ({ meta: [{ title: "Verify phone — Sokoni Digital SME" }] }),
  component: Verify,
});
function Verify() {
  const { redirect } = Route.useSearch();
  return <VerificationScreen redirect={redirect} />;
}
