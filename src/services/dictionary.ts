export async function loadDictionary(): Promise<Set<string>> {
  const response = await fetch('/dictionary-sowpods.txt');
  if (!response.ok) {
    console.error(`Failed to load dictionary: ${response.status}`);
    return new Set();
  }
  const text = await response.text();
  const words = new Set(
    text.split(/\r?\n/).map((w) => w.trim().toUpperCase()).filter((w) => w.length >= 2)
  );
  console.log(`Loaded dictionary: ${words.size.toLocaleString()} words`);
  return words;
}
