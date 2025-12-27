// Spotify Web API Functions
var spotifyAccessToken = null;

async function getSpotifyAccessToken() {
  // Try to get token from backend storage
  try {
    const response = await apiCall('/auth/user');
    if (response.ok) {
      const userData = await response.json();
      // For now, we need to implement proper token retrieval
      console.log('User authenticated:', userData.authenticated);
      return null; // We'll implement this properly
    }
  } catch (error) {
    console.log('Backend auth check Alone:', error);
  }
  
  // Try to get token from URL params (OAuth callback)
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  
  // Check if we have an access token in the hash
  if (hashParams.has('access_token')) {
    spotifyAccessToken = hashParams.get('access_token');
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
    return spotifyAccessToken;
  }
  
  return null;
}

async function callSpotifyAPI(endpoint) {
  const token = await getSpotifyAccessToken();
  if (!token) {
    throw new Error('No Spotify access token available');
  }
  
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status}`);
  }
  
  return response.json();
}

async function getUserTopTracks(timeRange = 'short_term', limit = 5) {
  try {
    const response = await apiCall(`/api/top/tracks?time_range=${timeRange}&limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching top tracks:', error);
    return [];
  }
}

async function getUserTopArtists(timeRange = 'short_term', limit = 5) {
  try {
    const response = await apiCall(`/api/top/artists?time_range=${timeRange}&limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching top artists:', error);
    return [];
  }
}

// Backend OAuth Configuration
var BACKEND_URL = 'http://127.0.0.1:3001'; // Fixed backend URL

// Helper function for API calls
async function apiCall(endpoint, options = {}) {
  const url = `${BACKEND_URL}${endpoint}`;
  return fetch(url, options);
}

// Remove old Spotify constants - no longer needed
// const CLIENT_ID = "9075e748e02649f09227d9b7d2eec38d";
// const SCOPES = ["user-read-email", "user-read-recently-played", "user-top-read", "user-read-playback-state", "user-modify-playback-state"];
// const STORAGE_KEYS = {
//   accessToken: "spotify_access_token",
//   refreshToken: "spotify_refresh_token",
//   expiresAt: "spotify_expires_at",
//   pkceVerifier: "spotify_pkce_verifier",
//   oauthState: "spotify_oauth_state",
// };

// Remove old OAuth functions - no longer needed
// function getRedirectUri() { ... }
// function base64UrlEncode(bytes) { ... }
// function randomString(length = 64) { ... }
// async function sha256(text) { ... }
// async function buildCodeChallenge(verifier) { ... }

function setStatus(text) {
  const el = document.getElementById("status");
  el.textContent = text || "";
}

function setDashStatus(text) {
  const el = document.getElementById("dashStatus");
  if (!el) return;
  el.textContent = text || "";
}

// Backend OAuth Functions
async function startBackendLogin() {
  try {
    setStatus("Login wird gestartet...");
    window.location.href = `${BACKEND_URL}/auth/login`;
  } catch (error) {
    setStatus(`Login-Fehler: ${error.message}`);
  }
}

async function handleBackendOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const loginSuccess = urlParams.get('login_success');
  const error = urlParams.get('error');
  const userId = urlParams.get('user_id');
  const displayName = urlParams.get('display_name');
  const imageUrl = urlParams.get('image_url');

  if (error) {
    setStatus(`Login fehlgeschlagen: ${error}`);
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  if (loginSuccess === 'true') {
    // Store user info
    localStorage.setItem('backend_user_id', userId || 'demo');
    localStorage.setItem('backend_display_name', decodeURIComponent(displayName || 'Demo User'));
    localStorage.setItem('backend_image_url', decodeURIComponent(imageUrl || ''));
    localStorage.setItem('backend_authenticated', 'true');
    
    setStatus("Login erfolgreich!");
    
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
    
    // Show dashboard
    showLoggedIn(decodeURIComponent(displayName || 'Demo User'));
    await loadDashboard();
  }
}

function isBackendAuthenticated() {
  return localStorage.getItem('backend_authenticated') === 'true';
}

function getBackendUserInfo() {
  return {
    id: localStorage.getItem('backend_user_id') || 'demo',
    display_name: localStorage.getItem('backend_display_name') || 'Demo User',
  };
}

function backendLogout() {
  localStorage.removeItem('backend_user_id');
  localStorage.removeItem('backend_display_name');
  localStorage.removeItem('backend_authenticated');
  showLoggedOut();
  setStatus("Du bist ausgeloggt.");
}

function showLoggedOut() {
  const auth = document.getElementById("screenLoggedOut");
  const dash = document.getElementById("screenDashboard");
  auth.classList.remove("hidden");
  dash.classList.add("hidden");
}

function showLoggedIn(displayName) {
  console.log("showLoggedIn called, switching to dashboard UI");
  const auth = document.getElementById("screenLoggedOut");
  const dash = document.getElementById("screenDashboard");
  if (auth) auth.classList.add("hidden");
  if (dash) dash.classList.remove("hidden");

  const userName = document.getElementById("userName");
  if (userName) userName.textContent = displayName;

  const badge = document.getElementById("userBadge");
  if (badge) {
    // Try to load profile image from backend OAuth
    const backendImageUrl = localStorage.getItem("backend_image_url");
    if (backendImageUrl && backendImageUrl !== 'null' && backendImageUrl !== '') {
      badge.style.backgroundImage = `url(${backendImageUrl})`;
      badge.style.backgroundSize = "cover";
      badge.style.backgroundPosition = "center";
      badge.textContent = "";
    } else {
      badge.textContent = (displayName || "?").trim().slice(0, 2).toUpperCase();
    }
  }
}

// Old OAuth functions removed - no longer needed
// function readStoredToken() { ... }
// function storeToken() { ... }
// function clearToken() { ... }
// function startLogin() { ... }
// function exchangeCodeForToken() { ... }
// function refreshAccessToken() { ... }
// function spotifyApi() { ... }
// function handleOAuthCallbackIfPresent() { ... }
// function loadProfileAndRender() { ... }

// Miniplayer functions
async function updateMiniplayer() {
  const miniplayer = document.getElementById('miniplayer');
  const miniplayerImage = document.getElementById('miniplayerImage');
  const miniplayerTrack = document.getElementById('miniplayerTrack');
  const miniplayerArtist = document.getElementById('miniplayerArtist');
  const progressFill = document.getElementById('miniplayerProgressFill');
  
  try {
    const response = await apiCall('/api/currently-playing');
    
    if (response.status === 204 || !response.ok) {
      // Nothing is playing
      miniplayer.classList.add('hidden');
      return;
    }
    
    const data = await response.json();
    
    if (!data.item) {
      miniplayer.classList.add('hidden');
      return;
    }
    
    const track = data.item;
    miniplayerImage.src = track.album?.images?.[0]?.url || '';
    miniplayerTrack.textContent = track.name || '—';
    miniplayerArtist.textContent = track.artists?.map(a => a.name).join(', ') || '—';
    miniplayer.classList.remove('hidden');
    
    // Update progress
    if (data.progress_ms !== undefined && track.duration_ms) {
      const progress = (data.progress_ms / track.duration_ms) * 100;
      progressFill.style.width = `${progress}%`;
    } else {
      progressFill.style.width = '0%';
    }
    
    // Update play/pause button
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
      const svg = playPauseBtn.querySelector('svg');
      if (data.is_playing) {
        svg.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
      } else {
        svg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
      }
    }
  } catch (error) {
    console.error('Error updating miniplayer:', error);
    miniplayer.classList.add('hidden');
  }
}

// Format time helper
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Update miniplayer every 5 seconds
setInterval(updateMiniplayer, 5000);

// Miniplayer controls
document.addEventListener('DOMContentLoaded', () => {
  const playPauseBtn = document.getElementById('playPauseBtn');
  const previousBtn = document.getElementById('previousBtn');
  const nextBtn = document.getElementById('nextBtn');
  const progressBar = document.querySelector('.miniplayer-progress-bar');
  
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', async () => {
      try {
        // Get current playing state
        const response = await apiCall('/api/currently-playing');
        const data = response.status === 204 ? { is_playing: false } : await response.json();
        
        // Toggle play/pause
        const action = data.is_playing ? 'pause' : 'play';
        await apiCall(`/api/player/${action}`, { method: 'PUT' });
        
        // Update miniplayer immediately
        setTimeout(updateMiniplayer, 500);
      } catch (error) {
        console.error('Error toggling play/pause:', error);
      }
    });
  }
  
  if (previousBtn) {
    previousBtn.addEventListener('click', async () => {
      try {
        await apiCall('/api/player/previous', { method: 'POST' });
        setTimeout(updateMiniplayer, 1000);
      } catch (error) {
        console.error('Error playing previous track:', error);
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
      try {
        await apiCall('/api/player/next', { method: 'POST' });
        setTimeout(updateMiniplayer, 1000);
      } catch (error) {
        console.error('Error playing next track:', error);
      }
    });
  }
  
  if (progressBar) {
    progressBar.addEventListener('click', async (e) => {
      try {
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        
        // Get current track to calculate position
        const response = await apiCall('/api/currently-playing');
        if (response.status !== 204) {
          const data = await response.json();
          if (data.item && data.item.duration_ms) {
            const positionMs = Math.floor(percentage * data.item.duration_ms);
            
            // Seek to position
            await apiCall(`/api/player/seek?position_ms=${positionMs}`, { method: 'PUT' });
            
            // Update miniplayer immediately
            setTimeout(updateMiniplayer, 500);
          }
        }
      } catch (error) {
        console.error('Error seeking:', error);
      }
    });
  }
});

// Helper functions
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatInt(n) {
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatDateLabel(date) {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function startOfDayLocal(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIsoDayLocal(date) {
  const d = startOfDayLocal(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderTopList(el, items, type) {
  console.log(`=== renderTopList called ===`);
  console.log(`Container:`, el);
  console.log(`Items count:`, items.length);
  console.log(`Type:`, type);
  console.log(`First item:`, items[0]);
  
  if (!el) {
    console.error("Container not found for top list");
    return;
  }
  
  el.textContent = "";

  if (!Array.isArray(items) || items.length === 0) {
    console.log("No items to render");
    const li = document.createElement("li");
    li.className = "list-item";
    li.textContent = type === "artist" ? "Keine Top Artists verfügbar" : "Keine Top Tracks verfügbar";
    el.appendChild(li);
    return;
  }

  for (const [idx, item] of items.entries()) {
    const li = document.createElement("li");
    li.className = "list-item";

    const main = document.createElement("div");
    main.className = "list-item-main";

    const title = document.createElement("div");
    title.className = "list-item-title";
    
    if (type === "artist") {
      const link = document.createElement("a");
      link.href = item.external_urls?.spotify || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.name;
      link.style.color = "inherit";
      link.style.textDecoration = "none";
      title.appendChild(link);
    } else {
      const link = document.createElement("a");
      link.href = item.external_urls?.spotify || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.name;
      link.style.color = "inherit";
      link.style.textDecoration = "none";
      title.appendChild(link);
    }

    const sub = document.createElement("div");
    sub.className = "list-item-sub";
    if (type === "artist") {
      sub.textContent = `${formatInt(item.followers?.total || 0)} followers`;
    } else {
      const artists = (item.artists || []).map((a) => a.name).join(", ");
      sub.textContent = artists || "";
      
      // Make artists clickable for tracks
      if (item.artists && item.artists.length > 0) {
        sub.textContent = "";
        item.artists.forEach((artist, index) => {
          const artistLink = document.createElement("a");
          artistLink.href = artist.external_urls?.spotify || "#";
          artistLink.target = "_blank";
          artistLink.rel = "noopener noreferrer";
          artistLink.textContent = artist.name;
          artistLink.style.color = "inherit";
          artistLink.style.textDecoration = "none";
          sub.appendChild(artistLink);
          
          if (index < item.artists.length - 1) {
            const separator = document.createTextNode(", ");
            sub.appendChild(separator);
          }
        });
      }
    }

    const meta = document.createElement("div");
    meta.className = "list-item-meta";
    meta.textContent = `#${idx + 1}`;

    main.appendChild(title);
    main.appendChild(sub);
    li.appendChild(main);
    li.appendChild(meta);
    el.appendChild(li);
  }
}

function computeRecentStats(recentItems, rangeDays) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  const filtered = recentItems.filter((i) => new Date(i.played_at) >= cutoff);

  let minutes = 0;
  const artistSet = new Set();
  const trackCounts = new Map();
  const perDay = new Map();

  for (const item of filtered) {
    // Support both Spotify API items and IndexedDB stored objects
    const track = item.track || {
      id: item.track_id,
      name: item.track_name,
      artists: (item.artists || []).map(name => ({ name })),
      duration_ms: item.duration_ms,
    };
    if (!track) continue;

    minutes += (track.duration_ms || 0) / 60000;
    for (const a of track.artists || []) {
      artistSet.add(a.id || a.name);
    }

    const key = track.id || track.name;
    trackCounts.set(key, (trackCounts.get(key) || 0) + 1);

    const dayKey = toIsoDayLocal(item.played_at);
    perDay.set(dayKey, (perDay.get(dayKey) || 0) + 1);
  }

  let topTrackId = null;
  let topTrackCount = 0;
  for (const [k, v] of trackCounts.entries()) {
    if (v > topTrackCount) {
      topTrackId = k;
      topTrackCount = v;
    }
  }

  const topTrackItem = filtered.find((i) => {
    const t = i.track || {
      id: i.track_id,
      name: i.track_name,
      artists: (i.artists || []).map(name => ({ name })),
      duration_ms: i.duration_ms,
    };
    if (!t) return false;
    const key = t.id || t.name;
    return key === topTrackId;
  });

  const topTrack = topTrackItem?.track || {
    name: topTrackItem?.track_name,
    artists: (topTrackItem?.artists || []).map(name => ({ name })),
  };
  const topTrackName = topTrack ? topTrack.name : "—";
  const topTrackArtist = topTrack?.artists?.[0]?.name || "";

  return {
    filtered,
    tracksPlayed: filtered.length,
    minutesListened: minutes,
    uniqueArtists: artistSet.size,
    topTrackName,
    topTrackArtist,
    topTrackCount,
    perDay,
    cutoff,
  };
}

