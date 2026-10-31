import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/site/auth-form";
import { seo } from "@/lib/seo";
export const Route=createFileRoute("/reset-password")({head:()=>seo("Set a New Password","Update your PEAKFIVE password through a secure recovery link."),component:()=> <AuthForm mode="reset"/>});