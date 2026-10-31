import { createFileRoute } from "@tanstack/react-router";
import { Overview } from "@/components/pf/overview";
import { useAuth } from "@/lib/auth-store";
import { seo } from "@/lib/seo";
import { AccountAcknowledgement } from "@/components/site/account-acknowledgement";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAccount } from "@/lib/account.functions";
export const Route = createFileRoute("/_authenticated/dashboard")({ head: () => seo("Personal Dashboard", "Your private PEAKFIVE scheduling workspace."), component: Dashboard });
function Dashboard() { const auth = useAuth(); const get=useServerFn(getAccount); const {data}=useQuery({queryKey:["account",auth.user?.id],queryFn:()=>get()}); return <><AccountAcknowledgement /><h1 className="mb-6 text-2xl font-semibold">Welcome back, {String(data?.profile.display_name || auth.user?.user_metadata["full_name"] || "engineer").split(" ")[0]}</h1><Overview /></>; }