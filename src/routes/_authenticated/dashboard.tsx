import { createFileRoute } from "@tanstack/react-router";
import { Overview } from "@/components/pf/overview";
import { useAuth } from "@/lib/auth-store";
import { seo } from "@/lib/seo";
import { AccountAcknowledgement } from "@/components/site/account-acknowledgement";
export const Route = createFileRoute("/_authenticated/dashboard")({ head: () => seo("Personal Dashboard", "Your private PEAKFIVE scheduling workspace."), component: Dashboard });
function Dashboard() { const auth = useAuth(); return <><AccountAcknowledgement /><h1 className="mb-6 text-2xl font-semibold">Welcome back, {String(auth.user?.user_metadata["full_name"] ?? auth.user?.user_metadata["name"] ?? "engineer").split(" ")[0]}</h1><Overview /></>; }