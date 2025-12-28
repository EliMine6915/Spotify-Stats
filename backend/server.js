import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { supabase } from './supabase.js';
import SpotifyHistoryImporter from './importSpotifyHistory.js';
import DataDeduplication from './dataDeduplication.js';
import SpotifyAPI from './spotify.js';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CHECK IF INDEX.HTML EXISTS
const indexPath = path.join(__dirname, 'public', 'index.html');
console.log('========================================');
console.log('Checking index.html:');
console.log('Path:', indexPath);
console.log('Exists:', fs.existsSync(indexPath));
console.log('========================================');

// Express App
const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: ['https://trackify-kayh.onrender.com'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// DEBUG MIDDLEWARE - Log alle Requests
app.use((req, res, next) => {
  console.log('======================');
  console.log('Incoming Request:');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Path:', req.path);
  console.log('======================');
  next();
});

// EXPLICIT ROOT ROUTE
app.get('/', (req, res) => {
  console.log('>>> ROOT ROUTE HIT <<<');
  const indexPath = path.join(__dirname, 'public', 'index.html');
  console.log('Sending file:', indexPath);
  res.sendFile(indexPath);
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html'
}));

// ============================================
// MULTER CONFIGURATION
// ============================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (!file.originalname.startsWith('StreamingHistory') || !file.originalname.endsWith('.json')) {
      return cb(new Error('Invalid filename. Must be StreamingHistory*.json'), false);
    }
    cb(null, true);
  },
});

// ============================================
// SERVICES
// ============================================
const importer = new SpotifyHistoryImporter();
const deduplicator = new DataDeduplication();

// ============================================
// CONFIGURATION
// ============================================
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '9075e748e02649f09227d9b7d2eec38d';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE';
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'https://trackify-kayh.onrender.com/auth/callback';
const SPOTIFY_SCOPES = [
  'user-read-email',
  'user-read-recently-played',
  'user-top-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-top-read'
];

// Validate environment
if (!SPOTIFY_CLIENT_SECRET || SPOTIFY_CLIENT_SECRET === 'YOUR_CLIENT_SECRET_HERE') {
  console.error('ERROR: SPOTIFY_CLIENT_SECRET is required in .env file');
  process.exit(1);
}

const oauthSessions = new Map();
const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

// ============================================
// HELPER FUNCTIONS
// ============================================
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

function validateRange(range) {
  const validRanges = [7, 30, 90];
  const rangeNum = parseInt(range) || 7;
  return validRanges.includes(rangeNum) ? rangeNum : 7;
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// ============================================
// OAUTH ENDPOINTS
// ============================================

// Start OAuth flow
app.get('/auth/login', (req, res) => {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    
    const sessionId = crypto.randomUUID();
    oauthSessions.set(sessionId, {
      codeVerifier,
      state,
      createdAt: Date.now(),
    });

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set('scope', SPOTIFY_SCOPES.join(' '));
    authUrl.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('state', state);

    res.cookie('oauth_session_id', sessionId, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });

    console.log(`OAuth login initiated for session ${sessionId}`);
    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('OAuth login error:', error);
    res.status(500).json({
      error: 'OAuth login failed',
      message: error.message,
    });
  }
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const sessionId = req.cookies.oauth_session_id;

    if (error) {
      console.error('OAuth error:', error);
      return res.redirect(`/?error=${encodeURIComponent(error)}`);
    }

    if (!sessionId || !oauthSessions.has(sessionId)) {
      console.error('Invalid OAuth session');
      return res.redirect('/?error=invalid_session');
    }

    const session = oauthSessions.get(sessionId);
    
    if (state !== session.state) {
      console.error('OAuth state mismatch');
      oauthSessions.delete(sessionId);
      return res.redirect('/?error=state_mismatch');
    }

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        code_verifier: session.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      oauthSessions.delete(sessionId);
      return res.redirect('/?error=token_exchange_failed');
    }

    const tokens = await tokenResponse.json();
    
    const userResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });

    if (!userResponse.ok) {
      console.error('Failed to get user profile');
      oauthSessions.delete(sessionId);
      return res.redirect('/?error=user_profile_failed');
    }

    const userProfile = await userResponse.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    
    // First, insert/update user
    const { error: userDbError } = await supabase
      .from('users')
      .upsert({
        id: userProfile.id,
        email: userProfile.email,
        display_name: userProfile.display_name,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      });

    if (userDbError) {
      console.error('Failed to store user:', userDbError);
      oauthSessions.delete(sessionId);
      return res.redirect('/?error=user_storage_failed');
    }

    // Then, store tokens
    const { error: dbError } = await supabase
      .from('user_tokens')
      .upsert({
        user_id: userProfile.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (dbError) {
      console.error('Failed to store tokens:', dbError);
      oauthSessions.delete(sessionId);
      return res.redirect('/?error=token_storage_failed');
    }

    oauthSessions.delete(sessionId);
    res.clearCookie('oauth_session_id');

    const redirectUrl = `/?login_success=true&user_id=${userProfile.id}&display_name=${encodeURIComponent(userProfile.display_name || userProfile.id)}&image_url=${encodeURIComponent(userProfile.images?.[0]?.url || '')}`;
    console.log(`OAuth login successful for user ${userProfile.id}`);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/?error=callback_failed');
  }
});

