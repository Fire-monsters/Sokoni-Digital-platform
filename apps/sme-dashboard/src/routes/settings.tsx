import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/common";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Sokoni Digital SME" },
      { name: "description", content: "Settings for your Sokoni Digital SME workspace." },
      { property: "og:title", content: "Settings — Sokoni Digital SME" },
      { property: "og:description", content: "Settings for your Sokoni Digital SME workspace." },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Settings" />
      <EmptyState
        title="Coming next"
        description="This screen is planned and not built yet in this prototype."
      />
    </>
  ),
});
