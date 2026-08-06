/**
 * The reader's own character: a small look built from picked options.
 * Rendered as layered SVG so it appears instantly and works offline, and
 * described in one English sentence when a book's pictures are painted.
 */

export type CharacterLook = {
  name: string;
  skin: string;
  hair: string;
  hairColor: string;
  eyes: string;
  outfit: string;
  hat: string | null;
  pet: string | null;
};

export type Option = {
  id: string;
  label: string;
  /** Thai label shown to Thai-speaking users. */
  labelTh?: string;
  /** Words used when describing the character to the illustrator. */
  words: string;
  /** Swatch colour for palette options. */
  color?: string;
};

export const SKINS: Option[] = [
  { id: "sand", label: "Sand", labelTh: "สีทราย", words: "light warm skin", color: "#f3d3ac" },
  { id: "honey", label: "Honey", labelTh: "สีน้ำผึ้ง", words: "golden tan skin", color: "#e0ab72" },
  { id: "clay", label: "Clay", labelTh: "สีดินเผา", words: "warm brown skin", color: "#b97a4d" },
  { id: "cocoa", label: "Cocoa", labelTh: "สีโกโก้", words: "deep brown skin", color: "#7c4a2b" },
];

export const HAIRS: Option[] = [
  { id: "short", label: "Short", labelTh: "ผมสั้น", words: "short tidy hair" },
  { id: "bob", label: "Bob", labelTh: "ผมบ๊อบ", words: "a rounded bob haircut" },
  { id: "long", label: "Long", labelTh: "ผมยาว", words: "long flowing hair" },
  { id: "buns", label: "Two buns", labelTh: "มวยผมคู่", words: "hair tied in two round buns" },
  { id: "curly", label: "Curly", labelTh: "ผมหยิก", words: "big curly hair" },
];

export const HAIR_COLORS: Option[] = [
  { id: "black", label: "Black", labelTh: "สีดำ", words: "black", color: "#241d2b" },
  { id: "brown", label: "Brown", labelTh: "สีน้ำตาล", words: "chestnut brown", color: "#5c3a22" },
  { id: "gold", label: "Gold", labelTh: "สีทอง", words: "golden blonde", color: "#d8a44a" },
  { id: "red", label: "Red", labelTh: "สีแดง", words: "copper red", color: "#a8452c" },
  { id: "blue", label: "Star blue", labelTh: "สีฟ้าดาว", words: "bright storybook blue", color: "#4a6fb0" },
];

export const EYES: Option[] = [
  { id: "happy", label: "Happy", labelTh: "ตายิ้ม", words: "smiling curved eyes" },
  { id: "round", label: "Round", labelTh: "ตากลม", words: "big round eyes" },
  { id: "sleepy", label: "Sleepy", labelTh: "ตาง่วง", words: "soft sleepy eyes" },
  { id: "sparkle", label: "Sparkly", labelTh: "ตาแวววาว", words: "wide sparkling eyes" },
];

/** Shop items. Outfits, hats and pets are bought with coins. */
export const OUTFITS: Option[] = [
  { id: "tunic", label: "Desert tunic", labelTh: "เสื้อคลุมทะเลทราย", words: "a simple sandy travelling tunic" },
  { id: "explorer", label: "Explorer", labelTh: "ชุดนักสำรวจ", words: "an explorer's vest with many pockets" },
  { id: "hanfu", label: "Silk hanfu", labelTh: "ชุดฮั่นฝูไหม", words: "a flowing silk hanfu robe" },
  { id: "knight", label: "Little knight", labelTh: "อัศวินตัวน้อย", words: "a small silver knight's breastplate" },
  { id: "stargown", label: "Star gown", labelTh: "ชุดราตรีดารา", words: "a midnight-blue gown covered in tiny stars" },
  { id: "raincoat", label: "Rain coat", labelTh: "เสื้อกันฝน", words: "a bright yellow raincoat" },
];

export const HATS: Option[] = [
  { id: "straw", label: "Straw hat", labelTh: "หมวกฟาง", words: "a wide straw hat" },
  { id: "crown", label: "Paper crown", labelTh: "มงกุฎกระดาษ", words: "a little golden paper crown" },
  { id: "wizard", label: "Wizard hat", labelTh: "หมวกพ่อมด", words: "a pointed star-covered wizard hat" },
  { id: "beanie", label: "Beanie", labelTh: "หมวกไหมพรม", words: "a cosy knitted beanie" },
];

export const PETS: Option[] = [
  { id: "cat", label: "Kitten", labelTh: "ลูกแมว", words: "a small kitten companion" },
  { id: "fox", label: "Fox cub", labelTh: "ลูกจิ้งจอก", words: "a little fox cub companion" },
  { id: "bird", label: "Blue bird", labelTh: "นกสีฟ้า", words: "a tiny blue bird on the shoulder" },
  { id: "dragon", label: "Baby dragon", labelTh: "ลูกมังกร", words: "a palm-sized friendly baby dragon" },
];

export const DEFAULT_LOOK: CharacterLook = {
  name: "",
  skin: "honey",
  hair: "short",
  hairColor: "black",
  eyes: "happy",
  outfit: "tunic",
  hat: null,
  pet: null,
};

function pick(list: Option[], id: string | null | undefined): Option | null {
  if (!id) return null;
  return list.find((o) => o.id === id) ?? null;
}

export function skinColor(look: CharacterLook) {
  return pick(SKINS, look.skin)?.color ?? "#e0ab72";
}

export function hairColor(look: CharacterLook) {
  return pick(HAIR_COLORS, look.hairColor)?.color ?? "#241d2b";
}

/** One English sentence describing the character for the illustrator. */
export function characterPrompt(look: CharacterLook | null | undefined): string {
  if (!look) return "";
  const parts = [
    pick(SKINS, look.skin)?.words,
    `${pick(HAIR_COLORS, look.hairColor)?.words ?? "dark"} ${pick(HAIRS, look.hair)?.words ?? "short hair"}`,
    pick(EYES, look.eyes)?.words,
    `wearing ${pick(OUTFITS, look.outfit)?.words ?? "simple clothes"}`,
    pick(HATS, look.hat)?.words ? `and ${pick(HATS, look.hat)!.words}` : null,
    pick(PETS, look.pet)?.words ? `with ${pick(PETS, look.pet)!.words}` : null,
  ].filter(Boolean);

  const name = look.name.trim();
  return (
    `Always include the same recurring child companion in every picture: ` +
    `${name ? `a child called ${name}, ` : "a friendly child, "}${parts.join(", ")}. ` +
    `Keep this child's appearance identical on every page, watching or joining the scene from the side, ` +
    `never replacing or changing the story's own characters.`
  );
}