function buildDailySeries(perDay, rangeDays) {
  const days = clamp(rangeDays, 1, 90);
  const end = startOfDayLocal(new Date());
  const labels = [];
  const values = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
    const key = toIsoDayLocal(d);
    labels.push(formatDateLabel(d));
    values.push(perDay.get(key) || 0);
  }
  console.log(`buildDailySeries: rangeDays=${rangeDays}, generated ${labels.length} labels, values:`, values);
  return { labels, values };
}

var usageChart = null;
var lastDashboardPayload = null;
var selectedRangeDays = 7;

function renderChart(labels, values) {
  const canvas = document.getElementById("usageChart");
  if (!canvas || !window.Chart) return;

  console.log("renderChart called with labels:", labels, "values:", values);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (usageChart) {
    usageChart.destroy();
    usageChart = null;
  }

  usageChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Plays",
          data: values,
          backgroundColor: "rgba(255, 159, 79, 0.85)",
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 34,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(10, 12, 13, 0.95)",
          borderColor: "rgba(255, 255, 255, 0.12)",
          borderWidth: 1,
          borderRadius: 12,
          padding: 12,
          titleColor: "rgba(255, 255, 255, 0.95)",
          bodyColor: "rgba(255, 255, 255, 0.7)",
          titleFont: { 
            family: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
            size: 14,
            weight: "700"
          },
          bodyFont: { 
            family: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
            size: 12
          },
          displayColors: false,
          boxPadding: 4,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { 
            color: "rgba(255,255,255,0.55)", 
            maxRotation: 0, 
            autoSkip: true,
            font: { family: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }
          },
          border: { display: false },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.08)" },
          ticks: { 
            color: "rgba(255,255,255,0.55)", 
            precision: 0,
            font: { family: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }
          },
          border: { display: false },
        },
      },
    },
  });
}

