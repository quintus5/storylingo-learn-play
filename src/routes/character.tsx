import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CharacterSprite } from "@/components/CharacterSprite";
import { CoinPurse } from "@/components/CoinPurse";
import {
  DEFAULT_LOOK,
  EYES,
  HAIRS,
  HAIR_COLORS,
  HATS,
  OUTFITS,
  PETS,
  SKINS,
} from "@/lib/character";
import type { CharacterLook, Option } from "@/lib/character";
import { owns, useProgress } from "@/lib/progress";

export const Route = createFileRoute("/character")({
  head: () => ({
    meta: [
      { title: "My character — StoryLingo" },
      {
        name: "description",
        content:
          "Build your own story buddy: choose a face, hair and outfit, then see them appear inside your picture books.",
      },
      { property: "og:title", content: "My character — StoryLingo" },
      {
        property: "og:description",
        content: "Design a story buddy who joins the pictures in every new StoryLingo book.",
      },
    ],
  }),
  component: CharacterPage,
});

function Row({
  label,
  options,
  value,
  onPick,
  swatch,
  lockedIds,
  clearable,
}: {
  label: string;
  options: Option[];
  value: string | null;
  onPick: (id: string | null) => void;
  swatch?: boolean;
  lockedIds?: string[];
  clearable?: boolean;
}) {
  return (
    <div className="mt-5">
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {clearable && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className={`press rounded-2xl border px-3 py-2 text-sm ${
              value === null ? "border-primary bg-primary/15 font-bold" : "border-border bg-card"
            }`}
          >
            None
          </button>
        )}
        {options.map((o) => {
          const locked = lockedIds?.includes(o.id) ?? false;
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={locked}
              onClick={() => onPick(o.id)}
              className={`press inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
                active ? "border-primary bg-primary/15 font-bold" : "border-border bg-card"
              } ${locked ? "opacity-40" : ""}`}
            >
              {swatch && (
                <span
                  className="h-4 w-4 rounded-full border border-border"
                  style={{ background: o.color }}
                  aria-hidden
                />
              )}
              {o.label}
              {locked && <span aria-hidden>🔒</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CharacterPage() {
  const { progress, saveCharacter } = useProgress();
  const navigate = useNavigate();
  const [look, setLook] = useState<CharacterLook>(DEFAULT_LOOK);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (progress.character) setLook(progress.character);
  }, [progress.character]);

  const set = <K extends keyof CharacterLook>(key: K, value: CharacterLook[K]) => {
    setLook((l) => ({ ...l, [key]: value }));
    setSaved(false);
  };

  const lockedOutfits = OUTFITS.filter(
    (o, i) => i > 1 && !owns(progress, `outfit:${o.id}`),
  ).map((o) => o.id);
  const lockedHats = HATS.filter((o) => !owns(progress, `hat:${o.id}`)).map((o) => o.id);
  const lockedPets = PETS.filter((o) => !owns(progress, `pet:${o.id}`)).map((o) => o.id);

  return (
    <AppShell title="My character" back={{ to: "/" }} right={<CoinPurse />}>
      <div className="mx-auto max-w-xl">
        <div className="flex items-center gap-4 rounded-3xl border border-primary/20 bg-card/70 p-5">
          <div className="animate-[float-in_0.4s_ease-out] rounded-3xl bg-secondary/50 p-2">
            <CharacterSprite look={look} size={110} />
          </div>
          <div className="min-w-0">
            <label className="text-sm font-semibold" htmlFor="buddy-name">
              Buddy name
            </label>
            <input
              id="buddy-name"
              value={look.name}
              maxLength={24}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Nong Mali"
              className="mt-2 w-full rounded-2xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Your buddy is painted into the pictures of every new book you make.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-border bg-card p-5">
          <Row label="Skin" options={SKINS} value={look.skin} onPick={(id) => set("skin", id!)} swatch />
          <Row label="Hair" options={HAIRS} value={look.hair} onPick={(id) => set("hair", id!)} />
          <Row
            label="Hair colour"
            options={HAIR_COLORS}
            value={look.hairColor}
            onPick={(id) => set("hairColor", id!)}
            swatch
          />
          <Row label="Eyes" options={EYES} value={look.eyes} onPick={(id) => set("eyes", id!)} />
          <Row
            label="Outfit"
            options={OUTFITS}
            value={look.outfit}
            onPick={(id) => set("outfit", id!)}
            lockedIds={lockedOutfits}
          />
          <Row
            label="Hat"
            options={HATS}
            value={look.hat}
            onPick={(id) => set("hat", id)}
            lockedIds={lockedHats}
            clearable
          />
          <Row
            label="Pet friend"
            options={PETS}
            value={look.pet}
            onPick={(id) => set("pet", id)}
            lockedIds={lockedPets}
            clearable
          />
          <p className="mt-4 text-xs text-muted-foreground">
            Locked items 🔒 can be bought in the shop with coins you earn from reading and quizzes.
          </p>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              saveCharacter(look);
              setSaved(true);
            }}
            className="press flex-1 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground"
          >
            {saved ? (
              <span className="inline-flex items-center gap-2">
                <Check className="h-4 w-4" /> Saved!
              </span>
            ) : (
              "Save my buddy"
            )}
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: "/shop" })}
            className="press rounded-2xl bg-secondary px-5 py-3 font-bold text-secondary-foreground"
          >
            Shop
          </button>
        </div>
      </div>
    </AppShell>
  );
}