// Get current user
app.get('/auth/user', async (req, res) => {
  try {
    res.json({
      user: {
        id: USER_ID,
        display_name: 'Demo User',
        email: 'demo@example.com',
      },
      authenticated: true,
    });
  } catch (error) {
    console.error('Auth user error:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      message: error.message,
    });
  }
});

// Logout
app.post('/auth/logout', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error.message,
    });
  }
});

// ============================================
// API ENDPOINTS
// ============================================

// Get recent plays
app.get('/api/recent', async (req, res) => {
  try {
    const { range } = req.query;
    const days = validateRange(range);
    
    console.log(`Fetching recent plays for last ${days} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('spotify_plays')
      .select('*')
      .eq('user_id', USER_ID)
      .gte('played_at', cutoffDate.toISOString())
      .order('played_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ 
        error: 'Database query failed',
        details: error.message 
      });
    }

    console.log(`Found ${data?.length || 0} plays in the last ${days} days`);

    res.json({
      plays: data || [],
      range: days,
      total: data?.length || 0,
      cutoff_date: cutoffDate.toISOString(),
    });
  } catch (error) {
    console.error('Error in /api/recent:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const { range } = req.query;
    const days = validateRange(range);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('spotify_plays')
      .select('track_id, track_name, artist, album, duration_ms, played_at')
      .eq('user_id', USER_ID)
      .gte('played_at', cutoffDate.toISOString());

    if (error) throw error;

    const plays = data || [];
    const totalPlays = plays.length;
    const totalMinutes = plays.reduce((sum, play) => sum + (play.duration_ms / 60000), 0);
    const uniqueArtists = new Set(plays.map(play => play.artist)).size;
    const uniqueTracks = new Set(plays.map(play => play.track_id)).size;

    const trackCounts = {};
    plays.forEach(play => {
      const key = play.track_id;
      trackCounts[key] = (trackCounts[key] || 0) + 1;
    });
    
    const topTrackId = Object.keys(trackCounts).reduce((a, b) => 
      trackCounts[a] > trackCounts[b] ? a : b, '');
    const topTrack = plays.find(play => play.track_id === topTrackId);

    const dailyStats = {};
    plays.forEach(play => {
      const date = new Date(play.played_at).toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + 1;
    });

    res.json({
      range: days,
      stats: {
        tracksPlayed: totalPlays,
        minutesListened: Math.round(totalMinutes),
        uniqueArtists,
        uniqueTracks,
        topTrack: topTrack ? {
          name: topTrack.track_name,
          artist: topTrack.artist,
          playCount: trackCounts[topTrackId],
        } : null,
      },
      dailyStats,
      total: totalPlays,
    });
  } catch (error) {
    console.error('Error in /api/stats:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get top tracks
app.get('/api/top/tracks', async (req, res) => {
  console.log('=== /api/top/tracks endpoint called ===');
  try {
    const { limit = 20, time_range = 'short_term' } = req.query;
    
    // Get the most recent user tokens from database
    const { data: tokens, error: tokenError } = await supabase
      .from('user_tokens')
      .select('access_token, user_id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (tokenError || !tokens) {
      return res.status(401).json({
        error: 'No Spotify tokens found',
        message: 'Please login with Spotify first'
      });
    }
    
    // Fetch top tracks from Spotify
    const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${time_range}`, {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/top/tracks:', error);
    res.status(500).json({ 
      error: 'Failed to fetch top tracks',
      message: error.message 
    });
  }
});

// Get currently playing track
app.get('/api/currently-playing', async (req, res) => {
  try {
    // Get the most recent user tokens from database
    const { data: tokens, error: tokenError } = await supabase
      .from('user_tokens')
      .select('access_token, user_id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (tokenError || !tokens) {
      return res.status(401).json({
        error: 'No Spotify tokens found',
        message: 'Please login with Spotify first'
      });
    }
    
    // Fetch currently playing track from Spotify
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    
    if (response.status === 204) {
      // No content - nothing is playing
      return res.json({ is_playing: false, item: null });
    }
    
    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/currently-playing:', error);
    res.status(500).json({ 
      error: 'Failed to fetch currently playing track',
      message: error.message 
    });
  }
});

// Player controls
app.put('/api/player/play', async (req, res) => {
  try {
    const { data: tokens } = await supabase
      .from('user_tokens')
      .select('access_token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    const response = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    
    if (!response.ok && response.status !== 204) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/player/play:', error);
    res.status(500).json({ error: 'Failed to play', message: error.message });
  }
});

app.put('/api/player/pause', async (req, res) => {
  try {
    const { data: tokens } = await supabase
      .from('user_tokens')
      .select('access_token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    
    if (!response.ok && response.status !== 204) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/player/pause:', error);
    res.status(500).json({ error: 'Failed to pause', message: error.message });
  }
});

app.post('/api/player/next', async (req, res) => {
  try {
    const { data: tokens } = await supabase
      .from('user_tokens')
      .select('access_token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    const response = await fetch('https://api.spotify.com/v1/me/player/next', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    
    if (!response.ok && response.status !== 204) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/player/next:', error);
    res.status(500).json({ error: 'Failed to skip to next', message: error.message });
  }
});

app.post('/api/player/previous', async (req, res) => {
  try {
    const { data: tokens } = await supabase
      .from('user_tokens')
      .select('access_token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    
    if (!response.ok && response.status !== 204) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/player/previous:', error);
    res.status(500).json({ error: 'Failed to skip to previous', message: error.message });
  }
});

app.put('/api/player/seek', async (req, res) => {
  try {
    const { position_ms } = req.query;
    
    const { data: tokens } = await supabase
      .from('user_tokens')
      .select('access_token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    const response = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${position_ms}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    
    if (!response.ok && response.status !== 204) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/player/seek:', error);
    res.status(500).json({ error: 'Failed to seek', message: error.message });
  }
});

// Get top artists
app.get('/api/top/artists', async (req, res) => {
  try {
    const { limit = 20, time_range = 'short_term' } = req.query;
    
    // Get the most recent user tokens from database
    const { data: tokens, error: tokenError } = await supabase
      .from('user_tokens')
      .select('access_token, user_id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (tokenError || !tokens) {
      return res.status(401).json({
        error: 'No Spotify tokens found',
        message: 'Please login with Spotify first'
      });
    }
    
    // Fetch top artists from Spotify
    const response = await fetch(`https://api.spotify.com/v1/me/top/artists?limit=${limit}&time_range=${time_range}`, {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/top/artists:', error);
    res.status(500).json({ 
      error: 'Failed to fetch top artists',
      message: error.message 
    });
  }
});

// Import Spotify history
app.post('/api/import/spotify-history', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        message: 'Please upload a StreamingHistory*.json file'
      });
    }

    console.log(`Processing upload: ${req.file.originalname} (${req.file.size} bytes)`);

    let data;
    try {
      data = JSON.parse(req.file.buffer.toString('utf-8'));
    } catch (parseError) {
      return res.status(400).json({ 
        error: 'Invalid JSON format',
        message: 'The uploaded file is not a valid JSON file'
      });
    }

    const result = await importer.importStreamingHistory(req.file.originalname, data);

    if (result.success) {
      console.log(`Import successful: ${result.insertedPlays} plays imported from ${result.filename}`);
      res.json({
        success: true,
        message: 'File imported successfully',
        ...result,
      });
    } else {
      console.error(`Import failed: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error,
        message: 'Import failed',
        ...result,
      });
    }
  } catch (error) {
    console.error('Import endpoint error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'Maximum file size is 50MB'
      });
    }

    if (error.message.includes('Invalid filename')) {
      return res.status(400).json({
        error: 'Invalid filename',
        message: error.message
      });
    }

    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get import status
app.get('/api/import/status', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('import_uploads')
      .select('*')
      .eq('user_id', USER_ID)
      .order('uploaded_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    res.json({
      uploads: data || [],
      total: data?.length || 0,
    });
  } catch (error) {
    console.error('Import status error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Run deduplication
app.post('/api/deduplication/run', async (req, res) => {
  try {
    console.log('Starting manual deduplication...');
    const result = await deduplicator.runDeduplication();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Deduplication completed successfully',
        ...result,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Deduplication failed',
      });
    }
  } catch (error) {
    console.error('Deduplication endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get deduplication stats
app.get('/api/deduplication/stats', async (req, res) => {
  try {
    const stats = await deduplicator.getDataSourceStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Deduplication stats error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// ============================================
// ERROR HANDLERS (MUST BE LAST!)
// ============================================

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ 
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   Spotify Stats Backend                       ║
╚═══════════════════════════════════════════════╝

🚀 Server running on port ${PORT}
🌐 Frontend: http://127.0.0.1:${PORT}/
🔐 OAuth Login: http://127.0.0.1:${PORT}/auth/login
💚 Health Check: http://127.0.0.1:${PORT}/health

OAuth Configuration:
  • Client ID: ${SPOTIFY_CLIENT_ID}
  • Redirect URI: ${SPOTIFY_REDIRECT_URI}

Available Endpoints:
  OAuth:
    GET  /auth/login      - Start OAuth flow
    GET  /auth/callback   - OAuth callback
    GET  /auth/user       - Get current user
    POST /auth/logout     - Logout user

  API:
    GET  /api/recent           - Get recent plays
    GET  /api/stats            - Dashboard statistics
    GET  /api/top/tracks       - Get top tracks from Spotify
    GET  /api/top/artists      - Get top artists from Spotify
    POST /api/import/spotify-history - Import history
    GET  /api/import/status    - Import status
    POST /api/deduplication/run - Run deduplication
    GET  /api/deduplication/stats - Deduplication stats

  System:
    GET  /health          - Health check
  `);
});

export default app;