// Currently playing function removed - using backend OAuth

// Miniplayer functions removed - using backend OAuth

// Miniplayer functions removed - using backend OAuth

// Old Spotify API functions removed - using backend OAuth
    async function loadDashboard(me) {
  try {
    setDashStatus("Loading usage …");
    console.log("=== loadDashboard started ===");
    console.log("Selected range days:", selectedRangeDays);

    // Fetch data from backend API
    console.log(`Fetching data from backend for range: ${selectedRangeDays} days`);
    const response = await apiCall(`/api/recent?range=${selectedRangeDays}`);
    
    console.log("Response status:", response.status);
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Backend response:", data);

    const plays = data.plays || [];
    console.log("Loaded plays from backend:", plays.length);

    // Fetch top tracks and artists from Spotify Web API
    let topTracks = [];
    let topArtists = [];
    
    try {
      console.log("Fetching top tracks from Spotify Web API (long_term)...");
      topTracks = await getUserTopTracks('long_term', 10);
      console.log("Loaded top tracks from Spotify Web API:", topTracks.length);
      if (topTracks.length > 0) {
        console.log("First track:", topTracks[0].name, "by", topTracks[0].artists[0]?.name);
        console.log("Full first track data:", topTracks[0]);
      } else {
        console.log("No top tracks returned");
      }
    } catch (error) {
      console.warn("Failed to fetch top tracks from Spotify Web API:", error);
      // Fallback to backend API
      try {
        console.log("Trying backend API for top tracks (long_term)...");
        const tracksResponse = await apiCall('/api/top/tracks?limit=10&time_range=long_term');
        console.log("Tracks response status:", tracksResponse.status);
        if (tracksResponse.ok) {
          const tracksData = await tracksResponse.json();
          console.log("Backend tracks response:", tracksData);
          topTracks = tracksData.items || [];
          console.log("Loaded top tracks from backend:", topTracks.length);
        } else {
          console.log("Backend API also failed");
        }
      } catch (backendError) {
        console.warn("Backend API also failed:", backendError);
      }
    }
    
    try {
      console.log("Fetching top artists from Spotify Web API (long_term)...");
      topArtists = await getUserTopArtists('long_term', 10);
      console.log("Loaded top artists from Spotify Web API:", topArtists.length);
      if (topArtists.length > 0) {
        console.log("First artist:", topArtists[0].name);
        console.log("Full first artist data:", topArtists[0]);
      } else {
        console.log("No top artists returned");
      }
    } catch (error) {
      console.warn("Failed to fetch top artists from Spotify Web API:", error);
      // Fallback to backend API
      try {
        console.log("Trying backend API for top artists (long_term)...");
        const artistsResponse = await apiCall('/api/top/artists?limit=10&time_range=long_term');
        console.log("Artists response status:", artistsResponse.status);
        if (artistsResponse.ok) {
          const artistsData = await artistsResponse.json();
          console.log("Backend artists response:", artistsData);
          topArtists = artistsData.items || [];
          console.log("Loaded top artists from backend:", topArtists.length);
        } else {
          console.log("Backend API also failed");
        }
      } catch (backendError) {
        console.warn("Backend API also failed:", backendError);
      }
    }

    console.log("Final data:", {
      playsCount: plays.length,
      topTracksCount: topTracks.length,
      topArtistsCount: topArtists.length
    });

    if (plays.length === 0 && topTracks.length === 0 && topArtists.length === 0) {
      console.log("No data found, showing empty state");
      // Handle empty response
      updateKPIs({
        tracksPlayed: 0,
        minutesListened: 0,
        uniqueArtists: 0,
        uniqueTracks: 0,
        topTrackName: null,
        topTrackArtist: null,
        topTrackCount: 0,
      });
      
      // Clear chart
      renderChart([], []);
      
      // Clear top lists
      renderTopList(document.getElementById("topArtists"), [], "artist");
      renderTopList(document.getElementById("topTracks"), [], "track");
      
      setDashStatus("No data available");
      return;
    }

    // Process plays for stats
    const stats = computeRecentStats(plays, selectedRangeDays);
    console.log("Computed stats:", stats);
    
    const series = buildDailySeries(stats.perDay, selectedRangeDays);
    console.log("Built chart series:", series);

    // Update KPIs
    updateKPIs(stats);

    console.log("Rendering chart...");
    renderChart(series.labels, series.values);
    
    console.log("Rendering top lists...");
    // Use Spotify API data if available, otherwise create from plays
    const finalTopArtists = topArtists.length > 0 ? topArtists : createTopArtistsFromPlays(plays, 5);
    const finalTopTracks = topTracks.length > 0 ? topTracks : createTopTracksFromPlays(plays, 5);
    
    renderTopList(document.getElementById("topArtists"), finalTopArtists, "artist");
    renderTopList(document.getElementById("topTracks"), finalTopTracks, "track");

    console.log("=== loadDashboard completed successfully ===");
    setDashStatus("");
    
    // Start miniplayer updates
    updateMiniplayer();
  } catch (e) {
    console.error("loadDashboard error:", e);
    setDashStatus(`Fehler beim Laden der Daten: ${e?.message || String(e)}`);
    
    // Show error state
    updateKPIs({
      tracksPlayed: 0,
      minutesListened: 0,
      uniqueArtists: 0,
      uniqueTracks: 0,
      topTrackName: null,
      topTrackArtist: null,
      topTrackCount: 0,
    });
    
    renderChart([], []);
    renderTopList(document.getElementById("topArtists"), [], "artist");
    renderTopList(document.getElementById("topTracks"), [], "track");
  }
}

