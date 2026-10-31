import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth-store";
import { passwordSchema, signupSchema, safeDestination } from "@/lib/account";
import { Btn } from "@/components/pf/ui";

export function AuthForm({
  mode,
  redirect,
}: {
  mode: "login" | "signup" | "forgot" | "reset";
  redirect?: string;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (mode === "reset") {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const query = new URLSearchParams(window.location.search);
      if (params.get("type") === "recovery" && !params.has("error")) setRecovery(true);
      if (query.get("type") === "recovery" && query.has("code"))
        void supabase.auth
          .exchangeCodeForSession(query.get("code") ?? "")
          .then(({ error: e }) => setRecovery(!e));
    }
  }, [mode]);
  useEffect(() => {
    if (auth.user && (mode === "login" || mode === "signup") && !message)
      void navigate({ to: safeDestination(redirect) });
  }, [auth.user, mode, message, navigate, redirect]);
  const title =
    mode === "signup"
      ? "Create Your PEAKFIVE Account"
      : mode === "login"
        ? "Welcome Back to PEAKFIVE"
        : mode === "forgot"
          ? "Reset Your Password"
          : "Choose a New Password";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const parsed = signupSchema.safeParse({ name, email, password, confirm, accepted });
        if (!parsed.success)
          throw new Error(parsed.error.issues[0]?.message ?? "Check the registration fields.");
        const { data, error: e } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { full_name: name },
          },
        });
        if (e)
          throw new Error(
            e.code === "weak_password"
              ? "Choose a stronger password that has not appeared in a data breach."
              : "Account creation could not be completed. Check your details or try again later.",
          );
        if (!data.session) setMessage("Check your email to verify your account before signing in.");
      }
      if (mode === "login") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e)
          throw new Error(
            e.code === "email_not_confirmed"
              ? "Verify your email before signing in."
              : "Sign-in failed. Check your email and password, or try again later.",
          );
        await navigate({ to: safeDestination(redirect) });
      }
      if (mode === "forgot") {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (e)
          throw new Error("The request could not be completed right now. Please try again later.");
        setMessage("If an eligible account uses this email, a password-reset link will be sent.");
      }
      if (mode === "reset") {
        if (!recovery || !auth.user)
          throw new Error(
            "This recovery link is invalid, expired or already used. Request a new link.",
          );
        passwordSchema.parse(password);
        if (password !== confirm) throw new Error("Passwords do not match.");
        const { error: e } = await supabase.auth.updateUser({ password });
        if (e)
          throw new Error("Password reset failed. Request a new link if this one has expired.");
        setRecovery(false);
        setMessage("Your password was updated. You can now sign in.");
        await supabase.auth.signOut();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };
  const oauth = async (provider: "google" | "lovable") => {
    setBusy(true);
    setError("");
    try {
      sessionStorage.setItem("peakfive.redirect", safeDestination(redirect));
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/auth/callback`,
      });
      if (result.error) throw new Error("Social sign-in could not be completed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <p className="text-xs uppercase tracking-widest text-primary">Your engineering workspace</p>
      <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted-foreground">
        {mode === "signup"
          ? "Access intelligent scheduling tools and manage your optimization scenarios."
          : mode === "login"
            ? "Sign in to access your optimization workspace."
            : "Use the secure account recovery flow."}
      </p>
      {message ? (
        <div role="status" className="my-8 border border-success/40 bg-success/10 p-5 text-success">
          {message}
          <Link to="/login" className="mt-4 block underline">
            Return to Log In
          </Link>
        </div>
      ) : (
        <form className="mt-8 space-y-5" onSubmit={submit}>
          {mode === "signup" && (
            <label className="block text-sm">
              Full Name
              <input
                required
                autoComplete="name"
                className="field mt-2 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {mode !== "reset" && (
            <label className="block text-sm">
              Email Address
              <input
                type="email"
                required
                autoComplete="email"
                className="field mt-2 w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label className="block text-sm">
              Password
              <div className="mt-2 flex gap-2">
                <input
                  type={show ? "text" : "password"}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="field w-full"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Btn
                  type="button"
                  size="icon"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Btn>
              </div>
            </label>
          )}
          {(mode === "signup" || mode === "reset") && (
            <>
              <p className="text-xs text-muted-foreground">
                At least 10 characters, including uppercase, lowercase and a number. Avoid reused or
                compromised passwords.
              </p>
              <label className="block text-sm">
                Confirm Password
                <input
                  type={show ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  className="field mt-2 w-full"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            </>
          )}
          {mode === "signup" && (
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1"
              />
              <span>
                I acknowledge the{" "}
                <Link to="/privacy" className="text-primary underline">
                  draft Privacy Policy
                </Link>{" "}
                and{" "}
                <Link to="/terms" className="text-primary underline">
                  draft Terms
                </Link>
                , pending legal review.
              </span>
            </label>
          )}
          {mode === "reset" && !recovery && (
            <p className="text-warning">
              A valid recovery link is required.{" "}
              <Link to="/forgot-password" className="underline">
                Request a new link
              </Link>
              .
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Btn
            variant="primary"
            className="w-full"
            disabled={busy || (mode === "reset" && (!recovery || !auth.user))}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signup"
              ? "Create Account"
              : mode === "login"
                ? "Sign In"
                : mode === "forgot"
                  ? "Send Reset Link"
                  : "Update Password"}
          </Btn>
          {mode === "login" && (
            <Link to="/forgot-password" className="block text-right text-sm text-primary">
              Forgot Password?
            </Link>
          )}
          {(mode === "login" || mode === "signup") && (
            <>
              <div className="border-t border-border pt-5 text-center text-xs text-muted-foreground">
                Or continue with
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Btn
                  type="button"
                  disabled={busy || (mode === "signup" && !accepted)}
                  onClick={() => void oauth("google")}
                >
                  Google
                </Btn>
                <Btn
                  type="button"
                  disabled={busy || (mode === "signup" && !accepted)}
                  onClick={() => void oauth("lovable")}
                >
                  Lovable
                </Btn>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {mode === "login" ? "New to PEAKFIVE?" : "Already have an account?"}{" "}
                <Link to={mode === "login" ? "/signup" : "/login"} className="text-primary">
                  {mode === "login" ? "Create Account" : "Log In"}
                </Link>
              </p>
            </>
          )}
        </form>
      )}
    </div>
  );
}
