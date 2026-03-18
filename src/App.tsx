import { useState, useEffect, useRef, useCallback } from 'react';
import type { GamePlugin, WordResult, ScoreResult, Player, GameState, PlayerRoundScore, RoundBonuses } from './types';
import { CARDS_PER_ROUND, TOTAL_ROUNDS } from './types';
import { QuiddlerPlugin } from './plugins/QuiddlerPlugin';
import { loadDictionary } from './services/dictionary';
import { analyzeCards } from './services/visionApi';
import { loadTestImage } from './utils/imageLoader';
import { ActionButton, EditWordModal, Header, WordRow } from './components';
import { PlayerSetup } from './components/PlayerSetup';
import { Scoreboard } from './components/Scoreboard';
import styles from './App.module.css';

type Screen = 'home' | 'processing' | 'score' | 'setup' | 'game';

const TEST_IMAGES = [
  { label: "AGED, EH, THAT", path: "/test-images/aged-eh-that.jpeg" },
  { label: "AT, THE, EDH", path: "/test-images/at-the-edh.jpeg" },
  { label: "QUEER, CLOY, A, T", path: "/test-images/queer-cloy-a-t.jpeg" },
  { label: "THAT, CLOY, ZRE", path: "/test-images/that-cloy-zre.jpeg" },
];

const STORAGE_KEY = 'cardcount_game_state';

function saveGameToStorage(state: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save game state:', e);
  }
}

function loadGameFromStorage(): GameState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function clearGameStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

function createGameState(players: Player[]): GameState {
  const scores: (PlayerRoundScore | null)[][] = Array.from(
    { length: TOTAL_ROUNDS },
    () => Array(players.length).fill(null)
  );
  return {
    players,
    currentRound: 0,
    currentPlayerIdx: 0,
    scores,
    bonuses: Array(TOTAL_ROUNDS).fill(null),
    complete: false,
  };
}

