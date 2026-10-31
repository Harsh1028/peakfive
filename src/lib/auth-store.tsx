import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const Auth = createContext<{
  user: User | null;
  loading: boolean;
  identity: number;
  logout: () => Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState(0);
  const lastUser = useRef<string | null>(null);
  const query = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) {
        setUser(data.user);
        lastUser.current = data.user?.id ?? null;
        setLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        setLoading(false);
        return;
      }
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED", "PASSWORD_RECOVERY"].includes(event)) return;
      setUser(session?.user ?? null);
      setLoading(false);
      if (
        (event === "SIGNED_IN" || event === "SIGNED_OUT") &&
        lastUser.current !== (session?.user.id ?? null)
      ) {
        lastUser.current = session?.user.id ?? null;
        void query.cancelQueries();
        query.clear();
        setIdentity((n) => n + 1);
      }
      void router.invalidate();
      if (event === "SIGNED_OUT") void router.navigate({ to: "/login", replace: true });
      else if (event === "USER_UPDATED") void query.invalidateQueries();
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [query, router]);
  const logout = async () => {
    await query.cancelQueries();
    query.clear();
    await supabase.auth.signOut();
    await router.navigate({ to: "/login", replace: true });
  };
  return <Auth.Provider value={{ user, loading, identity, logout }}>{children}</Auth.Provider>;
}
export function useAuth() {
  const value = useContext(Auth);
  if (!value) throw new Error("Auth provider missing");
  return value;
}
