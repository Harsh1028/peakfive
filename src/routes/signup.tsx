import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/site/auth-form";
import { seo } from "@/lib/seo";
export const Route=createFileRoute("/signup")({head:()=>seo("Create Your Account","Create a verified PEAKFIVE account for private engineering scenarios."),component:()=> <AuthForm mode="signup"/>});