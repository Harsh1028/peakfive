import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { getAccount, updateProfile, requestAccountDeletion } from "@/lib/account.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { passwordSchema } from "@/lib/account";
import { Btn, PageHeader } from "@/components/pf/ui";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/settings")({
  head: () =>
    seo(
      "Account Settings",
      "Manage your private PEAKFIVE profile, verified email and account security.",
    ),
  component: Page,
});
function Page() {
  const auth = useAuth();
  const query = useQueryClient();
  const get = useServerFn(getAccount);
  const update = useServerFn(updateProfile);
  const deletion = useServerFn(requestAccountDeletion);
  const { data } = useQuery({ queryKey: ["account", auth.user?.id], queryFn: () => get() });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const perform = async (e: FormEvent, action: () => Promise<unknown>, success: string) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await query.invalidateQueries({ queryKey: ["account"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account update failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Account Settings" sub="Your profile and secure account details." />
      <dl className="grid gap-4 border-y border-border py-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd>{auth.user?.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Verification</dt>
          <dd>{auth.user?.email_confirmed_at ? "Email verified" : "Verification pending"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Account created</dt>
          <dd>
            {auth.user?.created_at
              ? new Date(auth.user.created_at).toLocaleDateString()
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Display name</dt>
          <dd>{data?.profile.display_name || "Not set"}</dd>
        </div>
      </dl>
      {message && (
        <p role="status" className="text-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <form
        className="space-y-4 border-b border-border pb-6"
        onSubmit={(e) =>
          void perform(e, () => update({ data: { display_name: name } }), "Display name updated.")
        }
      >
        <h2 className="text-xl">My Profile</h2>
        <label className="block text-sm">
          Display name
          <input
            required
            minLength={2}
            maxLength={120}
            className="field mt-2 w-full"
            placeholder={data?.profile.display_name}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Btn disabled={busy}>Save Profile</Btn>
      </form>
      <form
        className="space-y-4 border-b border-border pb-6"
        onSubmit={(e) =>
          void perform(
            e,
            async () => {
              const { error: e } = await supabase.auth.updateUser(
                { email },
                { emailRedirectTo: `${window.location.origin}/auth/callback` },
              );
              if (e) throw new Error("Email change could not be requested.");
            },
            "Check your email to confirm the address change.",
          )
        }
      >
        <h2 className="text-xl">Change Email</h2>
        <label className="block text-sm">
          New email address
          <input
            required
            type="email"
            className="field mt-2 w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <Btn disabled={busy}>Request Email Change</Btn>
      </form>
      <form
        className="space-y-4 border-b border-border pb-6"
        onSubmit={(e) =>
          void perform(
            e,
            async () => {
              passwordSchema.parse(password);
              const { error: e } = await supabase.auth.updateUser({
                password,
                current_password: current,
              });
              if (e)
                throw new Error(
                  "Password change failed. Check your current password and use a strong new password.",
                );
              setCurrent("");
              setPassword("");
            },
            "Password updated.",
          )
        }
      >
        <h2 className="text-xl">Change Password</h2>
        <label className="block text-sm">
          Current password
          <input
            required
            type="password"
            autoComplete="current-password"
            className="field mt-2 w-full"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          New password
          <input
            required
            type="password"
            autoComplete="new-password"
            className="field mt-2 w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Use at least 10 characters, uppercase, lowercase and a number.
        </p>
        <Btn disabled={busy}>Change Password</Btn>
      </form>
      <form
        className="space-y-4"
        onSubmit={(e) =>
          void perform(
            e,
            () => deletion({ data: { confirmation: confirmation as "DELETE" } }),
            "Deletion request submitted. Your account has not been automatically deleted.",
          )
        }
      >
        <h2 className="text-xl">Request Account Deletion</h2>
        <p className="text-sm text-muted-foreground">
          This creates a private request for operational review. Retention requirements and the
          handling process await legal review; no completion date is promised.
        </p>
        {data?.deletion ? (
          <p className="text-warning">Request status: {data.deletion.status}</p>
        ) : (
          <>
            <label className="block text-sm">
              Type DELETE to confirm
              <input
                required
                pattern="DELETE"
                className="field mt-2 w-full"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <Btn variant="danger" disabled={busy || confirmation !== "DELETE"}>
              Submit Deletion Request
            </Btn>
          </>
        )}
      </form>
      <Btn className="mt-6" onClick={() => void auth.logout()}>
        Log Out
      </Btn>
    </div>
  );
}
