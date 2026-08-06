import { useLang } from "@/lib/i18n";

/** Small ไทย / EN switch shown in the app header. */
export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLang();

  return (
    <div
      className="inline-flex items-center rounded-full bg-secondary p-1 text-xs font-extrabold text-secondary-foreground"
      role="group"
      aria-label="Language / ภาษา"
    >
      {(["th", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`press rounded-full px-2.5 py-1 transition-colors ${
            lang === l ? "bg-primary text-primary-foreground" : "opacity-70"
          }`}
        >
          {l === "th" ? (compact ? "ไทย" : "ไทย") : "EN"}
        </button>
      ))}
    </div>
  );
}
