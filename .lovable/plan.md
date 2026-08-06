# Project proposal document

Create `PROPOSAL.md` at the project root: a written proposal covering the StoryLingo work built so far, aimed at a reader who is not technical (teacher, school, funder).

## Document outline

1. **Summary** — one paragraph: StoryLingo turns any children's story (link, PDF or pasted text) into an illustrated, narrated Mandarin picture book with Thai support.
2. **Audience** — Thai primary/lower-secondary learners of Mandarin (roughly ages 7-13), their parents, and teachers who want reading material at the right level. Secondary: any learner pair where the interface language and target language differ.
3. **Problem** — graded Mandarin readers for Thai children are scarce, expensive and rarely match a child's interests; existing apps drill vocabulary without stories; copying published stories directly is not legally usable.
4. **What it does** — the built feature set:
   - Story intake from URL, PDF or pasted text, with a preview that suggests a title, blurb and chapter count.
   - Faithful retelling into 1-10 chapters (original wording is never reproduced), with a plot spine extracted from the source to keep the retelling close to the real story.
   - Three-layer reading: Hanzi, pinyin and Thai, in a glassmorphic subtitle overlay over a full-bleed illustration, with word-level highlighting during narration.
   - Tap-a-word popups with meaning and slow audio.
   - Narration through Fish Audio with male/female voice choice and browser-side audio caching.
   - Culture-aware illustration styles (ink-wash, ukiyo-e, Thai mural, pastel and others) chosen to match the story's origin.
   - Scene-matched ambient music that ducks under narration.
   - Per-chapter quizzes (matching, listening, translation) that unlock the next chapter.
   - Vocabulary and progress pages.
   - Coins earned from reading and quizzes, a shop, and a customisable buddy character that is painted into the book illustrations.
   - Thai-first interface with an English toggle.
5. **Scope** — what is in scope (above), and what is deliberately out: no accounts-based classroom management, no teacher dashboard, no offline mode, no languages beyond Mandarin/Thai/English wiring, no speech recognition or pronunciation scoring.
6. **Feasibility** — the whole system is already running: front end on TanStack Start with Tailwind, backend and storage on Lovable Cloud, AI generation for text and illustrations, Fish Audio for narration. Notes on cost per book (generation is one-off per book, then cached), generation time, content-safety and copyright posture, and validation tests that reject malformed model output before it reaches a child.
7. **Risks and mitigations** — model output quality, TTS cost/limits, source links that cannot be read, illustration consistency; each with the mitigation already in place.
8. **Next steps** — short list: classroom/teacher view, more language pairs, pronunciation practice, printable/export mode.

## Technical notes

- Single new file, `PROPOSAL.md`, markdown only. No code changes, no dependency changes.
- Content is drawn from the existing implementation (creation flow, reader, quiz, economy, character system, i18n) so the document describes what actually exists rather than aspirations.
