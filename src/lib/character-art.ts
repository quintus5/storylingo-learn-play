/**
 * Painted sprite kit for the reader's buddy.
 *
 * Every piece was painted in the same 816x816 frame and then trimmed to its
 * own edges, so each layer carries an explicit placement box measured in
 * percent of the body frame. Hair is painted once in ink and tinted through a
 * CSS mask, which keeps the watercolour texture without needing one painting
 * per colour.
 */

import bodySand from "@/assets/character/body-sand.png";
import bodyHoney from "@/assets/character/body-honey.png";
import bodyClay from "@/assets/character/body-clay.png";
import bodyCocoa from "@/assets/character/body-cocoa.png";

import hairShort from "@/assets/character/hair-short.png";
import hairBob from "@/assets/character/hair-bob.png";
import hairLong from "@/assets/character/hair-long.png";
import hairBuns from "@/assets/character/hair-buns.png";
import hairCurly from "@/assets/character/hair-curly.png";

import outfitTunic from "@/assets/character/outfit-tunic.png";
import outfitExplorer from "@/assets/character/outfit-explorer.png";
import outfitHanfu from "@/assets/character/outfit-hanfu.png";
import outfitKnight from "@/assets/character/outfit-knight.png";
import outfitStargown from "@/assets/character/outfit-stargown.png";
import outfitRaincoat from "@/assets/character/outfit-raincoat.png";

import hatStraw from "@/assets/character/hat-straw.png";
import hatCrown from "@/assets/character/hat-crown.png";
import hatWizard from "@/assets/character/hat-wizard.png";
import hatBeanie from "@/assets/character/hat-beanie.png";

import petCat from "@/assets/character/pet-cat.png";
import petFox from "@/assets/character/pet-fox.png";
import petBird from "@/assets/character/pet-bird.png";
import petDragon from "@/assets/character/pet-dragon.png";

/** A layer box, in percent of the 816px-square body frame. */
export type Piece = { src: string; left: number; top: number; width: number };

const F = 816;
const p = (v: number) => (v / F) * 100;
const piece = (src: string, left: number, top: number, width: number): Piece => ({
  src,
  left: p(left),
  top: p(top),
  width: p(width),
});

/** The frame is drawn inside a taller canvas so tall hats are not clipped. */
export const CANVAS_HEIGHT = 1036;
export const FRAME_TOP_PCT = ((CANVAS_HEIGHT - F) / CANVAS_HEIGHT) * 100;
export const FRAME_HEIGHT_PCT = (F / CANVAS_HEIGHT) * 100;

/** Where the head sits inside the whole canvas — used to frame the bust crop. */
export const HEAD_CENTER = { x: 0.498, y: (CANVAS_HEIGHT - F + 120) / CANVAS_HEIGHT };

export const BODIES: Record<string, string> = {
  sand: bodySand,
  honey: bodyHoney,
  clay: bodyClay,
  cocoa: bodyCocoa,
};

/**
 * Shared anchor after normalising the bodies: the head sits with its top at
 * y=8, its centre at x=408 and a width of 250px in the 816px frame, so hair,
 * hats and the face fit every skin tone. Torsos are still painted at slightly
 * different widths, so outfits get a per-skin nudge through BODY_FIT.
 */
export const HEAD_BOX = { top: 8, centerX: 408, width: 250 };

/** Per-skin torso correction for outfit layers, measured from the art. */
export const BODY_FIT: Record<string, { scale: number; dy: number }> = {
  sand: { scale: 1.11, dy: -17 },
  honey: { scale: 1, dy: 0 },
  clay: { scale: 1.14, dy: 10 },
  cocoa: { scale: 1.18, dy: -8 },
};

export const HAIR_PIECES: Record<string, Piece> = {
  short: piece(hairShort, 273, -45, 270),
  bob: piece(hairBob, 258, -45, 300),
  // The long hair is painted with a face opening: its width and top are set so
  // the opening centres on the face (x=408) and its fringe stops above the eyes.
  long: piece(hairLong, 243, -22, 330),
  buns: piece(hairBuns, 248, -55, 320),
  curly: piece(hairCurly, 238, -60, 340),
};

/**
 * Hair is painted as a solid shape with no face opening, so each style is drawn
 * twice: once behind the face, and once on top clipped to its fringe. This is
 * the y position (in the 816px frame, where the eyes sit at y=152) where the
 * fringe copy is cut off, so hair covers the scalp but never the face.
 */
export const HAIR_FRINGE_STOP: Record<string, number> = {
  short: 132,
  bob: 132,
  long: 128,
  buns: 126,
  curly: 118,
};

export const OUTFIT_PIECES: Record<string, Piece> = {
  tunic: piece(outfitTunic, 243, 252, 330),
  explorer: piece(outfitExplorer, 238, 257, 340),
  hanfu: piece(outfitHanfu, 218, 252, 380),
  knight: piece(outfitKnight, 243, 252, 330),
  stargown: piece(outfitStargown, 233, 252, 350),
  raincoat: piece(outfitRaincoat, 233, 252, 350),
};

export const HAT_PIECES: Record<string, Piece> = {
  straw: piece(hatStraw, 218, -25, 380),
  crown: piece(hatCrown, 288, -70, 240),
  wizard: piece(hatWizard, 258, -205, 300),
  beanie: piece(hatBeanie, 278, -162, 260),
};

export const PET_PIECES: Record<string, Piece> = {
  cat: piece(petCat, 560, 540, 150),
  fox: piece(petFox, 560, 538, 150),
  bird: piece(petBird, 570, 626, 150),
  dragon: piece(petDragon, 560, 627, 170),
};

/** Every painted piece, used to warm the browser cache up front. */
export const ALL_ART: string[] = [
  ...Object.values(BODIES),
  ...Object.values(HAIR_PIECES).map((p) => p.src),
  ...Object.values(OUTFIT_PIECES).map((p) => p.src),
  ...Object.values(HAT_PIECES).map((p) => p.src),
  ...Object.values(PET_PIECES).map((p) => p.src),
];

let warmed = false;
/** Fetch every sprite layer once so option switches paint instantly. */
export function preloadCharacterArt() {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  for (const src of ALL_ART) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }
}
