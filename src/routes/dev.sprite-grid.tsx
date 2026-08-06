import { createFileRoute } from "@tanstack/react-router";
import { CharacterSprite } from "@/components/CharacterSprite";
import { DEFAULT_LOOK, HAIRS, SKINS } from "@/lib/character";

/**
 * Developer-only contact sheet: every skin x hair combination at a fixed size,
 * used by the visual regression test in tests/visual to catch hair or body
 * misalignment. Not linked from the app.
 */
export const Route = createFileRoute("/dev/sprite-grid")({
  head: () => ({
    meta: [
      { title: "Sprite grid — StoryLingo dev" },
      { name: "description", content: "Internal contact sheet of every buddy skin and hair combination." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sprite grid — StoryLingo dev" },
      { property: "og:description", content: "Internal contact sheet of buddy sprite combinations." },
    ],
  }),
  component: SpriteGridPage,
});

function SpriteGridPage() {
  return (
    <main style={{ background: "#ffffff", padding: 16 }}>
      <h1 style={{ fontSize: 14, marginBottom: 12 }}>Buddy sprite contact sheet</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {SKINS.map((skin) =>
          HAIRS.map((hair) => (
            <div
              key={`${skin.id}-${hair.id}`}
              data-combo={`${skin.id}-${hair.id}`}
              style={{ width: 200, height: 260, background: "#ffffff", display: "flex", justifyContent: "center" }}
            >
              <CharacterSprite
                look={{ ...DEFAULT_LOOK, name: "", skin: skin.id, hair: hair.id, hat: null, pet: null }}
                size={200}
              />
            </div>
          )),
        )}
      </div>
    </main>
  );
}
