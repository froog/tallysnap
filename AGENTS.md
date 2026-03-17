# AGENTS.md - Coding Guidelines for CardCount

## Build & Run Commands

```bash
# Development
npm start                          # Start dev server
npm start -- --test-button         # Start with test image button
npm start -- -t                    # Short flag for test button
npm run dev                        # Start Vite dev server directly

# Build & Preview
npm run build                      # Build for production
npm run preview                    # Preview production build

# Environment Variables (Server-side only - NEVER expose to client)
VITE_VISION_API_KEY=xxx            # Anthropic API key (used by proxy, never sent to browser)
VITE_VISION_MODEL=claude-sonnet-4-20250514  # Optional: vision model

# Environment Variables (Client-side)
VITE_TEST_BUTTON=true              # Set by --test-button flag
VITE_TEST_IMAGE_PATH=tests/image.jpeg  # Optional: default test image
```

## Code Style Guidelines

### Project Structure
- Single-file React app: `cardcount.jsx` (~850 lines)
- Helper scripts: `scripts/start.js`
- Test images: `tests/`
- No CSS files - use inline styles with `palette` object

### JavaScript/React Conventions
- **ES Modules only** (`"type": "module"` in package.json)
- **Functional components** with hooks (useState, useEffect, useRef, useCallback)
- **Inline styles** - no CSS files, use the `palette` object for colors
- **Named exports** for components: `export default function CardCount()`

### Naming Conventions
- **Components**: PascalCase (e.g., `CardChip`, `WordRow`, `ActionButton`)
- **Functions**: camelCase (e.g., `loadDictionary`, `analyzeCards`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `SOWPODS_URLS`)
- **Variables**: camelCase, descriptive names
- **Environment variables**: UPPER_SNAKE_CASE

### Code Organization
```javascript
// 1. Imports
import { useState, useEffect } from "react";

// 2. Constants & Configuration
const SOWPODS_URLS = [...];
const palette = { bg: "#1a1915", ... };

// 3. Helper functions (async first)
async function loadDictionary() { ... }
async function analyzeCards() { ... }

// 4. Component functions (small to large)
function CardChip() { ... }
function WordRow() { ... }

// 5. Main App component
export default function CardCount() { ... }
```

### Error Handling
- Always check API responses: `if (!response.ok) throw new Error(...)`
- Wrap JSON.parse in try/catch with descriptive errors
- Use console.error for debugging, console.log for info
- Set error state for UI display

### Environment Variables
- Check required vars at runtime: `if (!apiKey) throw new Error("VISION_API_KEY required")`
- Provide sensible defaults where appropriate
- Use process.env for Node scripts and build-time values

### Styling Pattern
```javascript
const palette = {
  bg: "#1a1915",
  surface: "#252219",
  accent: "#c9a84c",
  text: "#e8e0d0",
  // ...
};

// Use inline styles with palette
<div style={{ background: palette.surface, color: palette.text }}>
```

### State Management
- Use React hooks (useState, useCallback)
- Lift state to parent when needed
- Keep component props minimal

### Testing
- Test button available with: `npm start -- --test-button`
- Loads image from `TEST_IMAGE_PATH` env var
- Default test image: `tests/aged-eh-that.jpeg`

### Component Patterns
```javascript
// Small presentational components
function CardChip({ letter, points, onRemove }) {
  return (
    <span style={{ background: palette.card, ... }}>
      {letter}
      {onRemove && <button onClick={onRemove}>×</button>}
    </span>
  );
}

// Components with state
function EditWordModal({ cards, plugin, onSave, onCancel }) {
  const [localCards, setLocalCards] = useState([...cards]);
  // ...
}
```

### Async Patterns
```javascript
// Always handle loading and error states
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

const handleAction = async () => {
  setLoading(true);
  setError(null);
  try {
    const result = await asyncOperation();
    setData(result);
  } catch (err) {
    setError(err.message);
    console.error("Operation failed:", err);
  } finally {
    setLoading(false);
  }
};
```

### File Processing Pattern
```javascript
// Convert File to base64
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};
```

## Git Workflow

```bash
# Make changes
git add <files>
git commit -m "descriptive message"

# No push - user handles this manually
```

## Important Notes
- No linting/testing setup currently (no eslint, jest, etc.)
- Single-file architecture - keep additions organized
- Vision API uses Claude with base64 image encoding
- Supports both browser and Node.js environments for test image loading
- Use `npm start -- --test-button` for rapid development iteration


## TODO List

### Testing & Test Data
- [ ] Add more test images with valid and invalid words
  - Valid word scenarios: CAT+DOG, THE+QUICK, long words like QUIZZES
  - Invalid word scenarios: XYZ+ABC, mixed valid/invalid
  - Edge cases: Short words, max cards, double-letter heavy hands
- [ ] Fix vision API double-letter recognition (TH detected as T,H)
  - Improve prompt to emphasize double-letter cards more strongly
  - Add examples of TH, QU, IN, ER, CL detection
  - Consider post-processing to merge T+H into TH when adjacent

### Definition Feature Improvements
- [ ] Cache definitions to avoid repeated API calls
- [ ] Add loading shimmer/skeleton while definition loads
- [ ] Handle long definitions with truncation + expand
- [ ] Add pronunciation audio if available
- [ ] Show multiple definitions on tap/click
- [ ] Add part of speech filter

### Mobile Experience
- [ ] Test camera on more iOS devices
- [ ] Add haptic feedback on successful scan
- [ ] Optimize image picker for mobile
- [ ] Test with poor network conditions

### Testing & Quality
- [ ] Add unit tests for dictionaryApi
- [ ] Add integration tests for WordRow component
- [ ] Test with various dictionary API errors
- [ ] Performance profiling with many words

### Future Enhancements
- [ ] Support multiple card games (Scrabble, etc.)
- [ ] Offline mode with cached dictionary
- [ ] Score history/persistence
- [ ] Share results feature

