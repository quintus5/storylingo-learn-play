import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

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
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          {back ? (
            <Link
              to={back.to}
              params={back.params}
              className="press inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          ) : (
            <span className="text-2xl" aria-hidden>
              🌙
            </span>
          )}
          <h1 className="flex-1 truncate text-lg font-bold sm:text-xl">
            {title ?? "StoryLingo"}
          </h1>
          {right}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-5">{children}</main>
    </div>
  );
}
