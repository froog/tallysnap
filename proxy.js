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
    // Log the request details
    console.log('\n=== REQUEST TO ANTHROPIC ===');
    console.log('Model:', req.body.model);
    console.log('Max tokens:', req.body.max_tokens);
    
    const message = req.body.messages?.[0];
    const imageContent = message?.content?.find(c => c.type === 'image');
    if (imageContent?.source?.data) {
      const dataLength = imageContent.source.data.length;
      const sizeMB = (dataLength * 3 / 4 / 1024 / 1024).toFixed(2);
      console.log('Image size:', `${sizeMB}MB (${dataLength} chars)`);
      console.log('Image type:', imageContent.source.media_type);
    }
    
    console.log('\nRequest body preview (truncated):');
    const bodyPreview = JSON.stringify(req.body, (key, value) => {
      if (key === 'data' && typeof value === 'string' && value.length > 100) {
        return `[${value.length} chars - truncated]`;
      }
      return value;
    }, 2);
    console.log(bodyPreview);
    console.log('=== END REQUEST ===\n');
    
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
    
    console.log('\n=== RESPONSE FROM ANTHROPIC ===');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('=== END RESPONSE ===\n');
    
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, data);
      return res.status(response.status).json(data);
    }

    console.log('Successfully proxied request\n');
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
