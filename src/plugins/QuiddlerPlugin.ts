import type { GamePlugin, CardTable } from '../types';

const cardTable: CardTable = {
  A: 2, B: 8, C: 8, D: 5, E: 2, F: 6, G: 6, H: 7,
  I: 2, J: 13, K: 8, L: 3, M: 5, N: 5, O: 2, P: 6,
  Q: 15, R: 5, S: 3, T: 3, U: 4, V: 11, W: 10, X: 12,
  Y: 4, Z: 14, ER: 7, CL: 10, IN: 7, TH: 9, QU: 9,
};

const doubleLetters = ["ER", "CL", "IN", "TH", "QU"];

const visionPrompt = `You are analyzing a photo of Quiddler card game cards laid out on a surface.

Quiddler cards each show a single letter (A-Z) or a double-letter combination (TH, QU, IN, ER, CL). The letter is displayed prominently in the center of each card in an ornate Celtic manuscript style. Each card also has a small number indicating its point value.

IMPORTANT: Cards are physically grouped into words by their spatial arrangement. Cards that are overlapping or closely clustered together form one word. Separate clusters form separate words.

Your job:
1. Identify each spatial group of cards (each group = one word)
2. For each card in each group, identify the letter or double-letter shown
3. Read the cards left to right within each group
4. Pay special attention to TH, QU, IN, ER, CL - these are SINGLE cards showing TWO letters

Return ONLY valid JSON in this exact format, no markdown, no explanation:
{"words":[["T","H","E"],["C","A","T"]]}

Each inner array is one word group, containing the card letters in order.
Double-letter cards should be returned as their combo: "TH" not "T","H" when it's a single card.`;

export const QuiddlerPlugin: GamePlugin = {
  name: "Quiddler",
  cardTable,
  doubleLetters,
  letterCount(card: string): number {
    return this.doubleLetters.includes(card.toUpperCase()) ? 2 : 1;
  },
  cardPoints(card: string): number {
    return this.cardTable[card.toUpperCase()] ?? 0;
  },
  wordLetterCount(cards: string[]): number {
    return cards.reduce((sum, c) => sum + this.letterCount(c), 0);
  },
  wordPoints(cards: string[]): number {
    return cards.reduce((sum, c) => sum + this.cardPoints(c), 0);
  },
  scoreHand(wordGroups: string[][]) {
    const results = wordGroups.map((cards) => {
      const word = cards.map(c => c.toUpperCase()).join("");
      const points = this.wordPoints(cards);
      const letters = this.wordLetterCount(cards);
      return { cards, word, points, letters };
    });
    const total = results.reduce((s, w) => s + w.points, 0);
    const wordCount = results.length;
    const longest = results.reduce((max, w) => w.letters > max.letters ? w : max, results[0]);
    return { words: results, total, wordCount, longest };
  },
  visionPrompt,
};
