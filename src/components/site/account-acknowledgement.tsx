import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getAccount, acceptTerms } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth-store";
import { Btn } from "@/components/pf/ui";
import { useState } from "react";
export function AccountAcknowledgement() {
  const auth = useAuth();
  const query = useQueryClient();
  const get = useServerFn(getAccount);
  const accept = useServerFn(acceptTerms);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["account", auth.user?.id],
    queryFn: () => get(),
    enabled: !!auth.user,
  });
  if (!data || data.profile.terms_accepted_at) return null;
  return (
    <div className="mb-5 border border-warning/40 bg-warning/10 p-4 text-sm">
      <p>
        Review the{" "}
        <Link to="/privacy" className="underline">
          draft Privacy Policy
        </Link>{" "}
        and{" "}
        <Link to="/terms" className="underline">
          draft Terms of Service
        </Link>{" "}
        before saving private scenarios. These documents await legal review.
      </p>
      <Btn
        className="mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await accept();
            await query.invalidateQueries({ queryKey: ["account"] });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save acknowledgement");
          } finally {
            setBusy(false);
          }
        }}
      >
        Acknowledge draft documents
      </Btn>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
