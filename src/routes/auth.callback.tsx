import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { safeDestination } from "@/lib/account";
import { supabase } from "@/integrations/supabase/client";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/auth/callback")({
  head: () => seo("Confirm Account", "Complete secure PEAKFIVE account verification."),
  component: Page,
});
function Page() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has("error") || window.location.hash.includes("error"))
      setError(
        "This confirmation link is invalid or expired. Return to sign-in or request a new recovery link.",
      );
    if (q.has("code"))
      void supabase.auth.exchangeCodeForSession(q.get("code") ?? "").then(({ error: e }) => {
        if (e) setError("This confirmation link could not be completed.");
      });
  }, []);
  useEffect(() => {
    if (auth.user) {
      const path = safeDestination(sessionStorage.getItem("peakfive.redirect"));
      sessionStorage.removeItem("peakfive.redirect");
      void navigate({ to: path });
    }
  }, [auth.user, navigate]);
  return (
    <div className="site-band text-center">
      <h1 className="text-3xl">Confirming your account</h1>
      <p role={error ? "alert" : "status"} className="mt-4 text-muted-foreground">
        {error || "Waiting for secure account confirmation…"}
      </p>
    </div>
  );
}
