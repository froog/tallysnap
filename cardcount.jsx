import React, { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// QUIDDLER GAME PLUGIN
// ============================================================
const QuiddlerPlugin = {
  name: "Quiddler",
  cardTable: {
    A: 2, B: 8, C: 8, D: 5, E: 2, F: 6, G: 6, H: 7,
    I: 2, J: 13, K: 8, L: 3, M: 5, N: 5, O: 2, P: 6,
    Q: 15, R: 5, S: 3, T: 3, U: 4, V: 11, W: 10, X: 12,
    Y: 4, Z: 14, ER: 7, CL: 10, IN: 7, TH: 9, QU: 9,
  },
  doubleLetters: ["ER", "CL", "IN", "TH", "QU"],
  letterCount(card) {
    return this.doubleLetters.includes(card.toUpperCase()) ? 2 : 1;
  },
  cardPoints(card) {
    return this.cardTable[card.toUpperCase()] ?? 0;
  },
  wordLetterCount(cards) {
    return cards.reduce((sum, c) => sum + this.letterCount(c), 0);
  },
  wordPoints(cards) {
    return cards.reduce((sum, c) => sum + this.cardPoints(c), 0);
  },
  scoreHand(wordGroups) {
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
  visionPrompt: `You are analyzing a photo of Quiddler card game cards laid out on a surface.

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
Double-letter cards should be returned as their combo: "TH" not "T","H" when it's a single card.`,
};

// ============================================================
// SOWPODS DICTIONARY
// ============================================================
const SOWPODS_URLS = [
  "https://raw.githubusercontent.com/jesstess/Scrabble/master/scrabble/sowpods.txt",
  "https://raw.githubusercontent.com/benhoyt/boggle/master/word-list.txt",
];

async function loadDictionary() {
  const errors = [];
  
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
      errors.push(`${url}: ${err.message}`);
    }
  }
  
  console.error("Failed to load dictionary from all sources:", errors);
  return new Set();
}