function updateKPIs(stats) {
  const kpiPlays = document.getElementById("kpiPlays");
  const kpiMinutes = document.getElementById("kpiMinutes");
  const kpiArtists = document.getElementById("kpiArtists");
  const kpiTopTrack = document.getElementById("kpiTopTrack");
  const kpiPlaysSub = document.getElementById("kpiPlaysSub");
  const kpiMinutesSub = document.getElementById("kpiMinutesSub");
  const kpiArtistsSub = document.getElementById("kpiArtistsSub");
  const kpiTopTrackSub = document.getElementById("kpiTopTrackSub");

  console.log("KPI elements found:", {
    kpiPlays: !!kpiPlays,
    kpiMinutes: !!kpiMinutes,
    kpiArtists: !!kpiArtists,
    kpiTopTrack: !!kpiTopTrack
  });

  if (kpiPlays) kpiPlays.textContent = formatInt(stats.tracksPlayed);
  if (kpiMinutes) kpiMinutes.textContent = formatInt(Math.round(stats.minutesListened));
  if (kpiArtists) kpiArtists.textContent = formatInt(stats.uniqueArtists);
  if (kpiTopTrack) kpiTopTrack.textContent = stats.topTrackName || "—";

  const note = `Based on ${stats.totalItems || 0} stored plays`;
  if (kpiPlaysSub) kpiPlaysSub.textContent = note;
  if (kpiMinutesSub) kpiMinutesSub.textContent = note;
  if (kpiArtistsSub) kpiArtistsSub.textContent = note;
  if (kpiTopTrackSub) {
    kpiTopTrackSub.textContent = stats.topTrackArtist
      ? `${stats.topTrackArtist} • ${stats.topTrackCount} plays`
      : note;
  }
}

