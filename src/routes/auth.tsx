import { createFileRoute, redirect } from "@tanstack/react-router";
import { safeDestination } from "@/lib/account";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: safeDestination(s["redirect"]) }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/login", search: { redirect: search.redirect } });
  },
  head: () => seo("Account Access", "Sign in to access a private PEAKFIVE workspace."),
});
