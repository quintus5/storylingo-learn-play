import { describe, expect, it } from "vitest";
import {
  StoryValidationError,
  parseBibleEntries,
  parseChapterContent,
  parseOutline,
} from "./story-schema";


const word = (hanzi = "小猫") => ({
  hanzi,
  pinyin: "xiǎo māo",
  dict: "แมวน้อย",
  context: "แมวน้อยตัวนี้",
});

const sentence = (hanzi = "小猫在睡觉。") => ({
  hanzi,
  pinyin: "xiǎo māo zài shuì jiào",
  native: "แมวน้อยกำลังนอนหลับ",
  words: [word(), word("睡觉")],
});

const validChapter = () => ({
  pages: [{ sentences: [sentence(), sentence("小猫醒了。")] }, { sentences: [sentence("天亮了。")] }],
  words: [word(), word("天亮")],
});

describe("parseChapterContent — good output", () => {
  it("accepts well-formed chapter content unchanged", () => {
    const out = parseChapterContent(validChapter());
    expect(out.pages).toHaveLength(2);
    expect(out.pages[0].sentences).toHaveLength(2);
    expect(out.words).toHaveLength(2);
    expect(out.pages[0].sentences[0].native).toBe("แมวน้อยกำลังนอนหลับ");
  });

  it("ignores unknown extra fields the model invents", () => {
    const raw = validChapter() as Record<string, unknown>;
    raw.difficulty = "hsk1";
    (raw.pages as { illustration?: string }[])[0].illustration = "a cat";
    const out = parseChapterContent(raw);
    expect(out.pages).toHaveLength(2);
    expect(out.pages[0]).not.toHaveProperty("illustration");
  });
});

describe("parseChapterContent — malformed output is rejected", () => {
  it("throws when pages is empty", () => {
    expect(() => parseChapterContent({ pages: [], words: [word()] })).toThrow(StoryValidationError);
  });

  it("throws when pages is missing entirely", () => {
    expect(() => parseChapterContent({ words: [word()] })).toThrow(StoryValidationError);
  });

  it("throws when the top-level words list is empty", () => {
    expect(() => parseChapterContent({ pages: validChapter().pages, words: [] })).toThrow(
      StoryValidationError,
    );
  });

  it.each([
    ["a JSON string", '{"pages":[]}'],
    ["an array", [{ pages: [] }]],
    ["null", null],
    ["a number", 42],
    ["undefined", undefined],
  ])("throws when the model returns %s instead of an object", (_label, raw) => {
    expect(() => parseChapterContent(raw)).toThrow(StoryValidationError);
  });

  it("reports the failing field paths in the error", () => {
    try {
      parseChapterContent({ pages: [], words: [] });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(StoryValidationError);
      expect((err as StoryValidationError).issues.join(" ")).toContain("pages");
    }
  });
});

describe("parseChapterContent — partial repair keeps the reader safe", () => {
  it("drops pages with no sentences but keeps the rest", () => {
    const raw = validChapter();
    raw.pages.splice(1, 0, { sentences: [] });
    const out = parseChapterContent(raw);
    expect(out.pages).toHaveLength(2);
  });

  it("throws when every page is empty", () => {
    expect(() =>
      parseChapterContent({ pages: [{ sentences: [] }, { sentences: [] }], words: [word()] }),
    ).toThrow(StoryValidationError);
  });

  it("drops a sentence missing the Thai translation, keeping the good one", () => {
    const bad = { ...sentence("坏句子。") } as Record<string, unknown>;
    delete bad.native;
    const out = parseChapterContent({
      pages: [{ sentences: [bad, sentence()] }],
      words: [word()],
    });
    expect(out.pages[0].sentences).toHaveLength(1);
    expect(out.pages[0].sentences[0].hanzi).toBe("小猫在睡觉。");
  });

  it.each([
    ["empty hanzi", { hanzi: "" }],
    ["whitespace-only hanzi", { hanzi: "   " }],
    ["empty pinyin", { pinyin: "" }],
    ["non-string hanzi", { hanzi: 123 }],
    ["no words array", { words: [] }],
  ])("drops a sentence with %s", (_label, patch) => {
    const out = parseChapterContent({
      pages: [{ sentences: [{ ...sentence("坏。"), ...patch }, sentence()] }],
      words: [word()],
    });
    expect(out.pages[0].sentences).toHaveLength(1);
  });

  it("drops invalid words inside a sentence but keeps the sentence", () => {
    const s = sentence();
    const out = parseChapterContent({
      pages: [{ sentences: [{ ...s, words: ["not an object", { hanzi: "词" }, word()] }] }],
      words: [word()],
    });
    expect(out.pages[0].sentences[0].words).toHaveLength(1);
    expect(out.pages[0].sentences[0].words[0].dict).toBe("แมวน้อย");
  });

  it("drops a sentence whose words are all invalid", () => {
    expect(() =>
      parseChapterContent({
        pages: [{ sentences: [{ ...sentence(), words: [{ hanzi: "词" }, null] }] }],
        words: [word()],
      }),
    ).toThrow(StoryValidationError);
  });

  it("drops malformed vocabulary entries from the top-level list", () => {
    const out = parseChapterContent({
      pages: validChapter().pages,
      words: [word(), { hanzi: "词", pinyin: "cí" }, null, "词"],
    });
    expect(out.words).toHaveLength(1);
  });

  it("skips non-object pages", () => {
    const out = parseChapterContent({
      pages: ["oops", null, { sentences: [sentence()] }],
      words: [word()],
    });
    expect(out.pages).toHaveLength(1);
  });
});

