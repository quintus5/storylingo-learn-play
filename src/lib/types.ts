export type Word = {
  hanzi: string;
  pinyin: string;
  /** General dictionary meaning in the native language. */
  dict: string;
  /** Meaning as used in this sentence. */
  context?: string;
};

export type Sentence = {
  hanzi: string;
  pinyin: string;
  native: string;
  words: Word[];
};

export type Page = {
  sentences: Sentence[];
  /** English description of the scene painted for this page. */
  scene?: string;
  /** URL of this page's illustration, when one was generated. */
  image_url?: string | null;
};

export type ChapterRow = {
  id: string;
  book_id: string;
  idx: number;
  title: string;
  summary: string | null;
  image_url: string | null;
  pages: Page[];
  words: Word[];
};

export type BookRow = {
  id: string;
  title: string;
  source_url: string | null;
  target_lang: string;
  native_lang: string;
  chapter_count: number;
  cover_url: string | null;
  blurb: string | null;
  status: string;
  created_at: string;
};
