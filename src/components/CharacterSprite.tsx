import { useEffect, type CSSProperties } from "react";
import type { CharacterLook } from "@/lib/character";
import { hairColor } from "@/lib/character";
import { preloadCharacterArt } from "@/lib/character-art";
import { spriteUrl, useSpriteUrl } from "@/lib/sprite-cache";
import {
  BODIES,
  BODY_FIT,
  CANVAS_HEIGHT,
  FRAME_HEIGHT_PCT,
  FRAME_TOP_PCT,
  HAIR_FRINGE_CLIP,
  HAIR_PIECES,
  HAT_PIECES,
  HEAD_CENTER,
  OUTFIT_PIECES,
  PET_PIECES,
  type Piece,
} from "@/lib/character-art";

/** How much the bust variant zooms into the head. */
const BUST_ZOOM = 2.5;

function box(piece: Piece): CSSProperties {
  return {
    position: "absolute",
    left: `${piece.left}%`,
    top: `${piece.top}%`,
    width: `${piece.width}%`,
    height: "auto",
  };
}

/** Widen or nudge a piece so it still fits a body painted at another size. */
function fit(piece: Piece, fitting: { scale: number; dy: number }): Piece {
  const width = piece.width * fitting.scale;
  return {
    src: piece.src,
    width,
    left: piece.left - (width - piece.width) / 2,
    top: piece.top + (fitting.dy / 816) * 100,
  };
}

function Layer({ piece, alt }: { piece: Piece; alt: string }) {
  return <img src={spriteUrl(piece.src)} alt={alt} style={box(piece)} draggable={false} />;
}

/** Painted hair, tinted to the chosen colour while keeping its ink texture. */
function Hair({ piece, color, clipPath }: { piece: Piece; color: string; clipPath?: string }) {
  const src = spriteUrl(piece.src);
  const mask: CSSProperties = {
    ...box(piece),
    aspectRatio: "auto",
  };
  return (
    <span style={{ ...box(piece), lineHeight: 0, clipPath }}>
      <img src={src} alt="" style={{ width: "100%", visibility: "hidden" }} draggable={false} />
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: color,
          WebkitMaskImage: `url(${src})`,
          maskImage: `url(${src})`,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }}
      />
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        style={{ ...mask, left: 0, top: 0, width: "100%", opacity: 0.45, mixBlendMode: "multiply" }}
      />
    </span>
  );
}

function Face({ eyes }: { eyes: string }) {
  const ink = "#3b2f2a";
  return (
    <svg
      viewBox="0 0 816 816"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      aria-hidden
    >
      {eyes === "happy" ? (
        <g stroke={ink} strokeWidth="11" fill="none" strokeLinecap="round">
          <path d="M344 156 q22 -24 44 0" />
          <path d="M428 156 q22 -24 44 0" />
        </g>
      ) : eyes === "sleepy" ? (
        <g stroke={ink} strokeWidth="11" fill="none" strokeLinecap="round">
          <path d="M344 152 q22 20 44 0" />
          <path d="M428 152 q22 20 44 0" />
        </g>
      ) : (
        <g fill={ink}>
          <ellipse cx="366" cy="152" rx={eyes === "sparkle" ? 20 : 16} ry={eyes === "sparkle" ? 23 : 18} />
          <ellipse cx="450" cy="152" rx={eyes === "sparkle" ? 20 : 16} ry={eyes === "sparkle" ? 23 : 18} />
          {eyes === "sparkle" && (
            <g fill="#fff">
              <circle cx="373" cy="144" r="7" />
              <circle cx="457" cy="144" r="7" />
            </g>
          )}
        </g>
      )}
      <path d="M388 194 q20 20 40 0" stroke={ink} strokeWidth="10" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The child's own character, layered from painted watercolour pieces so it
 * matches the art inside the storybooks.
 */
export function CharacterSprite({
  look,
  size = 96,
  variant = "full",
  className = "",
}: {
  look: CharacterLook;
  size?: number;
  variant?: "full" | "bust";
  className?: string;
}) {
  const resolve = useSpriteUrl();

  useEffect(() => {
    preloadCharacterArt();
  }, []);

  const body = BODIES[look.skin] ?? BODIES["honey"]!;
  const bodyFit = BODY_FIT[look.skin] ?? BODY_FIT["honey"]!;
  const hair = HAIR_PIECES[look.hair];
  const outfit = OUTFIT_PIECES[look.outfit];
  const hat = look.hat ? HAT_PIECES[look.hat] : null;
  const pet = look.pet ? PET_PIECES[look.pet] : null;
  const label = look.name ? `${look.name}, your story character` : "Your story character";

  const canvas = (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `816 / ${CANVAS_HEIGHT}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: `${FRAME_TOP_PCT}%`,
          width: "100%",
          height: `${FRAME_HEIGHT_PCT}%`,
        }}
      >
        <img src={resolve(body)} alt="" style={{ position: "absolute", inset: 0, width: "100%" }} draggable={false} />
        {hair && <Hair piece={hair} color={hairColor(look)} />}
        {outfit && <Layer piece={fit(outfit, bodyFit)} alt="" />}
        <Face eyes={look.eyes} />
        {hair && (
          <Hair
            piece={hair}
            color={hairColor(look)}
            clipPath={`inset(0 0 ${HAIR_FRINGE_CLIP[look.hair] ?? 40}% 0)`}
          />
        )}
        {hat && <Layer piece={hat} alt="" />}
        {pet && variant === "full" && <Layer piece={pet} alt="" />}
      </div>
    </div>
  );

  if (variant === "bust") {
    const inner = size * BUST_ZOOM;
    return (
      <div
        className={className}
        role="img"
        aria-label={label}
        style={{ position: "relative", width: size, height: size, overflow: "hidden", borderRadius: "9999px" }}
      >
        <div
          style={{
            position: "absolute",
            width: inner,
            left: size * 0.5 - inner * HEAD_CENTER.x,
            top: size * 0.54 - inner * (CANVAS_HEIGHT / 816) * HEAD_CENTER.y,
          }}
        >
          {canvas}
        </div>
      </div>
    );
  }

  return (
    <div className={className} role="img" aria-label={label} style={{ width: size }}>
      {canvas}
    </div>
  );
}
