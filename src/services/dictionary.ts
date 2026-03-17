const SOWPODS_URLS = [
  "https://raw.githubusercontent.com/jesstess/Scrabble/master/scrabble/sowpods.txt",
  "https://raw.githubusercontent.com/benhoyt/boggle/master/word-list.txt",
];

export async function loadDictionary(): Promise<Set<string>> {
  const errors: string[] = [];
  
  for (const url of SOWPODS_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      const words = new Set(
        text.split(/\r?\n/).map((w) => w.trim().toUpperCase()).filter((w) => w.length >= 2)
      );
      if (words.size > 1000) {
        console.log(`Loaded dictionary: ${words.size.toLocaleString()} words from ${url}`);
        return words;
      }
    } catch (err) {
      errors.push(`${url}: ${(err as Error).message}`);
    }
  }
  
  console.error("Failed to load dictionary from all sources:", errors);
  return new Set();
}
