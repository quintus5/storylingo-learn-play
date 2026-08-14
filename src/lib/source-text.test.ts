import { describe, expect, it } from "vitest";
import {
  assertProse,
  assertReadable,
  contentFragment,
  looksLikeNavigation,
  proseSignals,
  sliceHtmlAtFragment,
  stripGutenbergBoilerplate,
} from "./readable";

const STORY = `Once upon a time a poor woodcutter lived at the edge of a great forest with his two children, Hansel and Gretel. There was very little to eat in the house, and one hungry night the children heard their stepmother say that the family could not go on.
In the morning the woodcutter took them deep among the trees. Hansel had filled his pockets with white pebbles, and he dropped them one by one along the path so that the moon would show them the way home again.
When the children woke the fire had gone out and the birds had eaten every crumb. They walked for three days until they came to a little house made of gingerbread, with windows of clear sugar.`;

/** The same story with a site's menu wrapped around it, which must still pass. */
const STORY_WITH_CHROME = `Home
About
Stories
Contact
Sign in
Search
Fairy tales
Fables
Bedtime
${STORY}
Next story
Previous story
Terms
Privacy`;

const CHINESE_STORY = `很久很久以前，在一座大山的下面，住着一位老爷爷。他有两个儿子，大儿子很勤劳，小儿子却很懒惰。有一天，老爷爷生病了，他把两个儿子叫到床边，对他们说：“我快要走了，你们要好好相处。”大儿子听了，眼泪掉了下来。小儿子却在想，父亲会把什么留给他呢？第二天早上，老爷爷把一块田分给了大儿子，把一袋种子分给了小儿子。小儿子很生气，他把种子扔在了路边。大儿子每天在田里工作，秋天的时候收了很多粮食。`;

/** A video page: a player, breadcrumbs and a menu, and no prose anywhere. */
const VIDEO_PAGE = `華語世界雙週刊
第471期 影片
首頁
關於我們
教材下載
影音專區
線上測驗
聯絡我們
登入
註冊
生活華語
文化園地
教學資源
節慶介紹
成語故事
主題教學
兒童天地
教師專區
上一頁
下一頁
回到頂端
分享至 Facebook
分享至 LINE
下載影片
播放
暫停
全螢幕
開啟字幕
關閉字幕
瀏覽人次
網站導覽
隱私權政策
資訊安全政策
著作權聲明
意見信箱
版權所有 僑務委員會
首頁
關於我們
教材下載
影音專區
線上測驗
聯絡我們`;

const NAV_ENGLISH = `Home
About
Contact
Sign in
Register
Watch now
Share
Download
Episodes
Season 1
Season 2
Season 3
Next
Previous
Back to top
Terms of use
Privacy policy
Cookies
Skip to content
Menu
Search
Latest videos
Popular videos
More`;

/** A menu whose items happen to end in full stops. */
const MENU_WITH_STOPS =
  `Home. About us. Contact. Sign in. Register now. Watch. Share. Download. Episodes. Next. ` +
  `Previous. Back to top. Terms. Privacy. Cookies. Menu. Search. More videos. Latest. Popular. ` +
  `Help. Support. Careers. Press. Blog. Shop. Gift cards. Newsletter. Sitemap. Accessibility.`;

/** Verse without a single full stop is still a story, so it must get through. */
const POEM = `The owl and the pussycat went to sea
In a beautiful pea-green boat
They took some honey and plenty of money
Wrapped up in a five-pound note
The owl looked up to the stars above
And sang to a small guitar
O lovely pussy, o pussy my love
What a beautiful pussy you are
You are, you are
What a beautiful pussy you are`;

