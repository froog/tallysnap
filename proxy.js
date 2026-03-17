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
    console.error('ERROR: VITE_VISION_API_KEY not set');
    return res.status(500).json({ 
      error: 'Server configuration error: API key not configured' 
    });
  }

  try {
    // Log the size of the image being sent
    const message = req.body.messages?.[0];
    const imageContent = message?.content?.find(c => c.type === 'image');
    if (imageContent?.source?.data) {
      const dataLength = imageContent.source.data.length;
      const sizeMB = (dataLength * 3 / 4 / 1024 / 1024).toFixed(2);
      console.log(`Proxying image to Anthropic: ${sizeMB}MB (${dataLength} chars)`);
    }
    
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
const HOST = '0.0.0.0'; // Bind to all interfaces for mobile access

app.listen(PORT, HOST, () => {
  console.log(`Proxy server running on http://${HOST}:${PORT}`);
  console.log('API key configured:', !!process.env.VITE_VISION_API_KEY);
});
