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

export const HAIR_PIECES: Record<string, Piece> = {
  short: piece(hairShort, 281, 4, 250),
  bob: piece(hairBob, 274, 2, 265),
  long: piece(hairLong, 281, 4, 250),
  buns: piece(hairBuns, 269, -12, 275),
  curly: piece(hairCurly, 256, -8, 300),
};

export const OUTFIT_PIECES: Record<string, Piece> = {
  tunic: piece(outfitTunic, 241, 250, 330),
  explorer: piece(outfitExplorer, 236, 255, 340),
  hanfu: piece(outfitHanfu, 216, 250, 380),
  knight: piece(outfitKnight, 241, 250, 330),
  stargown: piece(outfitStargown, 231, 250, 350),
  raincoat: piece(outfitRaincoat, 231, 250, 350),
};

export const HAT_PIECES: Record<string, Piece> = {
  straw: piece(hatStraw, 216, -25, 380),
  crown: piece(hatCrown, 286, -83, 240),
  wizard: piece(hatWizard, 256, -184, 300),
  beanie: piece(hatBeanie, 276, -162, 260),
};

export const PET_PIECES: Record<string, Piece> = {
  cat: piece(petCat, 560, 540, 150),
  fox: piece(petFox, 560, 538, 150),
  bird: piece(petBird, 570, 626, 150),
  dragon: piece(petDragon, 560, 627, 170),
};