describe("parseOutline", () => {
  const outline = (n: number) => ({
    title: "The Sleepy Cat",
    blurb: "A small cat looks for a warm place to sleep.",
    chapters: Array.from({ length: n }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      summary: "Something happens and the cat learns a lesson.",
      illustration: "A cat under a desert moon",
    })),
  });

  it("accepts a valid outline", () => {
    expect(parseOutline(outline(8)).chapters).toHaveLength(8);
  });

  it("accepts a single-chapter outline", () => {
    expect(parseOutline(outline(1), 1).chapters).toHaveLength(1);
  });

  it("trims extra chapters beyond the requested count", () => {
    expect(parseOutline(outline(12), 8).chapters).toHaveLength(8);
  });

  it("drops chapters missing a summary", () => {
    const raw = outline(3) as { chapters: Record<string, unknown>[] };
    delete raw.chapters[1].summary;
    expect(parseOutline(raw).chapters).toHaveLength(2);
  });

  it("throws when no chapters survive", () => {
    expect(() => parseOutline({ title: "X", chapters: [{ title: "Only a title" }] })).toThrow(
      StoryValidationError,
    );
  });

  it("throws when the title is missing", () => {
    expect(() => parseOutline({ chapters: outline(2).chapters })).toThrow(StoryValidationError);
  });

  it("throws on non-object model output", () => {
    expect(() => parseOutline("not json")).toThrow(StoryValidationError);
  });

  it("keeps key events and characters from the plot spine", () => {
    const raw = outline(2) as Record<string, unknown> & { chapters: Record<string, unknown>[] };
    raw.characters = ["Momotaro — the peach boy", "Red demon — the villain"];
    raw.chapters[0].keyEvents = ["Momotaro is born from a peach", "He sets off for Demon Island"];
    const parsed = parseOutline(raw);
    expect(parsed.characters).toHaveLength(2);
    expect(parsed.chapters[0].keyEvents).toEqual([
      "Momotaro is born from a peach",
      "He sets off for Demon Island",
    ]);
  });

  it("defaults key events to an empty list when absent", () => {
    expect(parseOutline(outline(2)).chapters[0].keyEvents).toEqual([]);
  });

  it("keeps the chapter when key events are malformed", () => {
    const raw = outline(2) as { chapters: Record<string, unknown>[] };
    raw.chapters[0].keyEvents = "the demon fights Momotaro";
    raw.chapters[1].keyEvents = [null, 42, "  The demon is defeated  ", ""];
    const parsed = parseOutline(raw);
    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters[0].keyEvents).toEqual([]);
    expect(parsed.chapters[1].keyEvents).toEqual(["The demon is defeated"]);
  });

  it("ignores a malformed characters field", () => {
    const raw = outline(1) as Record<string, unknown>;
    raw.characters = "Momotaro";
    expect(parseOutline(raw).characters).toEqual([]);
  });
});


describe("page cast and place tags", () => {
  const page = (extra: Record<string, unknown>) => ({
    pages: [
      {
        sentences: [
          {
            hanzi: "小虎跑了",
            pinyin: "xiǎo hǔ pǎo le",
            native: "เสือน้อยวิ่ง",
            words: [{ hanzi: "跑", pinyin: "pǎo", dict: "วิ่ง" }],
          },
        ],
        ...extra,
      },
    ],
    words: [{ hanzi: "跑", pinyin: "pǎo", dict: "วิ่ง" }],
  });

  it("keeps cast and place when present", () => {
    const out = parseChapterContent(page({ cast: ["Tiger", " Boy "], place: "The village" }));
    expect(out.pages[0].cast).toEqual(["Tiger", "Boy"]);
    expect(out.pages[0].place).toBe("The village");
  });

  it("drops malformed tags instead of failing", () => {
    const out = parseChapterContent(page({ cast: [1, "", null], place: 5 }));
    expect(out.pages[0].cast).toBeUndefined();
    expect(out.pages[0].place).toBeUndefined();
  });

  it("keeps only well-formed bible entries", () => {
    const entries = parseBibleEntries([
      { name: "Tiger", description: "An orange tiger with a torn left ear." },
      { name: "Tiger", description: "duplicate" },
      { name: "", description: "no name" },
      "nonsense",
    ]);
    expect(entries).toEqual([{ name: "Tiger", description: "An orange tiger with a torn left ear." }]);
  });
});
