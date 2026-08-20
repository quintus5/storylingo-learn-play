import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { LangToggle } from "@/components/LangToggle";
import { toggleDevMode, useDevMode } from "@/lib/dev-mode";
import { AUTHORING_ENABLED } from "@/lib/authoring";


export function AppShell({
  title,
  back,
  right,
  children,
}: {
  title?: string;
  back?: { to: string; params?: Record<string, string> };
  right?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const dev = useDevMode();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          {back ? (
            <Link
              to={back.to}
              params={back.params}
              className="press inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              aria-label={t("Go back", "ย้อนกลับ")}
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          ) : (
            <span
              onDoubleClick={() => {
                // No hidden operator menu in the app children install.
                if (AUTHORING_ENABLED) toggleDevMode();
              }}
              title={dev ? "Developer mode on" : undefined}
              className={`cursor-default select-none text-2xl transition-opacity ${dev ? "opacity-60" : ""}`}
              aria-hidden
            >
              🌙
            </span>
          )}

          <h1 className="flex-1 truncate text-lg font-bold sm:text-xl">
            {title ?? t("StoryLingo", "StoryLingo")}
          </h1>
          <LangToggle />
          {right}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-5">{children}</main>
    </div>
  );
}
