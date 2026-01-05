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

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Express App
const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: ['https://trackify-kayh.onrender.com', 'http://127.0.0.1:3001', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// CRITICAL: Disable etag and caching for development
app.set('etag', false);
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

// DEBUG MIDDLEWARE
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// EXPLICIT STATIC FILE ROUTES (Before catch-all routes)
app.get('/app.js', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'app.js');
  if (!fs.existsSync(filePath)) {
    console.error('app.js not found at:', filePath);
    return res.status(404).send('app.js not found');
  }
  res.type('application/javascript').sendFile(filePath);
});

app.get('/style.css', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'style.css');
  if (!fs.existsSync(filePath)) {
    console.error('style.css not found at:', filePath);
    return res.status(404).send('style.css not found');
  }
  res.type('text/css').sendFile(filePath);
});

app.get('/index.js', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.js');
  if (!fs.existsSync(filePath)) {
    console.error('index.js not found at:', filePath);
    return res.status(404).send('index.js not found');
  }
  res.type('application/javascript').sendFile(filePath);
});

app.get('/favicon.ico', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'favicon.ico');
  if (!fs.existsSync(filePath)) {
    return res.status(204).end(); // No content for missing favicon
  }
  res.type('image/x-icon').sendFile(filePath);
});

// SERVE STATIC FILES (after explicit routes)
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res, path) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
}));

// ============================================
// PAGE ROUTES
// ============================================
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'home.html');
  if (!fs.existsSync(filePath)) {
    console.error('home.html not found at:', filePath);
    return res.status(404).send('Home page not found');
  }
  res.sendFile(filePath);
});

app.get('/app', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  if (!fs.existsSync(filePath)) {
    console.error('index.html not found at:', filePath);
    return res.status(404).send('App page not found');
  }
  res.sendFile(filePath);
});

// ============================================
// MULTER CONFIGURATION
// ============================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
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
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'https://trackify-kayh.onrender.com/auth/callback';
const SPOTIFY_SCOPES = [
  'user-read-email',
  'user-read-recently-played',
  'user-top-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-top-read'
];

if (!SPOTIFY_CLIENT_SECRET || SPOTIFY_CLIENT_SECRET === 'YOUR_CLIENT_SECRET_HERE') {
  console.error('ERROR: SPOTIFY_CLIENT_SECRET is required in .env file');
  process.exit(1);
}

const oauthSessions = new Map();

// ============================================
// HELPER FUNCTIONS
// ============================================
async function getCurrentUser() {
  try {
    const { data: tokens, error: tokenError } = await supabase
      .from('user_tokens')
      .select('user_id, expires_at, access_token, refresh_token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (tokenError || !tokens) {
      return null;
    }
    
    // Check if token is expired
    const expiresAt = new Date(tokens.expires_at);
    if (expiresAt < new Date()) {
      // Try to refresh the token
      try {
        const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokens.refresh_token,
          }),
        });

        if (refreshResponse.ok) {
          const newTokens = await refreshResponse.json();
          const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
          
          // Update tokens in database
          await supabase
            .from('user_tokens')
            .update({
              access_token: newTokens.access_token,
              refresh_token: newTokens.refresh_token || tokens.refresh_token,
              expires_at: newExpiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', tokens.user_id);
          
          return tokens.user_id;
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
      }
      
      return null;
    }
    
    return tokens.user_id;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

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
      secure: process.env.NODE_ENV === 'production',
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

    const redirectUrl = `/app?login_success=true&user_id=${userProfile.id}&display_name=${encodeURIComponent(userProfile.display_name || userProfile.id)}&image_url=${encodeURIComponent(userProfile.images?.[0]?.url || '')}`;
    console.log(`OAuth login successful for user ${userProfile.id}`);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/?error=callback_failed');
  }
});

app.get('/auth/user', async (req, res) => {
  try {
    // Check if user has valid tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('user_tokens')
      .select('user_id, expires_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (tokenError || !tokens) {
      return res.status(401).json({
        authenticated: false,
        error: 'Not authenticated',
        message: 'Please login with Spotify'
      });
    }
    
    // Check if token is expired
    const expiresAt = new Date(tokens.expires_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({
        authenticated: false,
        error: 'Token expired',
        message: 'Please login again'
      });
    }
    
    // Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', tokens.user_id)
      .single();
    
    if (userError || !user) {
      return res.status(401).json({
        authenticated: false,
        error: 'User not found',
        message: 'Please login with Spotify'
      });
    }
    
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        display_name: user.display_name,
        email: user.email,
      }
    });
  } catch (error) {
    console.error('Auth user error:', error);
    res.status(500).json({
      authenticated: false,
      error: 'Failed to get user info',
      message: error.message,
    });
  }
});

app.post('/auth/logout', async (req, res) => {
  try {
    // In a real app, you would invalidate the token here
    // For now, we just return success
    // The frontend will handle clearing local state
    
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
app.get('/api/recent', async (req, res) => {
  try {
    const { range } = req.query;
    const days = validateRange(range);
    
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

app.get('/api/stats', async (req, res) => {
  try {
    const userId = await getCurrentUser();
    if (!userId) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Please login with Spotify first'
      });
    }

    const { range } = req.query;
    const days = validateRange(range);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('spotify_plays')
      .select('track_id, track_name, artist, album, duration_ms, played_at')
      .eq('user_id', userId)
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

app.get('/api/top/tracks', async (req, res) => {
  try {
    const { limit = 20, time_range = 'short_term' } = req.query;
    
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

app.get('/api/currently-playing', async (req, res) => {
  try {
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
    
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    
    if (response.status === 204) {
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

app.get('/api/top/artists', async (req, res) => {
  try {
    const { limit = 20, time_range = 'short_term' } = req.query;
    
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

app.get('/api/import/status', async (req, res) => {
  try {
    const userId = await getCurrentUser();
    if (!userId) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Please login with Spotify first'
      });
    }

    const { data, error } = await supabase
      .from('import_uploads')
      .select('*')
      .eq('user_id', userId)
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
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

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
    GET  /api/currently-playing - Get currently playing track
    PUT  /api/player/play      - Play
    PUT  /api/player/pause     - Pause
    POST /api/player/next      - Next track
    POST /api/player/previous  - Previous track
    PUT  /api/player/seek      - Seek position
    POST /api/import/spotify-history - Import history
    GET  /api/import/status    - Import status
    POST /api/deduplication/run - Run deduplication
    GET  /api/deduplication/stats - Deduplication stats

  System:
    GET  /health          - Health check
  `);
});

export default app;