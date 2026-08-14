import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Ctx = {
  session: Session | null;
  user: User | null;
  /** False until the stored session has been read, so the UI can stay quiet. */
  loaded: boolean;
  signInWithGoogle: (redirectPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

/**
 * Who is using the app.
 *
 * Signing in is a grown-up's job — a child reads the shelf without ever seeing
 * this — so the only provider offered is Google, which most parents already
 * have on the phone they are holding.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Always start signed out so the server and the first client render agree;
  // the stored session arrives a moment later.
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // onAuthStateChange also fires for the OAuth redirect coming back, so the
    // sign-in round trip needs no separate callback route.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (cancelled) return;
      setSession(next);
      setLoaded(true);
    });

    void supabase.auth.getSession().then(({ data: { session: stored } }) => {
      if (cancelled) return;
      setSession(stored);
      setLoaded(true);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (redirectPath?: string) => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}${redirectPath ?? "/"}` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      session,
      user: session?.user ?? null,
      loaded,
      signInWithGoogle,
      signOut,
    }),
    [session, loaded, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (ctx) return ctx;
  // Rendered outside the provider, e.g. from an error boundary.
  return {
    session: null,
    user: null,
    loaded: false,
    signInWithGoogle: async () => {},
    signOut: async () => {},
  };
}

/** A short name for the header, falling back through what Google gives us. */
export function displayName(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  return (meta?.full_name || meta?.name || user.email || "").split(" ")[0] ?? "";
}
