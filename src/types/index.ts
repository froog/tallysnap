export interface CardTable {
  [key: string]: number;
}

export interface WordResult {
  cards: string[];
  word: string;
  points: number;
  letters: number;
  valid?: boolean;
}

export interface ScoreResult {
  words: WordResult[];
  total: number;
  wordCount: number;
  longest: WordResult;
}

export interface GamePlugin {
  name: string;
  cardTable: CardTable;
  doubleLetters: string[];
  letterCount: (card: string) => number;
  cardPoints: (card: string) => number;
  wordLetterCount: (cards: string[]) => number;
  wordPoints: (cards: string[]) => number;
  scoreHand: (wordGroups: string[][]) => ScoreResult;
  visionPrompt: string;
}