describe("looksLikeNavigation", () => {
  it("passes ordinary English prose", () => {
    expect(looksLikeNavigation(STORY)).toBe(false);
  });

  it("passes Chinese prose with fullwidth stops", () => {
    expect(looksLikeNavigation(CHINESE_STORY)).toBe(false);
  });

  it("passes a story surrounded by a site menu", () => {
    expect(looksLikeNavigation(STORY_WITH_CHROME)).toBe(false);
  });

  it("passes verse that never ends a sentence", () => {
    expect(looksLikeNavigation(POEM)).toBe(false);
  });

  it("rejects a video page that is all chrome", () => {
    expect(looksLikeNavigation(VIDEO_PAGE)).toBe(true);
  });

  it("rejects an English navigation column", () => {
    expect(looksLikeNavigation(NAV_ENGLISH)).toBe(true);
  });

  it("rejects a menu whose items end in full stops", () => {
    expect(looksLikeNavigation(MENU_WITH_STOPS)).toBe(true);
  });

  it("rejects a page that repeats the same labels", () => {
    const repeated = ["Read more", "Share", "Next"].join("\n").concat("\n").repeat(12);
    expect(looksLikeNavigation(repeated)).toBe(true);
  });

  it("leaves very short text to the length check", () => {
    expect(looksLikeNavigation("Home\nAbout\nContact")).toBe(false);
  });
});

describe("proseSignals", () => {
  it("counts only paragraph-length fragments as prose", () => {
    const signals = proseSignals(STORY_WITH_CHROME);
    expect(signals.proseChars).toBeGreaterThan(500);
    expect(signals.fragmentRatio).toBeGreaterThan(0.5);
    expect(signals.sentenceDensity).toBeGreaterThan(5);
  });

  it("finds no prose at all on a page of labels", () => {
    expect(proseSignals(NAV_ENGLISH).proseChars).toBe(0);
  });
});

describe("assertProse", () => {
  it("says what is wrong in words a family can act on", () => {
    expect(() => assertProse(VIDEO_PAGE)).toThrow(/menu or a video page/);
  });

  it("stays quiet for a real story", () => {
    expect(() => assertProse(STORY)).not.toThrow();
  });
});

describe("assertReadable", () => {
  it("now refuses navigation chrome as well as binary junk", () => {
    expect(() => assertReadable(NAV_ENGLISH)).toThrow(/menu or a video page/);
  });

  it("still accepts a story wrapped in chrome", () => {
    expect(() => assertReadable(STORY_WITH_CHROME)).not.toThrow();
  });
});

const PG_TEXT = `The Project Gutenberg eBook of Moby Dick; Or, The Whale

This ebook is for the use of anyone anywhere in the United States and most other parts of the world at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this ebook.

Title: Moby Dick; Or, The Whale
Author: Herman Melville

*** START OF THE PROJECT GUTENBERG EBOOK MOBY DICK; OR, THE WHALE ***

Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation.

*** END OF THE PROJECT GUTENBERG EBOOK MOBY DICK; OR, THE WHALE ***

Updated editions will replace the previous one. Creating the works from print editions not protected by copyright law means that no one owns a United States copyright in these works.`;

describe("stripGutenbergBoilerplate", () => {
  it("keeps only the book itself", () => {
    const out = stripGutenbergBoilerplate(PG_TEXT);
    expect(out.startsWith("Call me Ishmael.")).toBe(true);
    expect(out).not.toContain("PROJECT GUTENBERG");
    expect(out).not.toContain("Updated editions");
  });

  it("works after HTML extraction has flattened the markers onto one line", () => {
    const flat = PG_TEXT.replace(/\s+/g, " ");
    expect(stripGutenbergBoilerplate(flat).startsWith("Call me Ishmael.")).toBe(true);
  });

  it("tolerates other wording, casing and spacing", () => {
    const odd =
      `front matter and licence talk\n` +
      `***start of this project gutenberg etext, aesop's fables***\n` +
      `${STORY}\n` +
      `*** End of the Project Gutenberg EBook of Aesop's Fables ***\n` +
      `licence tail`;
    const out = stripGutenbergBoilerplate(odd);
    expect(out.startsWith("Once upon a time")).toBe(true);
    expect(out).not.toContain("licence tail");
  });

  it("leaves text without markers alone", () => {
    expect(stripGutenbergBoilerplate(STORY)).toBe(STORY);
  });

  it("keeps the original when the markers would leave nothing usable", () => {
    const empty = `*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\nToo short.\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***\n${STORY}`;
    expect(stripGutenbergBoilerplate(empty)).toBe(empty);
  });
});

