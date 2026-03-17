import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// Enable CORS for all origins (development only)
app.use(cors());

// Proxy Anthropic API requests
app.use('/api/anthropic', createProxyMiddleware({
  target: 'https://api.anthropic.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/anthropic': '', // Remove /api/anthropic prefix
  },
  onProxyReq: (proxyReq, req, res) => {
    // Log proxy requests in development
    console.log(`Proxying: ${req.method} ${req.path}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error' });
  }
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PROXY_PORT || 3001;

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log('Proxying /api/anthropic to https://api.anthropic.com');
});
