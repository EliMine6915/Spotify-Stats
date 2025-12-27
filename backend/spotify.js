import axios from 'axios';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

class SpotifyAPI {
  constructor() {
    this.baseURL = 'https://api.spotify.com/v1';
    this.accessToken = null;
    this.expiresAt = null;
    this.tokenPromise = null;
  }

  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.expiresAt - 60000) {
      return this.accessToken;
    }

    // Return existing promise if token refresh is in progress
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Start token refresh
    this.tokenPromise = this.refreshToken();
    
    try {
      const token = await this.tokenPromise;
      return token;
    } finally {
      this.tokenPromise = null;
    }
  }

  async refreshToken() {
    try {
      const response = await axios.post('https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: REFRESH_TOKEN,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );

      const { access_token, expires_in } = response.data;
      
      this.accessToken = access_token;
      this.expiresAt = Date.now() + expires_in * 1000;

      console.log('Spotify access token refreshed successfully');
      return access_token;
    } catch (error) {
      console.error('Failed to refresh Spotify token:', error.response?.data || error.message);
      
      // Clear cached token on error
      this.accessToken = null;
      this.expiresAt = null;
      
      throw new Error('Failed to refresh access token');
    }
  }

  async apiRequest(endpoint, options = {}) {
    const maxRetries = 2;
    let retries = 0;

    while (retries <= maxRetries) {
      try {
        const token = await this.getAccessToken();
        
        const response = await axios.get(`${this.baseURL}${endpoint}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
          timeout: 15000,
          ...options,
        });
        
        return response.data;
      } catch (error) {
        retries++;
        
        // Handle different error types
        if (error.response?.status === 401 && retries <= maxRetries) {
          console.log('Token expired, refreshing...');
          this.accessToken = null;
          this.expiresAt = null;
          continue;
        }
        
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
          
          console.log(`Rate limited, waiting ${waitTime}ms...`);
          
          if (retries <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        if (error.code === 'ECONNABORTED') {
          console.log('Request timeout, retrying...');
          if (retries <= maxRetries) {
            continue;
          }
        }
        
        throw error;
      }
    }
  }

  async getRecentlyPlayed(limit = 50) {
    if (limit < 1 || limit > 50) {
      throw new Error('Limit must be between 1 and 50');
    }
    
    return this.apiRequest(`/me/player/recently-played?limit=${limit}`);
  }

  async getCurrentlyPlaying() {
    return this.apiRequest('/me/player/currently-playing');
  }

  async getTopArtists(timeRange = 'short_term', limit = 5) {
    const validRanges = ['short_term', 'medium_term', 'long_term'];
    if (!validRanges.includes(timeRange)) {
      throw new Error('Invalid time range. Must be: short_term, medium_term, or long_term');
    }
    
    return this.apiRequest(`/me/top/artists?time_range=${timeRange}&limit=${limit}`);
  }

  async getTopTracks(timeRange = 'short_term', limit = 5) {
    const validRanges = ['short_term', 'medium_term', 'long_term'];
    if (!validRanges.includes(timeRange)) {
      throw new Error('Invalid time range. Must be: short_term, medium_term, or long_term');
    }
    
    return this.apiRequest(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`);
  }

  async getUserProfile() {
    return this.apiRequest('/me');
  }

  // Health check method
  async healthCheck() {
    try {
      await this.getUserProfile();
      return { status: 'healthy', tokenValid: true };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message,
        tokenValid: this.accessToken && Date.now() < this.expiresAt
      };
    }
  }

  // Get token info for debugging
  getTokenInfo() {
    return {
      hasToken: !!this.accessToken,
      expiresAt: this.expiresAt,
      timeUntilExpiry: this.expiresAt ? this.expiresAt - Date.now() : null,
      isExpired: this.expiresAt ? Date.now() >= this.expiresAt : true,
    };
  }
}

export default SpotifyAPI;
