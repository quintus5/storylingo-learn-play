import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";

/**
 * The bilingual fallback a route shows from `errorComponent` or
 * `notFoundComponent`.
 *
 * It exists as a named component so the language hook is legal: called inside
 * the bare arrow functions those route options used to hold, `useT` broke the
 * rules of hooks and only worked by accident of how the router renders them.
 */
export function RouteMessage({
  en,
  th,
  back,
}: {
  en: string;
  th: string;
  back?: { to: string; params?: Record<string, string> };
}) {
  const t = useT();
  return (
    <AppShell back={back}>
      <p className="text-muted-foreground">{t(en, th)}</p>
    </AppShell>
  );
}
