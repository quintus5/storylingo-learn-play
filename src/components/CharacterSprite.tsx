import type { CharacterLook } from "@/lib/character";
import { hairColor, skinColor } from "@/lib/character";

const OUTFIT_COLORS: Record<string, [string, string]> = {
  tunic: ["#c9a06a", "#a87f4c"],
  explorer: ["#6f8f5f", "#4d6742"],
  hanfu: ["#c4576b", "#9c3d51"],
  knight: ["#9aa7b8", "#6d7a8c"],
  stargown: ["#3b4a8c", "#26306a"],
  raincoat: ["#e2b13c", "#c08f22"],
};

const HAT_COLORS: Record<string, string> = {
  straw: "#dbb26a",
  crown: "#e7c55b",
  wizard: "#4a3b8c",
  beanie: "#c4576b",
};

const PET_COLORS: Record<string, string> = {
  cat: "#c9955f",
  fox: "#d97742",
  bird: "#5b8bd0",
  dragon: "#6fb37a",
};

/**
 * The child's own character, drawn as a friendly little sprite so it shows up
 * instantly everywhere in the app (the story pictures are painted separately).
 */
export function CharacterSprite({
  look,
  size = 96,
  className = "",
}: {
  look: CharacterLook;
  size?: number;
  className?: string;
}) {
  const skin = skinColor(look);
  const hair = hairColor(look);
  const [coat, shade] = OUTFIT_COLORS[look.outfit] ?? OUTFIT_COLORS["tunic"]!;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={look.name ? `${look.name}, your story character` : "Your story character"}
    >
      {/* body */}
      <path d={`M28 96 Q28 66 50 66 Q72 66 72 96 Z`} fill={coat} />
      <path d={`M50 66 Q72 66 72 96 L58 96 Q60 76 50 66 Z`} fill={shade} />
      {/* arms */}
      <circle cx="27" cy="76" r="6" fill={skin} />
      <circle cx="73" cy="76" r="6" fill={skin} />
      {/* head */}
      <circle cx="50" cy="42" r="22" fill={skin} />
      {/* hair back */}
      {look.hair === "long" && <path d="M25 40 Q26 78 34 80 L34 42 Z M75 40 Q74 78 66 80 L66 42 Z" fill={hair} />}
      {look.hair === "curly" && (
        <g fill={hair}>
          <circle cx="32" cy="30" r="11" />
          <circle cx="50" cy="22" r="12" />
          <circle cx="68" cy="30" r="11" />
        </g>
      )}
      {look.hair === "buns" && (
        <g fill={hair}>
          <circle cx="26" cy="27" r="9" />
          <circle cx="74" cy="27" r="9" />
        </g>
      )}
      {/* hair front */}
      <path
        d={
          look.hair === "bob"
            ? "M28 44 Q28 18 50 18 Q72 18 72 44 Q72 30 50 34 Q28 30 28 44 Z"
            : "M29 40 Q30 20 50 20 Q70 20 71 40 Q64 28 50 30 Q36 28 29 40 Z"
        }
        fill={hair}
      />
      {/* eyes */}
      {look.eyes === "happy" ? (
        <g stroke="#2b2233" strokeWidth="2.5" fill="none" strokeLinecap="round">
          <path d="M40 44 q4 -4 8 0" />
          <path d="M52 44 q4 -4 8 0" />
        </g>
      ) : look.eyes === "sleepy" ? (
        <g stroke="#2b2233" strokeWidth="2.5" fill="none" strokeLinecap="round">
          <path d="M40 45 q4 3 8 0" />
          <path d="M52 45 q4 3 8 0" />
        </g>
      ) : (
        <g fill="#2b2233">
          <circle cx="43" cy="44" r={look.eyes === "sparkle" ? 4.5 : 3.5} />
          <circle cx="57" cy="44" r={look.eyes === "sparkle" ? 4.5 : 3.5} />
          {look.eyes === "sparkle" && (
            <g fill="#fff">
              <circle cx="44.6" cy="42.4" r="1.5" />
              <circle cx="58.6" cy="42.4" r="1.5" />
            </g>
          )}
        </g>
      )}
      {/* smile */}
      <path d="M45 53 q5 5 10 0" stroke="#2b2233" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* hat */}
      {look.hat === "straw" && (
        <g fill={HAT_COLORS["straw"]}>
          <ellipse cx="50" cy="26" rx="32" ry="7" />
          <path d="M34 26 Q36 8 50 8 Q64 8 66 26 Z" />
        </g>
      )}
      {look.hat === "crown" && (
        <path d="M32 24 L38 10 L44 20 L50 8 L56 20 L62 10 L68 24 Z" fill={HAT_COLORS["crown"]} />
      )}
      {look.hat === "wizard" && (
        <g fill={HAT_COLORS["wizard"]}>
          <path d="M30 26 L50 -2 L70 26 Z" />
          <ellipse cx="50" cy="26" rx="26" ry="5" />
          <g fill="#e7c55b">
            <circle cx="50" cy="14" r="2" />
            <circle cx="44" cy="21" r="1.5" />
            <circle cx="57" cy="20" r="1.5" />
          </g>
        </g>
      )}
      {look.hat === "beanie" && (
        <g fill={HAT_COLORS["beanie"]}>
          <path d="M28 28 Q28 8 50 8 Q72 8 72 28 Z" />
          <rect x="26" y="26" width="48" height="7" rx="3.5" />
        </g>
      )}
      {/* pet */}
      {look.pet && (
        <g>
          <circle cx="84" cy="86" r="10" fill={PET_COLORS[look.pet] ?? "#c9955f"} />
          <circle cx="80.5" cy="84" r="1.6" fill="#2b2233" />
          <circle cx="87.5" cy="84" r="1.6" fill="#2b2233" />
          {look.pet === "bird" ? (
            <path d="M74 84 q-6 -4 -2 8 z" fill={PET_COLORS["bird"]} />
          ) : look.pet === "dragon" ? (
            <path d="M78 76 l3 -6 3 6 z M86 76 l3 -6 3 6 z" fill="#4f8f5c" />
          ) : (
            <path d="M78 78 l-2 -7 6 4 z M90 78 l2 -7 -6 4 z" fill={PET_COLORS[look.pet] ?? "#c9955f"} />
          )}
        </g>
      )}
    </svg>
  );
}
