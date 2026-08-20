import { useState } from "react";
import { Loader2, LogIn, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/** Google's mark, inlined so the button needs no third-party request. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8a10 10 0 0 1-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z"
      />
      <path
        fill="#34A853"
        d="M24 46c6 0 11-2 14.5-5.2l-7.1-5.5A13.6 13.6 0 0 1 24 37.4c-5.8 0-10.7-3.9-12.4-9.1H4.3v5.7A22 22 0 0 0 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.6 28.3a13.2 13.2 0 0 1 0-8.6v-5.7H4.3a22 22 0 0 0 0 20l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.6c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4 30 2 24 2A22 22 0 0 0 4.3 14l7.3 5.7c1.7-5.2 6.6-9.1 12.4-9.1z"
      />
    </svg>
  );
}

/**
 * The sign-in prompt shown wherever an account is needed.
 *
 * Making a book is the only thing that asks for one: reading the shelf never
 * does, so a child can be handed the app and simply read.
 */
export function SignInPanel({
  title,
  reason,
  redirectPath,
}: {
  title?: string;
  reason?: string;
  redirectPath?: string;
}) {
  const t = useT();
  const { signInWithGoogle, continueAsGuest } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-primary/25 bg-card p-6 text-center">
      <p className="text-4xl" aria-hidden>
        🔑
      </p>
      <h2 className="mt-3 text-xl font-extrabold">
        {title ?? t("A grown-up signs in first", "ให้ผู้ใหญ่เข้าสู่ระบบก่อน")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {reason ??
          t(
            "Making a book needs an account, so your books are kept safely and stay yours.",
            "การสร้างหนังสือต้องมีบัญชี เพื่อเก็บหนังสือของคุณไว้อย่างปลอดภัยและเป็นของคุณ",
          )}
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signInWithGoogle(redirectPath);
          } catch (err) {
            // Google may not be configured yet; never let a raw provider
            // error take over the page — offer the guest path instead.
            console.error(err);
            setError(
              t(
                "Google sign-in isn't set up yet — continue as guest for now.",
                "ยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google — ใช้งานแบบผู้เยี่ยมชมไปก่อนได้เลย",
              ),
            );
            setBusy(false);
          }
        }}
        className="press mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-background px-5 py-4 font-bold text-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
        {t("Continue with Google", "ดำเนินการต่อด้วย Google")}
      </button>

      <button
        type="button"
        onClick={() => continueAsGuest()}
        className="press mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-5 py-4 font-bold text-secondary-foreground"
      >
        <UserRound className="h-5 w-5" />
        {t("Continue as guest", "ใช้งานแบบผู้เยี่ยมชม")}
      </button>

      <p className="mt-3 text-xs text-muted-foreground">
        {t(
          "Guest progress is kept on this device only. Sign in later to keep it safe.",
          "ความคืบหน้าแบบผู้เยี่ยมชมจะเก็บไว้ในเครื่องนี้เท่านั้น เข้าสู่ระบบภายหลังเพื่อเก็บไว้อย่างปลอดภัย",
        )}
      </p>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}


/** Header control: who is signed in, and the way out. */
export function AccountButton() {
  const t = useT();
  const { user, loaded, isGuest, signOut } = useAuth();
  if (!loaded || !user) return null;
  return (
    <div className="flex items-center gap-1.5">
      {isGuest && (
        <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-bold text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" />
          {t("Guest", "ผู้เยี่ยมชม")}
        </span>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        title={user.email ?? undefined}
        aria-label={isGuest ? t("Leave guest mode", "ออกจากโหมดผู้เยี่ยมชม") : t("Sign out", "ออกจากระบบ")}
        className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-bold text-secondary-foreground"
      >
        <LogIn className="h-4 w-4 rotate-180" />
        <span className="hidden sm:inline">
          {isGuest ? t("Exit guest", "ออกจากโหมดผู้เยี่ยมชม") : t("Sign out", "ออกจากระบบ")}
        </span>
      </button>
    </div>
  );
}

