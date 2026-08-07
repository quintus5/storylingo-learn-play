import { describe, expect, it } from "vitest";
import { applySandhi, isToneMarked, syllableTone } from "./pinyin";

describe("isToneMarked", () => {
  it("accepts tone-marked pinyin", () => {
    expect(isToneMarked("nǐ hǎo")).toBe(true);
    expect(isToneMarked("Cóngqián yǒu yī zhī xiǎo lǎohǔ")).toBe(true);
  });

  it("accepts a single neutral particle", () => {
    expect(isToneMarked("le")).toBe(true);
    expect(isToneMarked("ma")).toBe(true);
  });

  it("rejects numbered pinyin", () => {
    expect(isToneMarked("ni3 hao3")).toBe(false);
    expect(isToneMarked("xiao3 lao3hu3")).toBe(false);
  });

  it("rejects plain latin with no tones", () => {
    expect(isToneMarked("ni hao")).toBe(false);
    expect(isToneMarked("congqian you yi zhi xiao laohu")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isToneMarked("")).toBe(false);
    expect(isToneMarked("   ")).toBe(false);
  });
});

describe("syllableTone", () => {
  it("reads the tone off the marked vowel", () => {
    expect(syllableTone("mā")).toBe(1);
    expect(syllableTone("má")).toBe(2);
    expect(syllableTone("mǎ")).toBe(3);
    expect(syllableTone("mà")).toBe(4);
    expect(syllableTone("ma")).toBe(0);
  });
});

describe("applySandhi", () => {
  it("turns 不 into bú before a 4th tone", () => {
    expect(applySandhi("不是", "bù shì")).toBe("bú shì");
    expect(applySandhi("不去", "bù qù")).toBe("bú qù");
  });

  it("leaves 不 alone before other tones", () => {
    expect(applySandhi("不好", "bù hǎo")).toBe("bù hǎo");
    expect(applySandhi("不高", "bù gāo")).toBe("bù gāo");
  });

  it("turns 一 into yí before a 4th tone and yì elsewhere", () => {
    expect(applySandhi("一样", "yī yàng")).toBe("yí yàng");
    expect(applySandhi("一天", "yī tiān")).toBe("yì tiān");
    expect(applySandhi("一年", "yī nián")).toBe("yì nián");
    expect(applySandhi("一起", "yī qǐ")).toBe("yì qǐ");
  });

  it("does nothing when there is no 不 or 一", () => {
    expect(applySandhi("你好", "nǐ hǎo")).toBe("nǐ hǎo");
  });

  it("leaves pinyin untouched when syllables don't line up", () => {
    // Two characters but three syllables — alignment is unsafe.
    expect(applySandhi("不是", "bù shì le")).toBe("bù shì le");
  });

  it("handles 不 at the end of a phrase", () => {
    expect(applySandhi("好不", "hǎo bù")).toBe("hǎo bù");
  });
});
