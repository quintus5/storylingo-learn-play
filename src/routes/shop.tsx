import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CoinPurse } from "@/components/CoinPurse";
import { CharacterSprite } from "@/components/CharacterSprite";
import { DEFAULT_LOOK, HATS, OUTFITS, PETS } from "@/lib/character";
import type { Option } from "@/lib/character";
import { PRICES, REWARDS, STREAK_BONUS } from "@/lib/economy";
import { owns, useProgress } from "@/lib/progress";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Coin shop — StoryLingo" },
      {
        name: "description",
        content:
          "Spend the coins you earn from reading and quizzes on outfits, hats and pet friends for your story buddy.",
      },
      { property: "og:title", content: "Coin shop — StoryLingo" },
      {
        property: "og:description",
        content: "Outfits, hats and pets for your StoryLingo story buddy.",
      },
    ],
  }),
  component: ShopPage,
});

type Shelf = { title: string; titleTh: string; kind: "outfit" | "hat" | "pet"; price: number; items: Option[] };

const SHELVES: Shelf[] = [
  // The first two outfits are free starter clothes.
  { title: "Outfits", titleTh: "ชุด", kind: "outfit", price: PRICES.outfit, items: OUTFITS.slice(2) },
  { title: "Hats", titleTh: "หมวก", kind: "hat", price: PRICES.hat, items: HATS },
  { title: "Pet friends", titleTh: "สัตว์เลี้ยงคู่ใจ", kind: "pet", price: PRICES.pet, items: PETS },
];

function ShopPage() {
  const t = useT();
  const { progress, buyItem } = useProgress();
  const [shake, setShake] = useState<string | null>(null);
  const look = progress.character ?? DEFAULT_LOOK;

  function buy(id: string, price: number) {
    if (!buyItem(id, price)) {
      setShake(id);
      setTimeout(() => setShake(null), 500);
    }
  }

  return (
    <AppShell title={t("Coin shop", "ร้านค้าเหรียญ")} back={{ to: "/" }} right={<CoinPurse />}>
      <div className="mx-auto max-w-3xl">
        <section className="flex items-center gap-4 rounded-3xl border border-primary/20 bg-card/70 p-5">
          <CharacterSprite look={look} size={92} />
          <div>
            <h2 className="text-xl font-extrabold">
              {look.name
                ? t(`${look.name}'s wardrobe`, `ตู้เสื้อผ้าของ${look.name}`)
                : t("Your buddy's wardrobe", "ตู้เสื้อผ้าของเพื่อนคุณ")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                `Earn 🪙 ${REWARDS.star} per quiz star, 🪙 ${REWARDS.chapterRead} for finishing a chapter, 🪙 ${REWARDS.newWord} for each new word you tap, and 🪙 ${STREAK_BONUS} for reading on a new day.`,
                `รับ 🪙 ${REWARDS.star} ต่อดาวในแบบทดสอบ, 🪙 ${REWARDS.chapterRead} เมื่ออ่านจบบท, 🪙 ${REWARDS.newWord} ต่อคำศัพท์ใหม่ที่แตะเปิด และ 🪙 ${STREAK_BONUS} เมื่ออ่านต่อเนื่องในวันใหม่`,
              )}
            </p>
            <Link
              to="/character"
              className="press mt-3 inline-flex rounded-2xl bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground"
            >
              {t("Dress up my buddy", "แต่งตัวให้เพื่อนของฉัน")}
            </Link>
          </div>
        </section>

        {SHELVES.map((shelf) => (
          <section key={shelf.kind} className="mt-7">
            <h3 className="text-lg font-extrabold">{t(shelf.title, shelf.titleTh)}</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shelf.items.map((item) => {
                const id = `${shelf.kind}:${item.id}`;
                const bought = owns(progress, id);
                const preview =
                  shelf.kind === "outfit"
                    ? { ...look, outfit: item.id }
                    : shelf.kind === "hat"
                      ? { ...look, hat: item.id }
                      : { ...look, pet: item.id };
                return (
                  <div
                    key={id}
                    className={`rounded-3xl border border-border bg-card p-3 text-center ${
                      shake === id ? "animate-[shake_0.45s_ease-in-out]" : ""
                    }`}
                  >
                    <div className="mx-auto w-fit rounded-2xl bg-secondary/40 p-1">
                      <CharacterSprite look={preview} size={78} />
                    </div>
                    <p className="mt-2 text-sm font-bold">{t(item.label, item.labelTh ?? item.label)}</p>
                    <button
                      type="button"
                      disabled={bought}
                      onClick={() => buy(id, shelf.price)}
                      className={`press mt-2 w-full rounded-2xl px-3 py-2 text-sm font-bold ${
                        bought
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {bought ? t("Owned ✓", "มีแล้ว ✓") : `🪙 ${shelf.price}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <p className="mt-8 rounded-3xl bg-secondary/40 p-4 text-sm text-muted-foreground">
          {t(
            `Coins are just for fun — they are saved on this device and never cost real money. You can also spend 🪙 ${PRICES.chapter} to open a locked chapter early, or 🪙 ${PRICES.book} to make a brand new book.`,
            `เหรียญมีไว้เพื่อความสนุก — บันทึกไว้ในเครื่องนี้และไม่ต้องเสียเงินจริง คุณยังใช้ 🪙 ${PRICES.chapter} เพื่อปลดล็อกบทก่อนเวลา หรือ 🪙 ${PRICES.book} เพื่อสร้างหนังสือเล่มใหม่ได้`,
          )}
        </p>
      </div>
    </AppShell>
  );
}
