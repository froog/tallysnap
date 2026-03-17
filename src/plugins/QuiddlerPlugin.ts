import type { GamePlugin, CardTable } from '../types';

const cardTable: CardTable = {
  A: 2, B: 8, C: 8, D: 5, E: 2, F: 6, G: 6, H: 7,
  I: 2, J: 13, K: 8, L: 3, M: 5, N: 5, O: 2, P: 6,
  Q: 15, R: 5, S: 3, T: 3, U: 4, V: 11, W: 10, X: 12,
  Y: 4, Z: 14, ER: 7, CL: 10, IN: 7, TH: 9, QU: 9,
};

const doubleLetters = ["ER", "CL", "IN", "TH", "QU"];

const visionPrompt = `You are analyzing a photo of Quiddler card game cards laid out on a surface.

<card_design>
Each Quiddler card has a decorative illustration in the center — IGNORE this completely.
ONLY read the small serif letter printed in the TOP-LEFT corner and the small point value number next to it.
The same letter and number appear upside-down in the BOTTOM-RIGHT corner.
These small corner labels are the ONLY reliable way to identify each card.
Valid card letters: A B C D E F G H I J K L M N O P Q R S T U V W X Y Z TH QU IN ER CL
</card_design>

<overlapping_cards>
Cards in a group are usually FANNED or OVERLAPPING. You may only see the corner of partially hidden cards.
Look carefully at EVERY visible corner to count ALL cards in each fan/stack.
A fan of 3 overlapping cards has 3 visible corners with small text — read each one.
</overlapping_cards>

<grouping_rules>
Cards that are overlapping, fanned, or closely clustered = one group.
Separate clusters with clear space between them = separate groups.
A single card sitting apart from all others = its own group of one.
</grouping_rules>

<double_letter_cards>
TH, QU, IN, ER, CL are SINGLE cards showing TWO letters. They appear as one card with both letters on it.
Return them as their combo: "TH" not "T","H".
</double_letter_cards>

First, in <analysis> tags, carefully describe what you see:
- How many separate groups of cards are there?
- For each group, how many card corners can you count?
- What small corner letter do you read on each card?

Then output the final answer in <result> tags as JSON:
<result>{"words":[["QU","E","ER"],["CL","O","Y"],["A"],["T"]]}</result>

Each inner array is one group. Single isolated cards are their own group, e.g. ["A"].`;

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
