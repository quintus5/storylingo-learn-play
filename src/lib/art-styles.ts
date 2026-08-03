/** Culture-aware illustration presets. The AI picks one per book; the user can override it. */

const CHILD_SAFE =
  "Gentle, warm and friendly mood suitable for young children. Rounded, kind character shapes. " +
  "No text, no letters, no words, no numbers, no borders, no watermarks.";

export type ArtStyleId =
  | "chinese-ink"
  | "japanese-ukiyoe"
  | "european-pastel"
  | "thai-mural"
  | "persian-miniature"
  | "african-textile"
  | "indian-folk"
  | "modern-watercolor";

export type ArtStylePreset = {
  id: ArtStyleId;
  label: string;
  hint: string;
  prompt: string;
};

export const ART_STYLES: ArtStylePreset[] = [
  {
    id: "chinese-ink",
    label: "Chinese ink-wash",
    hint: "Classical Chinese fables and folk tales",
    prompt:
      "Traditional Chinese ink-wash painting (shuǐmòhuà) on warm rice paper. Calligraphic brush strokes " +
      "with varied pressure, soft bleeding ink washes, generous misty negative space, distant layered " +
      "mountains. Muted ink greys and blacks with restrained cinnabar red and pale jade accents. " +
      "Historically faithful Chinese clothing, architecture and landscape. " +
      CHILD_SAFE,
  },
  {
    id: "japanese-ukiyoe",
    label: "Japanese woodblock",
    hint: "Japanese folk tales",
    prompt:
      "Japanese ukiyo-e woodblock print. Bold confident outlines, flat layered colour fields, subtle " +
      "wood-grain and paper texture, stylised waves, clouds and pine. Indigo, ochre, soft coral palette. " +
      "Historically faithful Japanese dress and architecture. " +
      CHILD_SAFE,
  },
  {
    id: "european-pastel",
    label: "European fairy tale",
    hint: "Grimm, Andersen, Aesop and European folklore",
    prompt:
      "Golden Age European storybook illustration in soft pastel and gouache. Delicate pencil underdrawing, " +
      "creamy paper tone, sculptural carved-relief detail in stone and woodwork, romantic forest and " +
      "cottage settings. Muted rose, sage, dusty blue and antique gold palette. Period-accurate European " +
      "costume and architecture. " +
      CHILD_SAFE,
  },
  {
    id: "thai-mural",
    label: "Thai temple mural",
    hint: "Thai and Southeast Asian stories",
    prompt:
      "Thai temple mural painting style. Fine flowing kranok line work, gold-leaf highlights, flattened " +
      "decorative perspective, lush tropical foliage and tiered temple roofs. Warm vermilion, deep green " +
      "and gold palette. Historically faithful Thai dress and architecture. " +
      CHILD_SAFE,
  },
  {
    id: "persian-miniature",
    label: "Persian miniature",
    hint: "Middle Eastern and Central Asian tales",
    prompt:
      "Persian miniature painting. Ornamental floral borders, flattened jewel-like perspective, intricate " +
      "tilework and arabesque pattern, tiny precise brushwork. Lapis blue, turquoise, saffron and gold " +
      "palette. Historically faithful Persian dress and architecture. " +
      CHILD_SAFE,
  },
  {
    id: "african-textile",
    label: "African folktale",
    hint: "African folk tales and animal fables",
    prompt:
      "West African folk illustration with bold textile patterning. Batik and kente-inspired geometric " +
      "borders, earth-pigment texture, strong graphic silhouettes, savannah light. Ochre, indigo, terracotta " +
      "and cream palette. Culturally faithful dress and setting. " +
      CHILD_SAFE,
  },
  {
    id: "indian-folk",
    label: "Indian folk art",
    hint: "Panchatantra, Jataka and Indian folk tales",
    prompt:
      "Indian folk art illustration blending Madhubani and Pattachitra traditions. Dense decorative pattern " +
      "fill, strong black outlines, flattened symbolic composition, floral and animal motifs. Saturated " +
      "turmeric yellow, indigo, madder red and leaf green palette. Historically faithful Indian dress and " +
      "architecture. " +
      CHILD_SAFE,
  },
  {
    id: "modern-watercolor",
    label: "Modern watercolor",
    hint: "Modern or unknown origin (default)",
    prompt:
      "Soft children's watercolor storybook illustration, warm desert night palette: deep navy sky, golden " +
      "stars, warm sand dunes, gentle glowing lantern light. Hand-painted texture, rounded friendly shapes. " +
      CHILD_SAFE,
  },
];

export const DEFAULT_ART_STYLE: ArtStyleId = "modern-watercolor";

const BY_ID = new Map(ART_STYLES.map((s) => [s.id, s]));

export function isArtStyleId(value: unknown): value is ArtStyleId {
  return typeof value === "string" && BY_ID.has(value as ArtStyleId);
}

export function artStyle(id: string | null | undefined): ArtStylePreset {
  return (id && BY_ID.get(id as ArtStyleId)) || BY_ID.get(DEFAULT_ART_STYLE)!;
}

export function artStylePrompt(id: string | null | undefined): string {
  return artStyle(id).prompt;
}

/** Compact list used inside AI prompts so the model can pick one. */
export const ART_STYLE_MENU = ART_STYLES.map((s) => `${s.id} (${s.hint})`).join(", ");