describe("contentFragment", () => {
  it("finds a chapter anchor", () => {
    expect(
      contentFragment("https://www.gutenberg.org/cache/epub/2701/pg2701-images.html#link2HCH0041"),
    ).toBe("link2HCH0041");
  });

  it("decodes a percent-escaped anchor", () => {
    expect(contentFragment("https://site.org/p#%E7%AC%AC%E4%B8%80%E7%AB%A0")).toBe("第一章");
  });

  it("is null when there is no fragment", () => {
    expect(contentFragment("https://example.com/story")).toBeNull();
    expect(contentFragment("https://example.com/story#")).toBeNull();
  });

  it("ignores widget and tracking fragments", () => {
    expect(contentFragment("https://site.org/search#gsc.tab=0&gsc.q=cat")).toBeNull();
    expect(contentFragment("https://site.org/p#utm_campaign=spring")).toBeNull();
    expect(contentFragment("https://site.org/p#:~:text=hello%20there")).toBeNull();
  });
});

/** The classic Project Gutenberg shape: a named anchor inside the heading. */
const PG_HTML = `<html><body>
<div class="chapter"><h2><a name="link2HCH0040" id="link2HCH0040"></a>CHAPTER 40. Midnight, Forecastle.</h2>
<p>Foretopsail. I have been thinking it over ever since, and that is the final consequence.</p></div>
<div class="chapter"><h2><a name="link2HCH0041" id="link2HCH0041"></a>CHAPTER 41. Moby Dick.</h2>
<p>I, Ishmael, was one of that crew; my shouts had gone up with the rest.</p>
<p>A wild, mystical, sympathetical feeling was in me; Ahab's quenchless feud seemed mine.</p></div>
<div class="chapter"><h2><a name="link2HCH0042" id="link2HCH0042"></a>CHAPTER 42. The Whiteness of the Whale.</h2>
<p>What the white whale was to Ahab, has been hinted; what he was to me remains unsaid.</p></div>
</body></html>`;

const MODERN_HTML = `<html><body><nav>Home About</nav>
<section id="chapter-8"><h3>Chapter 8: The Cave</h3><p>They walked into the cave and found a light.</p></section>
<section id="chapter-9"><h3>Chapter 9: The Sea</h3><p>The sea was loud that night.</p></section>
</body></html>`;

describe("sliceHtmlAtFragment", () => {
  it("returns just the anchored chapter", () => {
    const slice = sliceHtmlAtFragment(PG_HTML, "link2HCH0041") ?? "";
    expect(slice).toContain("CHAPTER 41. Moby Dick.");
    expect(slice).toContain("Ahab's quenchless feud");
    expect(slice).not.toContain("CHAPTER 40");
    expect(slice).not.toContain("CHAPTER 42");
  });

  it("stops at the next heading of the same rank", () => {
    const slice = sliceHtmlAtFragment(MODERN_HTML, "chapter-8") ?? "";
    expect(slice).toContain("They walked into the cave");
    expect(slice).not.toContain("The sea was loud");
  });

  it("handles an unquoted id and an anchor that sits before its text", () => {
    const html = `<html><body><h1>Book</h1><a id=part2></a><p>The second part begins here.</p><a id=part3></a><p>The third part.</p></body></html>`;
    const slice = sliceHtmlAtFragment(html, "part2") ?? "";
    expect(slice).toContain("The second part begins here.");
    expect(slice).not.toContain("The third part.");
  });

  it("is null when the anchor is not in the document", () => {
    expect(sliceHtmlAtFragment(PG_HTML, "link2HCH9999")).toBeNull();
  });
});