// ============================================================
// TEST HARNESS - Load image from filesystem
// ============================================================
async function loadTestImage(imagePath) {
  // For Node.js environment
  if (typeof window === 'undefined') {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const { dirname } = path;
    
    // Resolve relative to project root
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const fullPath = imagePath.startsWith('/') 
      ? path.join(__dirname, 'public', imagePath)
      : imagePath;
      
    const imageBuffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const base64 = imageBuffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }
  
  // For browser environment - fetch from public path
  // Path should start with / for Vite public directory
  // Add cache-busting timestamp to avoid 304 Not Modified
  const cacheBuster = `?_=${Date.now()}`;
  const response = await fetch(imagePath + cacheBuster);
  if (!response.ok) {
    throw new Error(`Failed to load test image: ${response.status} ${response.statusText}`);
  }
  
  // Verify we got an image, not HTML
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.startsWith('image/')) {
    throw new Error(`Expected image but got ${contentType}. Make sure image is in public/ directory.`);
  }
  
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================================
// IMAGE COMPRESSION
// ============================================================
async function compressImage(base64DataUrl, maxSizeMB = 4.5) {
  // Calculate current size (base64 is ~4/3 of binary size)
  const currentSizeBytes = Math.ceil((base64DataUrl.length * 3) / 4);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (currentSizeBytes <= maxSizeBytes) {
    return base64DataUrl;
  }
  
  console.log(`Compressing image: ${(currentSizeBytes / 1024 / 1024).toFixed(2)}MB → target ${maxSizeMB}MB`);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate initial scale factor based on target size
      const scaleFactor = Math.sqrt(maxSizeBytes / currentSizeBytes);
      let width = Math.max(800, Math.floor(img.width * scaleFactor));
      let height = Math.max(600, Math.floor(img.height * scaleFactor));
      let quality = 0.9;
      
      const tryCompress = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const compressed = canvas.toDataURL('image/jpeg', quality);
        const compressedSize = Math.ceil((compressed.length * 3) / 4);
        
        if (compressedSize <= maxSizeBytes) {
          console.log(`Compressed to: ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${width}x${height}, q=${quality})`);
          resolve(compressed);
        } else if (quality > 0.6) {
          // Try reducing quality first
          quality -= 0.1;
          tryCompress();
        } else if (width > 800 && height > 600) {
          // Then reduce dimensions
          quality = 0.8;
          width = Math.floor(width * 0.9);
          height = Math.floor(height * 0.9);
          tryCompress();
        } else {
          // Minimum size reached
          console.warn(`Cannot compress below ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
          resolve(compressed);
        }
      };
      
      tryCompress();
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = base64DataUrl;
  });
}

// ============================================================
// VISION API
// ============================================================
async function analyzeCards(base64Image, plugin) {
  // Compress if needed (Anthropic has 5MB limit)
  const compressedImage = await compressImage(base64Image, 4.5);
  
  const mediaType = compressedImage.startsWith("data:image/png") ? "image/png" : "image/jpeg";
  const cleanBase64 = compressedImage.replace(/^data:image\/\w+;base64,/, "");
  const model = import.meta.env.VITE_VISION_MODEL || "claude-sonnet-4-20250514";
  
  // API key is handled by the proxy server, not sent to client
  const apiUrl = "http://localhost:3001/api/anthropic/v1/messages";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: cleanBase64 },
            },
            { type: "text", text: plugin.visionPrompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.map((b) => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    console.error("Failed to parse vision response:", text);
    throw new Error("Invalid response format from vision API. Expected JSON with 'words' array.");
  }
  
  if (!parsed.words || !Array.isArray(parsed.words)) {
    throw new Error("Invalid response format: missing 'words' array");
  }
  
  return parsed.words;
}

// ============================================================
// STYLES
// ============================================================
const palette = {
  bg: "#1a1915",
  surface: "#252219",
  card: "#2f2b22",
  cardHover: "#3a3529",
  accent: "#c9a84c",
  accentDim: "#8a7233",
  text: "#e8e0d0",
  textDim: "#9a917e",
  valid: "#5b8c5a",
  validBg: "#2a3529",
  invalid: "#c45c4a",
  invalidBg: "#352a28",
  border: "#3d3728",
};

// ============================================================
// COMPONENTS
// ============================================================

function CardChip({ letter, points, onRemove }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: `linear-gradient(135deg, ${palette.card}, ${palette.cardHover})`,
        border: `1px solid ${palette.border}`,
        borderRadius: 8, padding: "6px 10px",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 18, fontWeight: 700, color: palette.accent,
        position: "relative",
      }}
    >
      {letter}
      <span style={{ fontSize: 11, color: palette.textDim, fontWeight: 400 }}>{points}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            background: "none", border: "none", color: palette.invalid,
            cursor: "pointer", fontSize: 14, padding: "0 0 0 4px", lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

function WordRow({ cards, plugin, isValid, onRemoveCard, onEditWord }) {
  const points = plugin.wordPoints(cards);
  const word = cards.map((c) => c.toUpperCase()).join("");
  const letterCount = plugin.wordLetterCount(cards);

  return (
    <div
      style={{
        background: isValid === false ? palette.invalidBg : isValid === true ? palette.validBg : palette.surface,
        border: `1px solid ${isValid === false ? palette.invalid + "44" : isValid === true ? palette.valid + "44" : palette.border}`,
        borderRadius: 12, padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {cards.map((c, i) => (
            <CardChip
              key={i}
              letter={c.toUpperCase()}
              points={plugin.cardPoints(c)}
              onRemove={onRemoveCard ? () => onRemoveCard(i) : undefined}
            />
          ))}
        </div>
        <div style={{ textAlign: "right", minWidth: 60 }}>
          <div style={{
            fontSize: 22, fontWeight: 700, color: palette.accent,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
          }}>
            {points}
          </div>
          <div style={{ fontSize: 11, color: palette.textDim }}>{letterCount} letters</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 13, fontWeight: 600, letterSpacing: 1,
          color: isValid === false ? palette.invalid : isValid === true ? palette.valid : palette.textDim,
          textTransform: "uppercase",
        }}>
          {word} {isValid === true ? "✓" : isValid === false ? "✗ not in dictionary" : "…"}
        </span>
        {onEditWord && (
          <button
            onClick={onEditWord}
            style={{
              background: "none", border: `1px solid ${palette.border}`,
              color: palette.textDim, borderRadius: 6, padding: "4px 10px",
              fontSize: 12, cursor: "pointer",
            }}
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

function ActionButton({ onClick, children, variant = "primary", disabled, style: extraStyle }) {
  const styles = {
    primary: {
      background: `linear-gradient(135deg, ${palette.accent}, ${palette.accentDim})`,
      color: palette.bg, fontWeight: 700,
    },
    secondary: {
      background: "transparent",
      border: `1px solid ${palette.accent}`,
      color: palette.accent, fontWeight: 600,
    },
    ghost: {
      background: "transparent", color: palette.textDim, fontWeight: 500,
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "14px 24px", borderRadius: 12, border: "none",
        fontSize: 16, cursor: disabled ? "not-allowed" : "pointer",
        width: "100%", textAlign: "center",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        letterSpacing: 0.5,
        transition: "all 0.2s ease",
        ...styles[variant],
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}

function Header({ title, subtitle, onBack }) {
  return (
    <div style={{ padding: "20px 0 12px", borderBottom: `1px solid ${palette.border}`, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "none", border: "none", color: palette.accent,
              fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1,
            }}
          >
            ‹
          </button>
        )}
        <div>
          <h1 style={{
            margin: 0, fontSize: 28, fontWeight: 700, color: palette.text,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            letterSpacing: 1,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: 13, color: palette.textDim }}>{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// EDIT WORD MODAL
// ============================================================
function EditWordModal({ cards: initialCards, plugin, onSave, onCancel, onDelete }) {
  const [cards, setCards] = useState([...initialCards]);
  const [newCard, setNewCard] = useState("");

  const addCard = () => {
    const val = newCard.trim().toUpperCase();
    if (val && (plugin.cardTable[val] !== undefined)) {
      setCards([...cards, val]);
      setNewCard("");
    }
  };

  const removeCard = (idx) => setCards(cards.filter((_, i) => i !== idx));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 100, padding: 16,
    }}>
      <div style={{
        background: palette.surface, borderRadius: 16, padding: 20,
        width: "100%", maxWidth: 400, maxHeight: "80vh", overflow: "auto",
        border: `1px solid ${palette.border}`,
      }}>
        <h3 style={{
          margin: "0 0 16px", color: palette.text,
          fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20,
        }}>
          Edit Word
        </h3>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {cards.map((c, i) => (
            <CardChip key={i} letter={c} points={plugin.cardPoints(c)} onRemove={() => removeCard(i)} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            value={newCard}
            onChange={(e) => setNewCard(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && addCard()}
            placeholder="Add card (e.g. T, TH)"
            style={{
              flex: 1, background: palette.card, border: `1px solid ${palette.border}`,
              borderRadius: 8, padding: "10px 12px", color: palette.text, fontSize: 14,
              fontFamily: "'Cormorant Garamond', Georgia, serif", outline: "none",
            }}
          />
          <button
            onClick={addCard}
            style={{
              background: palette.accent, color: palette.bg, border: "none",
              borderRadius: 8, padding: "10px 16px", fontWeight: 700,
              cursor: "pointer", fontSize: 14,
            }}
          >
            +
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <ActionButton variant="ghost" onClick={onDelete} style={{ color: palette.invalid }}>
            Delete Word
          </ActionButton>
          <ActionButton variant="secondary" onClick={onCancel}>Cancel</ActionButton>
          <ActionButton onClick={() => onSave(cards)} disabled={cards.length < 2}>Save</ActionButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function CardCount() {
  const [screen, setScreen] = useState("home");
  const [plugin] = useState(QuiddlerPlugin);
  const [dictionary, setDictionary] = useState(null);
  const [dictLoading, setDictLoading] = useState(true);
  const [dictError, setDictError] = useState(false);
  const [wordGroups, setWordGroups] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [autoScore, setAutoScore] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [scored, setScored] = useState(null);
  const fileRef = useRef(null);

  // Load dictionary
  useEffect(() => {
    setDictLoading(true);
    loadDictionary().then((dict) => {
      if (dict) {
        setDictionary(dict);
      } else {
        setDictError(true);
      }
      setDictLoading(false);
    });
  }, []);

  const validateWord = useCallback(
    (cards) => {
      if (!dictionary) return null;
      const word = cards.map((c) => c.toUpperCase()).join("");
      return dictionary.has(word);
    },
    [dictionary]
  );

  const processImage = async (base64) => {
    const words = await analyzeCards(base64, plugin);
    setWordGroups(words.map((w) => w.map((c) => c.toUpperCase())));

    if (autoScore) {
      const results = plugin.scoreHand(words);
      const validated = results.words.map((w) => ({
        ...w,
        valid: validateWord(w.cards),
      }));
      setScored({ ...results, words: validated });
      setScreen("summary");
    } else {
      setScreen("review");
    }
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setError(null);
    setScreen("processing");

    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error("Failed to read file"));
        r.readAsDataURL(file);
      });

      await processImage(base64);
    } catch (err) {
      setError(err.message || "Failed to analyze image");
      setScreen("home");
    } finally {
      setProcessing(false);
    }
  };

  const handleTestImage = async () => {
    const imagePath = import.meta.env.VITE_TEST_IMAGE_PATH;
    if (!imagePath) {
      setError("No test image path provided. Set VITE_TEST_IMAGE_PATH env var.");
      return;
    }

    setProcessing(true);
    setError(null);
    setScreen("processing");

    try {
      const base64 = await loadTestImage(imagePath);
      await processImage(base64);
    } catch (err) {
      setError(err.message || "Failed to load test image");
      setScreen("home");
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
    setScreen("summary");
  };

  const addNewWord = () => {
    setWordGroups([...wordGroups, []]);
    setEditingIdx(wordGroups.length);
  };

  const containerStyle = {
    maxWidth: 420,
    margin: "0 auto",
    minHeight: "100vh",
    background: palette.bg,
    color: palette.text,
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    padding: "0 20px 40px",
    position: "relative",
  };

  // ---- HOME SCREEN ----
  if (screen === "home") {
    return (
      <div style={containerStyle}>
        <div style={{ paddingTop: 60, textAlign: "center" }}>
          <div style={{
            fontSize: 14, letterSpacing: 4, color: palette.accentDim,
            textTransform: "uppercase", marginBottom: 8,
          }}>
            Card Game Scorer
          </div>
          <h1 style={{
            fontSize: 48, fontWeight: 700, color: palette.accent, margin: "0 0 4px",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            letterSpacing: 2,
          }}>
            CardCount
          </h1>
          <p style={{ color: palette.textDim, fontSize: 15, margin: "0 0 48px" }}>
            Snap your hand. Get your score.
          </p>

          <div style={{
            background: palette.surface, borderRadius: 16, padding: 24,
            border: `1px solid ${palette.border}`, marginBottom: 24,
          }}>
            <div style={{
              fontSize: 12, textTransform: "uppercase", letterSpacing: 2,
              color: palette.textDim, marginBottom: 12,
            }}>
              Current Game
            </div>
            <div style={{
              fontSize: 24, fontWeight: 700, color: palette.text, marginBottom: 20,
            }}>
              {plugin.name}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              style={{ display: "none" }}
            />

            <ActionButton onClick={() => fileRef.current?.click()}>
              📷 Scan Hand
            </ActionButton>

            {showTestButton && (
              <ActionButton 
                variant="secondary" 
                onClick={handleTestImage}
                style={{ marginTop: 12 }}
              >
                🧪 Test Image
              </ActionButton>
            )}
          </div>

          {error && (
            <div style={{
              background: palette.invalidBg, border: `1px solid ${palette.invalid}44`,
              borderRadius: 12, padding: 16, marginBottom: 24, fontSize: 14,
              color: palette.invalid, textAlign: "left",
            }}>
              {error}
            </div>
          )}

          {/* Settings */}
          <div style={{
            background: palette.surface, borderRadius: 16, padding: 20,
            border: `1px solid ${palette.border}`,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: palette.text }}>Auto-score</div>
                <div style={{ fontSize: 12, color: palette.textDim }}>Skip review step</div>
              </div>
              <button
                onClick={() => setAutoScore(!autoScore)}
                style={{
                  width: 48, height: 28, borderRadius: 14, border: "none",
                  background: autoScore ? palette.accent : palette.card,
                  cursor: "pointer", position: "relative",
                  transition: "background 0.2s",
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 11,
                  background: autoScore ? palette.bg : palette.textDim,
                  position: "absolute", top: 3,
                  left: autoScore ? 23 : 3,
                  transition: "left 0.2s",
                }} />
              </button>
            </div>

            <div style={{
              marginTop: 16, paddingTop: 16, borderTop: `1px solid ${palette.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: palette.text }}>Dictionary</div>
                <div style={{ fontSize: 12, color: palette.textDim }}>SOWPODS (international)</div>
              </div>
              <span style={{
                fontSize: 12, padding: "4px 10px", borderRadius: 8,
                background: dictLoading ? palette.card : dictError ? palette.invalidBg : palette.validBg,
                color: dictLoading ? palette.textDim : dictError ? palette.invalid : palette.valid,
              }}>
                {dictLoading ? "Loading…" : dictError ? "Failed" : `${dictionary?.size?.toLocaleString()} words`}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- PROCESSING SCREEN ----
  if (screen === "processing") {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, border: `3px solid ${palette.border}`,
            borderTopColor: palette.accent, borderRadius: "50%",
            margin: "0 auto 24px",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontSize: 18, color: palette.text, fontWeight: 600 }}>Reading your cards…</div>
          <div style={{ fontSize: 14, color: palette.textDim, marginTop: 4 }}>
            Identifying letters and word groups
          </div>
        </div>
      </div>
    );
  }

  // ---- REVIEW SCREEN ----
  if (screen === "review") {
    return (
      <div style={containerStyle}>
        <Header title="Review Hand" subtitle="Check detected cards before scoring" onBack={() => setScreen("home")} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
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

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
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

  // ---- SUMMARY SCREEN ----
  if (screen === "summary" && scored) {
    const invalidWords = scored.words.filter((w) => w.valid === false);
    const validTotal = scored.words
      .filter((w) => w.valid !== false)
      .reduce((s, w) => s + w.points, 0);

    return (
      <div style={containerStyle}>
        <Header title="Score" subtitle={plugin.name} onBack={() => setScreen("review")} />

        {/* Big score */}
        <div style={{
          textAlign: "center", padding: "24px 0 32px",
          borderBottom: `1px solid ${palette.border}`, marginBottom: 24,
        }}>
          <div style={{
            fontSize: 72, fontWeight: 700, color: palette.accent,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            lineHeight: 1,
          }}>
            {validTotal}
          </div>
          <div style={{ fontSize: 14, color: palette.textDim, marginTop: 4 }}>
            points from valid words
          </div>

          <div style={{
            display: "flex", justifyContent: "center", gap: 32, marginTop: 20,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: palette.text }}>{scored.wordCount}</div>
              <div style={{ fontSize: 12, color: palette.textDim }}>words</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: palette.text }}>
                {scored.longest?.letters || 0}
              </div>
              <div style={{ fontSize: 12, color: palette.textDim }}>longest</div>
            </div>
          </div>
        </div>

        {/* Word breakdown */}
        <div style={{
          fontSize: 12, textTransform: "uppercase", letterSpacing: 2,
          color: palette.textDim, marginBottom: 12,
        }}>
          Word Breakdown
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {scored.words.map((w, i) => (
            <WordRow key={i} cards={w.cards} plugin={plugin} isValid={w.valid} />
          ))}
        </div>

        {invalidWords.length > 0 && (
          <div style={{
            background: palette.invalidBg, border: `1px solid ${palette.invalid}44`,
            borderRadius: 12, padding: 16, marginBottom: 24, fontSize: 14,
            color: palette.invalid,
          }}>
            {invalidWords.length} word{invalidWords.length > 1 ? "s" : ""} not found in SOWPODS dictionary.
            Points shown but excluded from total.
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <ActionButton variant="secondary" onClick={() => setScreen("review")}>
            Edit
          </ActionButton>
          <ActionButton onClick={() => {
            setWordGroups([]);
            setScored(null);
            setError(null);
            setScreen("home");
          }}>
            New Hand
          </ActionButton>
        </div>
      </div>
    );
  }

  return <div style={containerStyle}><p>Loading…</p></div>;
}
