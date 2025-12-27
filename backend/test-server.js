import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002; // Anderer Port zum Testen

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
  console.log('Root route hit!');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler (MUSS am Ende stehen!)
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

app.listen(PORT, () => {
  console.log(`Test server running on http://127.0.0.1:${PORT}`);
});