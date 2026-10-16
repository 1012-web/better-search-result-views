/** 比对用的单字归一化：全角标点转半角，其余走 NFKC 并转小写。 */

const PUNCT_MAP: Record<string, string> = {
  "，": ",",
  "。": ".",
  "；": ";",
  "：": ":",
  "？": "?",
  "！": "!",
  "（": "(",
  "）": ")",
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
  "、": ",",
  "《": "<",
  "》": ">",
  "—": "-",
  "－": "-",
  "～": "~"
};

export function normalizeChar(ch: string): string {
  if (PUNCT_MAP[ch]) return PUNCT_MAP[ch];
  return ch.normalize("NFKC").toLowerCase();
}