function calculateRoundBonuses(roundScores: (PlayerRoundScore | null)[]): RoundBonuses {
  let maxWordCount = 0;
  let maxLetterCount = 0;
  const playerWordCounts: number[] = [];
  const playerLongest: number[] = [];

  for (const score of roundScores) {
    if (!score) {
      playerWordCounts.push(0);
      playerLongest.push(0);
      continue;
    }
    const validWords = score.result.words.filter((w) => !w.unused);
    const wordCount = validWords.length;
    const longest = validWords.reduce((max, w) => Math.max(max, w.letters), 0);
    playerWordCounts.push(wordCount);
    playerLongest.push(longest);
    if (wordCount > maxWordCount) maxWordCount = wordCount;
    if (longest > maxLetterCount) maxLetterCount = longest;
  }

  return {
    mostWordsPlayerIdxs: maxWordCount > 0
      ? playerWordCounts.map((c, i) => c === maxWordCount ? i : -1).filter((i) => i >= 0)
      : [],
    longestWordPlayerIdxs: maxLetterCount > 0
      ? playerLongest.map((c, i) => c === maxLetterCount ? i : -1).filter((i) => i >= 0)
      : [],
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [plugin] = useState<GamePlugin>(QuiddlerPlugin);
  const [dictionary, setDictionary] = useState<Set<string> | null>(null);
  const [dictLoading, setDictLoading] = useState(true);
  const [wordGroups, setWordGroups] = useState<string[][]>([]);
  const [, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [scored, setScored] = useState<ScoreResult & { words: (WordResult & { valid?: boolean; unused?: boolean })[] } | null>(null);
  const [selectedTestImage, setSelectedTestImage] = useState(TEST_IMAGES[0].path);
  const fileRef = useRef<HTMLInputElement>(null);

  // Game mode state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  // Check for saved game on mount
  useEffect(() => {
    const saved = loadGameFromStorage();
    if (saved && !saved.complete) {
      setShowResumePrompt(true);
    }
  }, []);

  // Load dictionary
  useEffect(() => {
    setDictLoading(true);
    loadDictionary().then((dict) => {
      setDictionary(dict);
      setDictLoading(false);
    });
  }, []);

  const validateWord = useCallback(
    (cards: string[]) => {
      if (!dictionary) return undefined;
      const word = cards.map((c) => c.toUpperCase()).join("");
      return dictionary.has(word);
    },
    [dictionary]
  );

  const scoreGroups = useCallback((groups: string[][]) => {
    const results = plugin.scoreHand(groups);
    const validated = results.words.map((w) => {
      const isUnused = w.cards.length < 2 || !validateWord(w.cards);
      const valid = w.cards.length >= 2 ? validateWord(w.cards) : undefined;
      return { ...w, valid: isUnused ? undefined : valid, unused: isUnused };
    });

    const wPoints = validated.filter((w) => !w.unused).reduce((s, w) => s + w.points, 0);
    const uPoints = validated.filter((w) => w.unused).reduce((s, w) => s + w.points, 0);
    const total = Math.max(0, wPoints - uPoints);
    const wordCount = validated.filter((w) => !w.unused).length;
    const wordResults = validated.filter((w) => !w.unused);
    const longest = wordResults.length > 0
      ? wordResults.reduce((max, w) => w.letters > max.letters ? w : max, wordResults[0])
      : null;

    return { words: validated, total, wordPoints: wPoints, unusedPoints: uPoints, wordCount, longest };
  }, [plugin, validateWord]);

  const processImage = async (base64: string) => {
    const words = await analyzeCards(base64, plugin);
    const uppercased = words.map((w) => w.map((c) => c.toUpperCase()));
    setWordGroups(uppercased);
    setScored(scoreGroups(uppercased));
    setScreen('score');
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setError(null);
    setScreen('processing');

    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = (ev) => rej(new Error(`Failed to read file: ${ev}`));
        r.onabort = () => rej(new Error("File reading aborted"));
        const timeout = setTimeout(() => rej(new Error("File reading timeout")), 30000);
        r.onloadend = () => clearTimeout(timeout);
        try { r.readAsDataURL(file); } catch (err) { clearTimeout(timeout); rej(err); }
      });
      await processImage(base64);
    } catch (err) {
      setError(`Photo error: ${(err as Error).message}`);
      setScreen(gameState ? 'game' : 'home');
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleTestImage = async () => {
    setProcessing(true);
    setError(null);
    setScreen('processing');
    try {
      const base64 = await loadTestImage(selectedTestImage);
      await processImage(base64);
    } catch (err) {
      setError((err as Error).message || "Failed to load test image");
      setScreen(gameState ? 'game' : 'home');
    } finally {
      setProcessing(false);
    }
  };

  const showTestButton = import.meta.env.VITE_TEST_BUTTON === "true";

  const handleEditSave = (newCards: string[]) => {
    if (editingIdx === null) return;
    const updated = [...wordGroups];
    updated[editingIdx] = newCards;
    setWordGroups(updated);
    setScored(scoreGroups(updated));
    setEditingIdx(null);
  };

  const handleEditDelete = () => {
    if (editingIdx === null) return;
    const updated = wordGroups.filter((_, i) => i !== editingIdx);
    setWordGroups(updated);
    setScored(scoreGroups(updated));
    setEditingIdx(null);
  };

  const findWordGroupIndex = (scoredWord: WordResult) => {
    return wordGroups.findIndex((g) =>
      g.length === scoredWord.cards.length &&
      g.every((c, i) => c === scoredWord.cards[i])
    );
  };

  // --- Game mode handlers ---

  const handleNewGame = () => {
    const saved = loadGameFromStorage();
    if (saved && !saved.complete) {
      setShowResumePrompt(true);
    } else {
      setScreen('setup');
    }
  };

  const handleResumeGame = () => {
    const saved = loadGameFromStorage();
    if (saved) {
      setGameState(saved);
      setShowResumePrompt(false);
      setScreen('game');
    }
  };

  const handleStartNewGame = () => {
    clearGameStorage();
    setGameState(null);
    setShowResumePrompt(false);
    setScreen('setup');
  };

  const handleStartGame = (players: Player[]) => {
    const state = createGameState(players);
    setGameState(state);
    saveGameToStorage(state);
    setScreen('game');
  };

  const handleContinueAfterScore = () => {
    if (!gameState || !scored) return;

    const { currentRound, currentPlayerIdx, players } = gameState;
    const newScores = gameState.scores.map((r) => [...r]);
    newScores[currentRound][currentPlayerIdx] = { wordGroups: [...wordGroups], result: scored };

    const nextPlayerIdx = currentPlayerIdx + 1;
    const roundComplete = nextPlayerIdx >= players.length;

    let newState: GameState;
    if (roundComplete) {
      const roundBonuses = calculateRoundBonuses(newScores[currentRound]);
      const newBonuses = [...gameState.bonuses];
      newBonuses[currentRound] = roundBonuses;

      newState = {
        ...gameState,
        scores: newScores,
        bonuses: newBonuses,
        currentPlayerIdx: nextPlayerIdx,
        complete: currentRound >= TOTAL_ROUNDS - 1,
      };
    } else {
      newState = { ...gameState, scores: newScores, currentPlayerIdx: nextPlayerIdx };
    }

    setGameState(newState);
    saveGameToStorage(newState);
    setScored(null);
    setWordGroups([]);
    setScreen('game');
  };

  const handleNextRound = () => {
    if (!gameState) return;
    const newState: GameState = {
      ...gameState,
      currentRound: gameState.currentRound + 1,
      currentPlayerIdx: 0,
    };
    setGameState(newState);
    saveGameToStorage(newState);
  };

  const handleEndGame = () => {
    clearGameStorage();
    setGameState(null);
    setScored(null);
    setWordGroups([]);
    setScreen('home');
  };

  const isGameMode = gameState !== null;
  const isRoundComplete = gameState ? gameState.currentPlayerIdx >= gameState.players.length : false;

  // --- Resume prompt ---
  if (showResumePrompt) {
    const saved = loadGameFromStorage();
    return (
      <div className={`${styles.container} ${styles.centered}`}>
        <div className={styles.resumeCard}>
          <h2 className={styles.resumeTitle}>Resume Game?</h2>
          {saved && (
            <p className={styles.resumeDetail}>
              Round {saved.currentRound + 1} with {saved.players.map((p) => p.name).join(', ')}
            </p>
          )}
          <div className={styles.resumeActions}>
            <ActionButton onClick={handleResumeGame}>Resume</ActionButton>
            <ActionButton variant="secondary" onClick={handleStartNewGame}>New Game</ActionButton>
          </div>
        </div>
      </div>
    );
  }

  // --- Home screen ---
  if (screen === 'home') {
    return (
      <div className={styles.container}>
        <div className={styles.hero}>
          <div className={styles.tagline}>Card Game Scorer</div>
          <h1 className={styles.title}>CardCount</h1>
          <p className={styles.subtitle}>Snap your hand. Get your score.</p>

          <div className={styles.card}>
            <div className={styles.cardLabel}>Current Game</div>
            <div className={styles.gameName}>{plugin.name}</div>

            <ActionButton onClick={handleNewGame}>
              New Game
            </ActionButton>

            <div className={styles.divider} />

            <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/heic,image/heif" capture="environment" onChange={handlePhoto} className={styles.hidden} />

            <ActionButton variant="secondary" onClick={() => fileRef.current?.click()}>
              Quick Scan
            </ActionButton>

            {showTestButton && (
              <div className={styles.testSection}>
                <select value={selectedTestImage} onChange={(e) => setSelectedTestImage(e.target.value)} className={styles.testSelect}>
                  {TEST_IMAGES.map((img) => (
                    <option key={img.path} value={img.path}>{img.label}</option>
                  ))}
                </select>
                <ActionButton variant="secondary" onClick={handleTestImage}>
                  Test Image
                </ActionButton>
              </div>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.settings}>
            <div className={styles.setting}>
              <div>
                <div className={styles.settingTitle}>Dictionary</div>
                <div className={styles.settingDesc}>SOWPODS (international)</div>
              </div>
              <span className={`${styles.badge} ${dictLoading ? styles.badgeLoading : styles.badgeOk}`}>
                {dictLoading ? "Loading..." : `${dictionary?.size?.toLocaleString()} words`}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Setup screen ---
  if (screen === 'setup') {
    return (
      <div className={styles.container}>
        <PlayerSetup onStart={handleStartGame} onBack={() => setScreen('home')} />
      </div>
    );
  }

  // --- Processing screen ---
  if (screen === 'processing') {
    return (
      <div className={`${styles.container} ${styles.centered}`}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <div className={styles.loadingText}>Reading your cards...</div>
          <div className={styles.loadingSubtext}>Identifying letters and word groups</div>
        </div>
      </div>
    );
  }

  // --- Game screen ---
  if (screen === 'game' && gameState) {
    const { currentRound, players, complete } = gameState;
    const cardCount = CARDS_PER_ROUND[currentRound];
    const currentPlayer = !isRoundComplete && !complete ? players[gameState.currentPlayerIdx] : null;

    return (
      <div className={styles.container}>
        <Header
          title={complete ? "Game Over" : `Round ${currentRound + 1}`}
          subtitle={complete ? plugin.name : `${cardCount} cards per hand`}
          onBack={handleEndGame}
        />

        <Scoreboard gameState={gameState} />

        {error && <div className={styles.error}>{error}</div>}

        {!complete && !isRoundComplete && currentPlayer && (
          <div className={styles.gameActions}>
            <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/heic,image/heif" capture="environment" onChange={handlePhoto} className={styles.hidden} />

            <ActionButton onClick={() => fileRef.current?.click()}>
              Scan Hand for {currentPlayer.name}
            </ActionButton>

            {showTestButton && (
              <div className={styles.testSection}>
                <select value={selectedTestImage} onChange={(e) => setSelectedTestImage(e.target.value)} className={styles.testSelect}>
                  {TEST_IMAGES.map((img) => (
                    <option key={img.path} value={img.path}>{img.label}</option>
                  ))}
                </select>
                <ActionButton variant="secondary" onClick={handleTestImage}>
                  Test for {currentPlayer.name}
                </ActionButton>
              </div>
            )}
          </div>
        )}

        {!complete && isRoundComplete && (
          <div className={styles.gameActions}>
            <ActionButton onClick={handleNextRound}>Next Round</ActionButton>
          </div>
        )}

        {complete && (
          <div className={styles.gameActions}>
            <ActionButton onClick={handleEndGame}>Home</ActionButton>
          </div>
        )}
      </div>
    );
  }

  // --- Score screen ---
  if (screen === 'score' && scored) {
    const validWords = scored.words.filter((w) => !w.unused);
    const unusedWords = scored.words.filter((w) => w.unused);

    const scoreTitle = isGameMode && gameState
      ? `Round ${gameState.currentRound + 1} - ${gameState.players[gameState.currentPlayerIdx].name}`
      : 'Score';
    const scoreSubtitle = isGameMode && gameState
      ? `${CARDS_PER_ROUND[gameState.currentRound]} cards`
      : plugin.name;

    return (
      <div className={styles.container}>
        <Header
          title={scoreTitle}
          subtitle={scoreSubtitle}
          onBack={() => {
            setScored(null);
            setWordGroups([]);
            setScreen(isGameMode ? 'game' : 'home');
          }}
        />

        <div className={styles.scoreDisplay}>
          <div className={styles.bigScore}>{scored.total}</div>
          <div className={styles.scoreLabel}>total points</div>

          <div className={styles.scoreBreakdown}>
            <div className={styles.breakdownRow}>
              <span className={styles.breakdownLabel}>Words</span>
              <span className={styles.breakdownValue}>+{scored.wordPoints}</span>
            </div>
            {scored.unusedPoints > 0 && (
              <div className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>Unused cards</span>
                <span className={styles.breakdownValueNeg}>-{scored.unusedPoints}</span>
              </div>
            )}
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{scored.wordCount}</div>
              <div className={styles.statLabel}>words</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{scored.longest?.letters || 0}</div>
              <div className={styles.statLabel}>longest</div>
            </div>
          </div>
        </div>

        {validWords.length > 0 && (
          <>
            <div className={styles.sectionTitle}>Words</div>
            <div className={styles.wordList}>
              {validWords.map((w, i) => (
                <WordRow key={i} cards={w.cards} plugin={plugin} isValid={w.valid} onEditWord={() => setEditingIdx(findWordGroupIndex(w))} />
              ))}
            </div>
          </>
        )}

        {unusedWords.length > 0 && (
          <>
            <div className={styles.sectionTitle}>Unused Cards</div>
            <div className={styles.wordList}>
              {unusedWords.map((w, i) => (
                <WordRow key={`unused-${i}`} cards={w.cards} plugin={plugin} unused onEditWord={() => setEditingIdx(findWordGroupIndex(w))} />
              ))}
            </div>
          </>
        )}

        {isGameMode ? (
          <ActionButton onClick={handleContinueAfterScore}>Continue</ActionButton>
        ) : (
          <ActionButton onClick={() => { setWordGroups([]); setScored(null); setError(null); setScreen('home'); }}>
            New Hand
          </ActionButton>
        )}

        {editingIdx !== null && wordGroups[editingIdx] && (
          <EditWordModal cards={wordGroups[editingIdx]} plugin={plugin} onSave={handleEditSave} onCancel={() => setEditingIdx(null)} onDelete={handleEditDelete} />
        )}
      </div>
    );
  }

  return <div className={styles.container}><p>Loading...</p></div>;
}
