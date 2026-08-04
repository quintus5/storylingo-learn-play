import { describe, expect, it } from "vitest";
import { assertReadable, estimateWordCount, junkRatio } from "./readable";

const CHINESE = `学而篇第一 子曰：“学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？”
有子曰：“其为人也孝弟，而好犯上者，鲜矣；不好犯上而好作乱者，未之有也。君子务本，本立而道生。孝弟也者，其为仁之本与！”
子曰：“巧言令色，鲜矣仁！” 曾子曰：“吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？”
子曰：“道千乘之国，敬事而信，节用而爱人，使民以时。” 子曰：“弟子入则孝，出则弟，谨而信，泛爱众，而亲仁，行有余力，则以学文。”`;

const ENGLISH =
  "Once upon a time there was a small boy who lived beside the sea. ".repeat(6) +
  "He sailed every morning, and every evening he came home with a story to tell his grandmother.";

describe("assertReadable", () => {
  it("accepts Chinese prose with fullwidth punctuation", () => {
    expect(() => assertReadable(CHINESE)).not.toThrow();
  });

  it("accepts ordinary English prose", () => {
    expect(() => assertReadable(ENGLISH)).not.toThrow();
  });

  it("rejects text that is too short", () => {
    expect(() => assertReadable("太短了。")).toThrow(/enough story text/);
  });

  it("rejects binary junk", () => {
    const junk = "\u0000\u0001\u0002\uFFFD\u0007".repeat(60) + "some text";
    expect(() => assertReadable(junk)).toThrow(/readable text/);
  });

  it("rejects mojibake full of replacement characters", () => {
    expect(() => assertReadable("\uFFFD".repeat(300))).toThrow(/readable text/);
  });
});

describe("junkRatio", () => {
  it("is zero for clean text", () => {
    expect(junkRatio(CHINESE)).toBe(0);
  });
  it("is one for empty text", () => {
    expect(junkRatio("")).toBe(1);
  });
});

describe("estimateWordCount", () => {
  it("counts Chinese characters rather than whitespace tokens", () => {
    expect(estimateWordCount(CHINESE)).toBeGreaterThan(90);
  });

  it("counts words for Latin text", () => {
    expect(estimateWordCount("one two three four")).toBe(4);
  });
});
