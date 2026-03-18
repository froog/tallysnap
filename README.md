# TallySnap

A card game scoring app that uses AI vision to scan and score your cards.

## Features

- Scan cards using your camera or upload images
- Automatic card detection and word validation
- Multi-player score tracking with round-by-round totals
- Bonus point tracking

## Supported Games

- **Quiddler** - Full support with SOWPODS dictionary validation

More games coming soon!

## Getting Started

### Prerequisites

- Node.js 18+

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env` file with your Anthropic API key:

```
VITE_VISION_API_KEY=your_api_key_here
```

### Running

```bash
npm start
```

Or for development with hot reload:

```bash
npm run dev
```

## Scripts

- `npm start` - Start the app
- `npm run dev` - Development server with hot reload
- `npm run build` - Build for production
- `npm test` - Run tests