function createTopArtistsFromPlays(plays, limit = 5) {
  const artistCounts = {};
  plays.forEach(play => {
    const artist = play.artist;
    if (!artistCounts[artist]) {
      artistCounts[artist] = {
        id: artist,
        name: artist,
        followers: 0,
        external_urls: { spotify: null }
      };
    }
  });

  return Object.values(artistCounts)
    .slice(0, limit)
    .map((artist, index) => ({
      ...artist,
      popularity: 100 - index * 10
    }));
}

function createTopTracksFromPlays(plays, limit = 5) {
  const trackCounts = {};
  plays.forEach(play => {
    const key = play.track_id;
    if (!trackCounts[key]) {
      trackCounts[key] = {
        id: play.track_id,
        name: play.track_name,
        artists: [{ name: play.artist }],
        album: { name: play.album },
        duration_ms: play.duration_ms,
        external_urls: { spotify: null }
      };
    }
  });

  return Object.values(trackCounts)
    .slice(0, limit)
    .map((track, index) => ({
      ...track,
      popularity: 100 - index * 10
    }));
}

// Import functionality
var selectedFiles = [];

function initializeImport() {
  const fileInput = document.getElementById('fileInput');
  const selectFilesBtn = document.getElementById('selectFilesBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileList = document.getElementById('fileList');
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadResults = document.getElementById('uploadResults');

  // File selection
  selectFilesBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files);
    updateFileList();
    updateUploadButton();
  });

  // Upload button
  uploadBtn.addEventListener('click', uploadFiles);

  function updateFileList() {
    fileList.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.innerHTML = `
        <div class="file-info">
          <div class="file-name">${file.name}</div>
          <div class="file-size">${formatFileSize(file.size)}</div>
        </div>
        <button class="file-remove" data-index="${index}">×</button>
      `;
      fileList.appendChild(fileItem);
    });

    // Remove file handlers
    fileList.addEventListener('click', (e) => {
      if (e.target.classList.contains('file-remove')) {
        const index = parseInt(e.target.dataset.index);
        selectedFiles.splice(index, 1);
        updateFileList();
        updateUploadButton();
      }
    });
  }

  function updateUploadButton() {
    uploadBtn.disabled = selectedFiles.length === 0;
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

async function uploadFiles() {
  const uploadBtn = document.getElementById('uploadBtn');
  const uploadProgress = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const uploadResults = document.getElementById('uploadResults');

  if (selectedFiles.length === 0) {
    return;
  }

  // Disable upload button during upload
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';

  // Show progress
  uploadProgress.style.display = 'block';
  uploadResults.innerHTML = '';

  const results = [];

  try {
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Update progress
      const progress = ((i + 1) / selectedFiles.length) * 100;
      progressBar.style.width = `${progress}%`;
      progressText.textContent = `Uploading ${i + 1}/${selectedFiles.length}: ${file.name}`;

      // Upload file
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiCall('/api/import/spotify-history', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      results.push({
        filename: file.name,
        success: result.success,
        message: result.message || result.error,
        details: result,
      });

      // Show individual result
      const resultItem = document.createElement('div');
      resultItem.className = `upload-result ${result.success ? 'success' : 'error'}`;
      resultItem.innerHTML = `
        <div class="result-filename">${file.name}</div>
        <div class="result-message">${result.message || result.error}</div>
        ${result.success && result.details ? `
          <div class="result-details">
            ${result.details.totalPlays} total plays, ${result.details.insertedPlays} imported
          </div>
        ` : ''}
      `;
      uploadResults.appendChild(resultItem);
    }

    // Complete progress
    progressBar.style.width = '100%';
    progressText.textContent = 'Upload complete!';

    // Refresh dashboard data after successful upload
    const successfulUploads = results.filter(r => r.success);
    if (successfulUploads.length > 0) {
      setTimeout(() => {
        // Reload dashboard data
        loadDashboard();
      }, 1000);
    }

  } catch (error) {
    console.error('Upload error:', error);
    
    const errorItem = document.createElement('div');
    errorItem.className = 'upload-result error';
    errorItem.innerHTML = `
      <div class="result-message">Upload failed: ${error.message}</div>
    `;
    uploadResults.appendChild(errorItem);
  } finally {
    // Reset UI
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload Files';
    
    // Clear selected files
    selectedFiles = [];
    document.getElementById('fileInput').value = '';
    document.getElementById('fileList').innerHTML = '';

    // Hide progress after delay
    setTimeout(() => {
      uploadProgress.style.display = 'none';
      progressBar.style.width = '0%';
      progressText.textContent = 'Uploading...';
    }, 3000);
  }
}

// Initialize import when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeImport();
});

