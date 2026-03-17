import { useState, useEffect, useRef, useCallback } from 'react';
import type { GamePlugin, WordResult, ScoreResult } from './types';
import { QuiddlerPlugin } from './plugins/QuiddlerPlugin';
import { loadDictionary } from './services/dictionary';
import { analyzeCards } from './services/visionApi';
import { loadTestImage } from './utils/imageLoader';
import { ActionButton, EditWordModal, Header, WordRow } from './components';
import styles from './App.module.css';

type Screen = 'home' | 'processing' | 'review' | 'summary';

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
  const [autoScore, setAutoScore] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [scored, setScored] = useState<ScoreResult & { words: (WordResult & { valid?: boolean })[] } | null>(null);
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

  const processImage = async (base64: string) => {
    const words = await analyzeCards(base64, plugin);
    setWordGroups(words.map((w) => w.map((c) => c.toUpperCase())));

    if (autoScore) {
      const results = plugin.scoreHand(words);
      const validated = results.words.map((w) => ({
        ...w,
        valid: validateWord(w.cards),
      }));
      setScored({ ...results, words: validated });
      setScreen('summary');
    } else {
      setScreen('review');
    }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('File selected:', file.name, file.type, file.size);

    // Check file size (warn if > 10MB for mobile)
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
        
        // Add timeout for mobile
        const timeout = setTimeout(() => {
          rej(new Error("File reading timeout - file may be too large"));
        }, 30000); // 30 second timeout
        
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
      // Reset file input so same file can be selected again
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

  const doScore = () => {
    const validGroups = wordGroups.filter((g) => g.length >= 2);
    const results = plugin.scoreHand(validGroups);
    const validated = results.words.map((w) => ({
      ...w,
      valid: validateWord(w.cards),
    }));
    setScored({ ...results, words: validated });
    setScreen('summary');
  };

  const addNewWord = () => {
    setWordGroups([...wordGroups, []]);
    setEditingIdx(wordGroups.length);
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
                <div className={styles.settingTitle}>Auto-score</div>
                <div className={styles.settingDesc}>Skip review step</div>
              </div>
              <button
                onClick={() => setAutoScore(!autoScore)}
                className={`${styles.toggle} ${autoScore ? styles.toggleOn : ''}`}
              >
                <div className={`${styles.toggleKnob} ${autoScore ? styles.toggleKnobOn : ''}`} />
              </button>
            </div>

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

  // Review screen
  if (screen === 'review') {
    return (
      <div className={styles.container}>
        <Header title="Review Hand" subtitle="Check detected cards before scoring" onBack={() => setScreen('home')} />

        <div className={styles.wordList}>
          {wordGroups.map((cards, idx) => (
            <WordRow
              key={idx}
              cards={cards}
              plugin={plugin}
              isValid={validateWord(cards)}
              onEditWord={() => setEditingIdx(idx)}
            />
          ))}
        </div>

        <div className={styles.actions}>
          <ActionButton variant="secondary" onClick={addNewWord}>+ Add Word</ActionButton>
        </div>

        <ActionButton
          onClick={doScore}
          disabled={wordGroups.filter((g) => g.length >= 2).length === 0}
        >
          Score This Hand
        </ActionButton>

        {editingIdx !== null && wordGroups[editingIdx] && (
          <EditWordModal
            cards={wordGroups[editingIdx]}
            plugin={plugin}
            onSave={(newCards) => {
              const updated = [...wordGroups];
              updated[editingIdx] = newCards;
              setWordGroups(updated);
              setEditingIdx(null);
            }}
            onCancel={() => setEditingIdx(null)}
            onDelete={() => {
              setWordGroups(wordGroups.filter((_, i) => i !== editingIdx));
              setEditingIdx(null);
            }}
          />
        )}
      </div>
    );
  }

  // Summary screen
  if (screen === 'summary' && scored) {
    const invalidWords = scored.words.filter((w) => w.valid === false);
    const validTotal = scored.words
      .filter((w) => w.valid !== false)
      .reduce((s, w) => s + w.points, 0);

    return (
      <div className={styles.container}>
        <Header title="Score" subtitle={plugin.name} onBack={() => setScreen('review')} />

        <div className={styles.scoreDisplay}>
          <div className={styles.bigScore}>{validTotal}</div>
          <div className={styles.scoreLabel}>points from valid words</div>

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

        <div className={styles.sectionTitle}>Word Breakdown</div>

        <div className={styles.wordList}>
          {scored.words.map((w, i) => (
            <WordRow key={i} cards={w.cards} plugin={plugin} isValid={w.valid} />
          ))}
        </div>

        {invalidWords.length > 0 && (
          <div className={styles.warning}>
            {invalidWords.length} word{invalidWords.length > 1 ? "s" : ""} not found in SOWPODS dictionary.
            Points shown but excluded from total.
          </div>
        )}

        <div className={styles.actions}>
          <ActionButton variant="secondary" onClick={() => setScreen('review')}>
            Edit
          </ActionButton>
          <ActionButton onClick={() => {
            setWordGroups([]);
            setScored(null);
            setError(null);
            setScreen('home');
          }}>
            New Hand
          </ActionButton>
        </div>
      </div>
    );
  }

  return <div className={styles.container}><p>Loading…</p></div>;
}
