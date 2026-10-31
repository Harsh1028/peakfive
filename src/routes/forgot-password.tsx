import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/site/auth-form";
import { seo } from "@/lib/seo";
export const Route=createFileRoute("/forgot-password")({head:()=>seo("Password Recovery","Request a secure PEAKFIVE account recovery link."),component:()=> <AuthForm mode="forgot"/>});