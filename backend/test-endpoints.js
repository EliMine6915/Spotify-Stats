import express from 'express';

const app = express();
const PORT = 3002;

app.get('/test', (req, res) => {
  res.json({ message: 'Test endpoint works!' });
});

app.get('/api/top/tracks', (req, res) => {
  console.log('=== /api/top/tracks endpoint called ===');
  res.json({ message: 'Top tracks endpoint works!' });
});

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  /test');
  console.log('  GET  /api/top/tracks');
});
