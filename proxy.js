import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Anthropic API proxy endpoint
app.post('/api/anthropic/v1/messages', async (req, res) => {
  const apiKey = process.env.VITE_VISION_API_KEY;
  
  if (!apiKey) {
    console.error('VITE_VISION_API_KEY not set');
    return res.status(500).json({ 
      error: 'Server configuration error: API key not configured' 
    });
  }

  try {
    console.log('Proxying request to Anthropic API...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, data);
      return res.status(response.status).json(data);
    }

    console.log('Successfully proxied request');
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Failed to proxy request to Anthropic API',
      message: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    apiConfigured: !!process.env.VITE_VISION_API_KEY
  });
});

const PORT = process.env.PROXY_PORT || 3001;

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log('API key configured:', !!process.env.VITE_VISION_API_KEY);
});