function initUi() {
  console.log("initUi called");
  document.getElementById("loginBtn").addEventListener("click", () => {
    setStatus("");
    startBackendLogin().catch((e) => setStatus(e?.message || String(e)));
  });

  const logoutIcon = document.getElementById("logoutIcon");
  const logoutModal = document.getElementById("logoutModal");
  const cancelLogout = document.getElementById("cancelLogout");
  const confirmLogout = document.getElementById("confirmLogout");
  const closeLogoutModal = document.getElementById("closeLogoutModal");

  console.log("Logout elements found:", {
    logoutIcon: !!logoutIcon,
    logoutModal: !!logoutModal,
    cancelLogout: !!cancelLogout,
    confirmLogout: !!confirmLogout,
    closeLogoutModal: !!closeLogoutModal
  });

  if (logoutIcon && logoutModal && cancelLogout && confirmLogout) {
    logoutIcon.addEventListener("click", () => {
      console.log("Logout icon clicked!");
      logoutModal.classList.add("active");
      console.log("Modal classes:", logoutModal.className);
    });

    cancelLogout.addEventListener("click", () => {
      logoutModal.classList.remove("active");
    });

    if (closeLogoutModal) {
      closeLogoutModal.addEventListener("click", () => {
        logoutModal.classList.remove("active");
      });
    }

    confirmLogout.addEventListener("click", () => {
      logoutModal.classList.remove("active");
      backendLogout();
    });

    // Close modal on overlay click
    logoutModal.addEventListener("click", (e) => {
      if (e.target === logoutModal) {
        logoutModal.classList.remove("active");
      }
    });
  }

  // Miniplayer controls
  // Miniplayer event listeners removed - using backend OAuth

  // Redirect URI elements removed - using backend OAuth

  const pills = document.getElementById("rangePills");
  if (pills) {
    pills.addEventListener("click", (e) => {
      const btn = e.target instanceof HTMLElement ? e.target.closest("button[data-range]") : null;
      if (!btn) return;
      const range = Number(btn.getAttribute("data-range") || 7);
      selectedRangeDays = range;
      for (const child of pills.querySelectorAll(".pill")) child.classList.remove("active");
      btn.classList.add("active");

      // Load dashboard with backend data
      loadDashboard();
    });
  }

  const uploadBtn = document.getElementById("uploadBtn");
  console.log("Upload button found:", !!uploadBtn);
  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
      console.log("Upload button clicked!");
      const uploadDialog = document.getElementById("uploadDialog");
      console.log("Upload dialog found:", !!uploadDialog);
      if (uploadDialog) {
        uploadDialog.classList.remove("hidden");
        console.log("Upload dialog opened");
      }
    });
  }

  const closeUploadDialog = document.getElementById("closeUploadDialog");
  if (closeUploadDialog) {
    closeUploadDialog.addEventListener("click", () => {
      const uploadDialog = document.getElementById("uploadDialog");
      if (uploadDialog) {
        uploadDialog.classList.add("hidden");
      }
    });
  }

  // Drag and Drop functionality
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const selectFilesBtn = document.getElementById("selectFilesBtn");

  if (dropZone && fileInput && selectFilesBtn) {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);

    // Handle browse button click
    selectFilesBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // Handle file selection
    fileInput.addEventListener('change', () => {
      handleFiles(fileInput.files);
    });

    // Click drop zone to open file dialog
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });
  }

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function highlight(e) {
    dropZone.classList.add('drag-over');
  }

  function unhighlight(e) {
    dropZone.classList.remove('drag-over');
  }

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
  }

  function handleFiles(files) {
    ([...files]).forEach(uploadFile);
  }

  function uploadFile(file) {
    if (!file.name.startsWith('StreamingHistory') || !file.name.endsWith('.json')) {
      setDashStatus(`Invalid file: ${file.name}. Must be StreamingHistory*.json`);
      return;
    }
    
    // Add file to file list display
    const fileList = document.getElementById("fileList");
    if (fileList) {
      const fileItem = document.createElement("div");
      fileItem.className = "file-item";
      fileItem.textContent = `${file.name} (${formatFileSize(file.size)})`;
      fileList.appendChild(fileItem);
    }

    // Trigger upload
    const formData = new FormData();
    formData.append('file', file);
    
    const uploadProgress = document.getElementById("uploadProgress");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    
    if (uploadProgress) uploadProgress.style.display = "block";
    if (progressBar) progressBar.style.width = "0%";
    if (progressText) progressText.textContent = "Uploading...";
    
    fetch(`${BACKEND_URL}/api/import/spotify-history`, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        setDashStatus(`Successfully uploaded ${file.name}`);
        // Clear file list after successful upload
        setTimeout(() => {
          if (fileList) fileList.innerHTML = "";
          if (uploadProgress) uploadProgress.style.display = "none";
          // Reload dashboard to show new data
          loadDashboard();
        }, 2000);
      } else {
        setDashStatus(`Upload failed: ${data.error}`);
      }
    })
    .catch(error => {
      setDashStatus(`Upload error: ${error.message}`);
    });
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  const uploadFilesBtn = document.getElementById("uploadFilesBtn");

  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (!lastDashboardPayload) {
        setDashStatus("Noch keine Daten zum Export.");
        return;
      }
      const filename = `spotify-usage-${lastDashboardPayload.range_days}d.json`;
      downloadJson(filename, lastDashboardPayload);
    });
  }
}

async function main() {
  initUi();

  // Handle OAuth callback from backend
  await handleBackendOAuthCallback();

  // Check if user is authenticated with backend
  if (isBackendAuthenticated()) {
    const userInfo = getBackendUserInfo();
    showLoggedIn(userInfo.display_name);
    await loadDashboard();
  } else {
    showLoggedOut();
  }
}

main();
