import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/common";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "Finance — Sokoni Digital SME" },
      { name: "description", content: "Finance for your Sokoni Digital SME workspace." },
      { property: "og:title", content: "Finance — Sokoni Digital SME" },
      { property: "og:description", content: "Finance for your Sokoni Digital SME workspace." },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Finance" />
      <EmptyState
        title="Coming next"
        description="This screen is planned and not built yet in this prototype."
      />
    </>
  ),
});
