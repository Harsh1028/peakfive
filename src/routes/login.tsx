import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/site/auth-form";
import { seo } from "@/lib/seo";
export const Route=createFileRoute("/login")({validateSearch:(s:Record<string,unknown>):{redirect?:string}=>typeof s["redirect"]==="string"?{redirect:s["redirect"]}:{},head:()=>seo("Log In","Secure sign-in to your PEAKFIVE engineering workspace."),component:Page});
function Page(){const s=Route.useSearch();return <AuthForm mode="login" redirect={s.redirect}/>;}