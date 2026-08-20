import { beforeEach, describe, expect, it, vi } from "vitest";

// Neither the AI gateway nor Supabase may be touched by a unit test, and the
// point of the gate is that nothing is spent at all when a source is refused.
vi.mock("./ai.server", () => ({ chatJson: vi.fn(), generateIllustration: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { chatJson } from "./ai.server";
import {
  CONTENT_SEVERITY_LIMIT,
  CONTENT_WARNINGS,
  assertPictureBookSafe,
  assessPictureBookSafety,
  buildOutline,
  extractPlotSpine,
} from "./story.server";
import type { ContentWarning, PlotSpine } from "./story.server";

/** chatJson is generic, so reach for the mock through a plain mock handle. */
const mockChat = chatJson as unknown as ReturnType<typeof vi.fn>;

const spine = (warnings: ContentWarning[]): PlotSpine => ({
  characters: ["Odysseus — the captain"],
  events: ["They sail to an island."],
  warnings,
});

beforeEach(() => {
  mockChat.mockReset();
});

describe("assessPictureBookSafety", () => {
  it("allows a story with no flags at all", () => {
    expect(assessPictureBookSafety(spine([])).ok).toBe(true);
  });

  it("allows the deaths and dark woods that fairy tales are made of", () => {
    const verdict = assessPictureBookSafety(spine(["death", "horror", "substance-use"]));
    expect(verdict.ok).toBe(true);
    expect(verdict.blocking).toEqual([]);
    expect(verdict.severity).toBeLessThan(CONTENT_SEVERITY_LIMIT);
  });

  it("refuses Odyssey Book 9: the crew are eaten and the Cyclops is blinded", () => {
    const verdict = assessPictureBookSafety(spine(["death", "cannibalism", "graphic-violence"]));
    expect(verdict.ok).toBe(false);
    expect(verdict.blocking).toEqual(["cannibalism", "graphic-violence"]);
    expect(verdict.severity).toBeGreaterThan(CONTENT_SEVERITY_LIMIT);
  });

  it("refuses sexual content and self-harm on their own", () => {
    expect(assessPictureBookSafety(spine(["sexual-content"])).ok).toBe(false);
    expect(assessPictureBookSafety(spine(["self-harm"])).ok).toBe(false);
  });
});

describe("assertPictureBookSafe", () => {
  it("stays quiet for a fairy tale", () => {
    expect(() => assertPictureBookSafe(spine(["death"]))).not.toThrow();
  });

  it("explains the refusal in plain words", () => {
    expect(() => assertPictureBookSafe(spine(["cannibalism"]))).toThrow(/people being eaten/);
    expect(() => assertPictureBookSafe(spine(["cannibalism"]))).toThrow(/gentler story/);
  });
});

describe("extractPlotSpine", () => {
  it("keeps only flags from the fixed vocabulary", async () => {
    mockChat.mockResolvedValue({
      characters: ["Gretel — a brave sister"],
      events: ["The children find a house of gingerbread."],
      content_warnings: ["Death", " CANNIBALISM ", "graphic_violence", "spiders", "death"],
    });
    const result = await extractPlotSpine("a story");
    expect(result.warnings).toEqual(["death", "cannibalism", "graphic-violence"]);
  });

  it("returns no flags when the model gives none", async () => {
    mockChat.mockResolvedValue({ characters: [], events: [] });
    expect((await extractPlotSpine("a story")).warnings).toEqual([]);
  });

  it("asks for the whole vocabulary and nothing else", async () => {
    mockChat.mockResolvedValue({ characters: [], events: [] });
    await extractPlotSpine("a story");
    const prompt = mockChat.mock.calls[0]![1] as string;
    for (const warning of CONTENT_WARNINGS) expect(prompt).toContain(warning);
  });
});

describe("buildOutline", () => {
  it("refuses an unsuitable source before a single call is paid for", async () => {
    await expect(
      buildOutline("source text", "The Odyssey", 3, spine(["cannibalism", "graphic-violence"])),
    ).rejects.toThrow(/not for children aged 6-10/);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("plans the book when the story is only as dark as a fairy tale", async () => {
    mockChat.mockResolvedValue({
      title: "Hansel and Gretel",
      chapters: [
        {
          title: "The gingerbread house",
          summary: "Two children are left in the wood and find a house made of sweets.",
          keyEvents: ["They follow the pebbles home."],
          illustration: "A cottage of gingerbread in a dark wood",
        },
      ],
    });
    const outline = await buildOutline("source text", "Hansel and Gretel", 1, spine(["death"]));
    expect(outline.chapters).toHaveLength(1);
  });
});
