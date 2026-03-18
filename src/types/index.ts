export interface CardTable {
  [key: string]: number;
}

export interface WordResult {
  cards: string[];
  word: string;
  points: number;
  letters: number;
  valid?: boolean;
  unused?: boolean;
}

export interface ScoreResult {
  words: WordResult[];
  total: number;
  wordPoints: number;
  unusedPoints: number;
  wordCount: number;
  longest: WordResult | null;
}

export interface Definition {
  word: string;
  partOfSpeech: string;
  definition: string;
}

// Game mode types

export interface Player {
  name: string;
}

export interface PlayerRoundScore {
  wordGroups: string[][];
  result: ScoreResult;
}

export interface RoundBonuses {
  longestWordPlayerIdxs: number[];
  mostWordsPlayerIdxs: number[];
}

export interface GameState {
  players: Player[];
  currentRound: number;                        // 0-7
  currentPlayerIdx: number;                    // whose turn to scan
  scores: (PlayerRoundScore | null)[][];       // scores[roundIdx][playerIdx]
  bonuses: (RoundBonuses | null)[];            // bonuses[roundIdx]
  complete: boolean;
}

export const CARDS_PER_ROUND = [3, 4, 5, 6, 7, 8, 9, 10];
export const TOTAL_ROUNDS = 8;
export const BONUS_POINTS = 10;

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
