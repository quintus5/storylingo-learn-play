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
import { useT } from "@/lib/i18n";

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
  t,
}: {
  label: string;
  options: Option[];
  value: string | null;
  onPick: (id: string | null) => void;
  swatch?: boolean;
  lockedIds?: string[];
  clearable?: boolean;
  t: (en: string, th: string) => string;
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
            {t("None", "ไม่มี")}
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
              {t(o.label, o.labelTh ?? o.label)}
              {locked && <span aria-hidden>🔒</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CharacterPage() {
  const t = useT();
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
    <AppShell title={t("My character", "ตัวละครของฉัน")} back={{ to: "/" }} right={<CoinPurse />}>
      <div className="mx-auto max-w-xl">
        <div className="flex items-center gap-4 rounded-3xl border border-primary/20 bg-card/70 p-5">
          <div className="animate-[float-in_0.4s_ease-out] rounded-3xl bg-secondary/50 p-2">
            <CharacterSprite look={look} size={140} />
          </div>
          <div className="min-w-0">
            <label className="text-sm font-semibold" htmlFor="buddy-name">
              {t("Buddy name", "ชื่อเพื่อนคู่นิทาน")}
            </label>
            <input
              id="buddy-name"
              value={look.name}
              maxLength={24}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t("Nong Mali", "น้องมะลิ")}
              className="mt-2 w-full rounded-2xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Your buddy is painted into the pictures of every new book you make.",
                "เพื่อนคู่นิทานของคุณจะปรากฏในภาพของหนังสือทุกเล่มที่สร้างใหม่",
              )}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-border bg-card p-5">
          <Row t={t} label={t("Skin", "สีผิว")} options={SKINS} value={look.skin} onPick={(id) => set("skin", id!)} swatch />
          <Row t={t} label={t("Hair", "ทรงผม")} options={HAIRS} value={look.hair} onPick={(id) => set("hair", id!)} />
          <Row
            t={t}
            label={t("Hair colour", "สีผม")}
            options={HAIR_COLORS}
            value={look.hairColor}
            onPick={(id) => set("hairColor", id!)}
            swatch
          />
          <Row t={t} label={t("Eyes", "ดวงตา")} options={EYES} value={look.eyes} onPick={(id) => set("eyes", id!)} />
          <Row
            t={t}
            label={t("Outfit", "ชุด")}
            options={OUTFITS}
            value={look.outfit}
            onPick={(id) => set("outfit", id!)}
            lockedIds={lockedOutfits}
          />
          <Row
            t={t}
            label={t("Hat", "หมวก")}
            options={HATS}
            value={look.hat}
            onPick={(id) => set("hat", id)}
            lockedIds={lockedHats}
            clearable
          />
          <Row
            t={t}
            label={t("Pet friend", "สัตว์เลี้ยงคู่ใจ")}
            options={PETS}
            value={look.pet}
            onPick={(id) => set("pet", id)}
            lockedIds={lockedPets}
            clearable
          />
          <p className="mt-4 text-xs text-muted-foreground">
            {t(
              "Locked items 🔒 can be bought in the shop with coins you earn from reading and quizzes.",
              "ไอเทมที่ล็อก 🔒 ซื้อได้ที่ร้านค้าด้วยเหรียญที่สะสมจากการอ่านและเล่นแบบทดสอบ",
            )}
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
                <Check className="h-4 w-4" /> {t("Saved!", "บันทึกแล้ว!")}
              </span>
            ) : (
              t("Save my buddy", "บันทึกเพื่อนของฉัน")
            )}
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: "/shop" })}
            className="press rounded-2xl bg-secondary px-5 py-3 font-bold text-secondary-foreground"
          >
            {t("Shop", "ร้านค้า")}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
