import { useState, useEffect, useRef, useCallback } from 'react';
import type { GamePlugin, WordResult, ScoreResult } from './types';
import { QuiddlerPlugin } from './plugins/QuiddlerPlugin';
import { loadDictionary } from './services/dictionary';
import { analyzeCards } from './services/visionApi';
import { loadTestImage } from './utils/imageLoader';
import { ActionButton, EditWordModal, Header, WordRow } from './components';
import styles from './App.module.css';

type Screen = 'home' | 'processing' | 'score';

const TEST_IMAGES = [
  { label: "AGED, EH, THAT", path: "/test-images/aged-eh-that.jpeg" },
  { label: "AT, THE, EDH", path: "/test-images/at-the-edh.jpeg" },
  { label: "QUEER, CLOY, A, T", path: "/test-images/queer-cloy-a-t.jpeg" },
  { label: "THAT, CLOY, ZRE", path: "/test-images/that-cloy-zre.jpeg" },
];

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

    const wPoints = validated
      .filter((w) => !w.unused)
      .reduce((s, w) => s + w.points, 0);
    const uPoints = validated
      .filter((w) => w.unused)
      .reduce((s, w) => s + w.points, 0);
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
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('File selected:', file.name, file.type, file.size);

    if (file.size > 10 * 1024 * 1024) {
      console.warn('Large file detected:', file.size);
    }

    setProcessing(true);
    setError(null);
    setScreen('processing');

    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = (e) => {
          console.error('FileReader error:', e);
          rej(new Error(`Failed to read file: ${e}`));
        };
        r.onabort = () => rej(new Error("File reading aborted"));
        
        const timeout = setTimeout(() => {
          rej(new Error("File reading timeout - file may be too large"));
        }, 30000);
        
        r.onloadend = () => clearTimeout(timeout);
        
        try {
          r.readAsDataURL(file);
        } catch (err) {
          clearTimeout(timeout);
          rej(new Error(`Error starting file read: ${err}`));
        }
      });

      console.log('File read successfully, size:', base64.length);
      await processImage(base64);
    } catch (err) {
      console.error('Error in handlePhoto:', err);
      const errorMsg = (err as Error).message || "Failed to analyze image";
      setError(`Photo error: ${errorMsg}`);
      setScreen('home');
    } finally {
      setProcessing(false);
      if (fileRef.current) {
        fileRef.current.value = '';
      }
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
      setScreen('home');
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

  // Find the original wordGroups index for a scored word
  const findWordGroupIndex = (scoredWord: WordResult) => {
    return wordGroups.findIndex((g) => 
      g.length === scoredWord.cards.length && 
      g.every((c, i) => c === scoredWord.cards[i])
    );
  };

  // Home screen
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

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/heic,image/heif"
              capture="environment"
              onChange={handlePhoto}
              className={styles.hidden}
            />

            <ActionButton onClick={() => fileRef.current?.click()}>
              📷 Scan Hand
            </ActionButton>

            {showTestButton && (
              <div className={styles.testSection}>
                <select
                  value={selectedTestImage}
                  onChange={(e) => setSelectedTestImage(e.target.value)}
                  className={styles.testSelect}
                >
                  {TEST_IMAGES.map((img) => (
                    <option key={img.path} value={img.path}>{img.label}</option>
                  ))}
                </select>
                <ActionButton 
                  variant="secondary" 
                  onClick={handleTestImage}
                >
                  🧪 Test Image
                </ActionButton>
              </div>
            )}
          </div>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <div className={styles.settings}>
            <div className={styles.setting}>
              <div>
                <div className={styles.settingTitle}>Dictionary</div>
                <div className={styles.settingDesc}>SOWPODS (international)</div>
              </div>
              <span className={`${styles.badge} ${dictLoading ? styles.badgeLoading : styles.badgeOk}`}>
                {dictLoading ? "Loading…" : `${dictionary?.size?.toLocaleString()} words`}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Processing screen
  if (screen === 'processing') {
    return (
      <div className={`${styles.container} ${styles.centered}`}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <div className={styles.loadingText}>Reading your cards…</div>
          <div className={styles.loadingSubtext}>Identifying letters and word groups</div>
        </div>
      </div>
    );
  }

  // Score screen
  if (screen === 'score' && scored) {
    const validWords = scored.words.filter((w) => !w.unused);
    const unusedWords = scored.words.filter((w) => w.unused);

    return (
      <div className={styles.container}>
        <Header title="Score" subtitle={plugin.name} onBack={() => setScreen('home')} />

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
                <WordRow 
                  key={i} 
                  cards={w.cards} 
                  plugin={plugin} 
                  isValid={w.valid}
                  onEditWord={() => setEditingIdx(findWordGroupIndex(w))}
                />
              ))}
            </div>
          </>
        )}

        {unusedWords.length > 0 && (
          <>
            <div className={styles.sectionTitle}>Unused Cards</div>
            <div className={styles.wordList}>
              {unusedWords.map((w, i) => (
                <WordRow 
                  key={`unused-${i}`} 
                  cards={w.cards} 
                  plugin={plugin} 
                  unused
                  onEditWord={() => setEditingIdx(findWordGroupIndex(w))}
                />
              ))}
            </div>
          </>
        )}

        <ActionButton onClick={() => {
          setWordGroups([]);
          setScored(null);
          setError(null);
          setScreen('home');
        }}>
          New Hand
        </ActionButton>

        {editingIdx !== null && wordGroups[editingIdx] && (
          <EditWordModal
            cards={wordGroups[editingIdx]}
            plugin={plugin}
            onSave={handleEditSave}
            onCancel={() => setEditingIdx(null)}
            onDelete={handleEditDelete}
          />
        )}
      </div>
    );
  }

  return <div className={styles.container}><p>Loading…</p></div>;
}
