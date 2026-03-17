import type { GamePlugin, CardTable } from '../types';

const cardTable: CardTable = {
  A: 2, B: 8, C: 8, D: 5, E: 2, F: 6, G: 6, H: 7,
  I: 2, J: 13, K: 8, L: 3, M: 5, N: 5, O: 2, P: 6,
  Q: 15, R: 5, S: 3, T: 3, U: 4, V: 11, W: 10, X: 12,
  Y: 4, Z: 14, ER: 7, CL: 10, IN: 7, TH: 9, QU: 9,
};

const doubleLetters = ["ER", "CL", "IN", "TH", "QU"];

const visionPrompt = `You are analyzing a photo of Quiddler card game cards laid out on a surface.

CARD DESIGN: Each Quiddler card has a decorative illustration in the center — IGNORE this illustration, it is not reliable for identifying the letter. Instead, ONLY read the small serif letter printed in the TOP-LEFT corner and the small number (point value) next to it. The same letter and number appear upside-down in the BOTTOM-RIGHT corner. These small corner labels are the ONLY reliable way to identify each card.

CRITICAL - OVERLAPPING CARDS: Cards in a group are usually FANNED or OVERLAPPING, so you may only see the corner of partially hidden cards. You MUST look carefully at the small corner letters to count ALL cards in each fan/stack. A fan of 3 overlapping cards means 3 separate card letters, even if only the top card's center is fully visible. Count the visible corners!

GROUPING: Cards are physically grouped by spatial arrangement:
- Cards that are overlapping, fanned, or closely clustered = one group
- Separate clusters = separate groups  
- A single card sitting apart = its own group of one

DOUBLE-LETTER CARDS: TH, QU, IN, ER, CL are SINGLE cards showing TWO letters. They appear as one card with both letters. Return them as their combo: "TH" not "T","H".

Your job:
1. Identify each spatial group (fan/cluster/single card)
2. Count ALL cards in each group by examining visible corners carefully
3. For each card, identify its letter or double-letter
4. Read cards left to right (or top to bottom if fanned vertically) within each group

Return ONLY valid JSON in this exact format, no markdown, no explanation:
{"words":[["QU","E","ER"],["CL","O","Y"],["A"],["T"]]}

Each inner array is one group containing the card letters in order.
Single isolated cards should appear as their own group, e.g. ["A"].`;

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
    const wordResults = results.filter(w => w.cards.length >= 2);
    const wordPts = wordResults.reduce((s, w) => s + w.points, 0);
    const wordCount = wordResults.length;
    const longest = wordResults.length > 0
      ? wordResults.reduce((max, w) => w.letters > max.letters ? w : max, wordResults[0])
      : null;
    return { words: results, total: wordPts, wordPoints: wordPts, unusedPoints: 0, wordCount, longest };
  },
  visionPrompt,
};
