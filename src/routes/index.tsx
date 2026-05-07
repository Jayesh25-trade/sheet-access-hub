import { createFileRoute } from "@tanstack/react-router";
import { EntriesDashboard } from "@/components/EntriesDashboard";

export const Route = createFileRoute("/")({
  component: EntriesDashboard,
  head: () => ({
    meta: [
      { title: "Parth Fuel Corporation — Vehicle Entries" },
      { name: "description", content: "Vehicle entry log for Parth Fuel Corporation. Public view, admin edits." },
    ],
  }),
});
