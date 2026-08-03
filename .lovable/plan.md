# Keep retellings faithful to the original story

## Why the demon never fought Momotaro

Two prompts drive generation, and neither one asks the model to stay faithful to the plot:

1. **Outline prompt** (`buildOutline`) tells the model to "Write an ORIGINAL retelling plan" and returns per chapter only a `title`, a 2-3 sentence `summary`, and an illustration description. Nothing instructs it to preserve the story's real characters, events, or ending.
2. **Chapter prompt** (`buildChapterContent`) never sees the source text at all — it only receives the book title, chapter title, and that 2-3 sentence summary. Any beat missing from the summary (the fight with the red oni, the treasure, the companions' roles) simply cannot appear in the chapter.

So the anti-copyright instruction ("never reproduce or closely paraphrase") is currently the only strong guidance, and the model fills gaps with invented, softened content.

## The current prompts (verbatim)

Outline system prompt:

```text
You are a children's story editor building beginner Mandarin learning material for
Thai-speaking children aged 6-10. You must RETELL stories in your own original words —
never reproduce, quote or closely paraphrase the source wording. Reply with JSON only.
```

Outline user prompt:

```text
Source material (for understanding the plot only, never copy its wording):
"""<story text, truncated to 24000 chars>"""

Working title: <title>
Write an ORIGINAL retelling plan with exactly <N> short chapters.
Return JSON: {"title": ..., "blurb": ..., "chapters": [{"title", "summary", "illustration"}]}
```

Chapter system prompt:

```text
You write beginner Mandarin Chinese reading material for Thai-speaking children.
Everything must be your own original simple writing (HSK1-HSK2 level), never copied text.
Pinyin must include tone marks. Thai translations must be natural Thai. Reply with JSON only.
```

Chapter user prompt (abridged):

```text
Book: <title>
Chapter <n>: <chapter title>
What happens: <2-3 sentence summary>
Words already taught (reuse some of these): <...>

Write this chapter as 2 or 3 pages. Each page has 5 to 8 very short sentences...
```

## The fix

**1. Add a fidelity contract to the outline prompt.** Keep the "own wording" rule (that is what avoids copyright) but add explicit plot-faithfulness rules: preserve the real character names and roles, keep every major event in its original order, keep the original ending, and never invent or remove a key event. Add a "key events" list per chapter (3-5 short bullet beats taken from the source) alongside the summary, so no beat is lost in compression.

**2. Give the chapter writer the actual source.** Pass the relevant source excerpt plus the chapter's key-event bullets into `buildChapterContent`, and instruct it to cover every listed beat in order. This is what makes the demon actually fight Momotaro.

**3. Extract a plot spine before outlining.** One extra analysis step that pulls characters (with names) and the ordered event list out of the source, then feeds that into the outline. This keeps long sources from losing their second half to truncation.

**4. Surface fidelity in the UI.** On the create screen's preview card, show the detected characters and planned beats so you can see, before generating, whether the plan matches the real story. No toggle — faithfulness is always on: the retelling keeps the real plot (including the oni fight and the original ending), and only the wording, sentence length, and gore-level detail are simplified for young readers.

## Technical notes

- `src/lib/story.server.ts`: new `extractPlotSpine()`; rewrite `buildOutline` prompt with fidelity rules and per-chapter `keyEvents`; extend `buildChapterContent` signature with `keyEvents` + `sourceExcerpt`. Fidelity rules are fixed constants in the prompts, not a user option.
- `src/lib/story-schema.ts`: add `keyEvents: string[]` to the outline chapter schema (tolerant repair — missing array falls back to empty).
- `src/lib/story-schema.test.ts`: fixtures for outlines with missing/malformed `keyEvents`.
- `src/lib/story.functions.ts`: persist key events with each chapter row so re-generation stays consistent.
- `src/routes/create.tsx`: show characters + beats in the preview card.

- Existing books keep working; the new fields are optional.
