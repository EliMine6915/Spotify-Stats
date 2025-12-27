import cron from 'node-cron';
import SpotifyAPI from './spotify.js';
import { supabase } from './supabase.js';

class SpotifyTracker {
  constructor() {
    this.spotify = new SpotifyAPI();
    this.userId = '123e4567-e89b-12d3-a456-426614174000'; // Fixed UUID for now
    this.isRunning = false;
  }

  async fetchAndStorePlays() {
    if (this.isRunning) {
      console.log('Tracker already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('Starting Spotify tracking...');

    try {
      // Fetch recently played tracks from Spotify
      const recentlyPlayed = await this.spotify.getRecentlyPlayed(50);
      const plays = recentlyPlayed.items || [];

      console.log(`Fetched ${plays.length} recent plays from Spotify`);

      let newPlaysCount = 0;
      let duplicateCount = 0;

      for (const play of plays) {
        if (!play.track || !play.played_at) {
          console.log('Skipping invalid play item');
          continue;
        }

        const playData = {
          user_id: this.userId,
          track_id: play.track.id,
          track_name: play.track.name,
          artist: play.track.artists?.[0]?.name || 'Unknown Artist',
          album: play.track.album?.name || 'Unknown Album',
          duration_ms: play.track.duration_ms || 0,
          played_at: play.played_at,
        };

        try {
          // Insert with conflict handling - ignore duplicates
          const { error } = await supabase
            .from('spotify_plays')
            .upsert(playData, {
              onConflict: 'user_id,track_id,played_at',
              ignoreDuplicates: true,
            });

          if (error) {
            console.error('Error storing play:', error);
          } else {
            newPlaysCount++;
            console.log(`Stored new play: ${play.track.name} by ${play.track.artists?.[0]?.name}`);
          }
        } catch (upsertError) {
          // Check if it's a duplicate (unique constraint violation)
          if (upsertError.code === '23505' || upsertError.message?.includes('duplicate')) {
            duplicateCount++;
          } else {
            console.error('Unexpected error storing play:', upsertError);
          }
        }
      }

      console.log(`Tracking completed: ${newPlaysCount} new plays stored, ${duplicateCount} duplicates ignored`);
      return {
        totalFetched: plays.length,
        newPlays: newPlaysCount,
        duplicates: duplicateCount,
      };
    } catch (error) {
      console.error('Error in Spotify tracking:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async startCronJob() {
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      console.log('Running scheduled Spotify tracking...');
      try {
        await this.fetchAndStorePlays();
      } catch (error) {
        console.error('Scheduled tracking failed:', error);
      }
    });

    console.log('Spotify tracker cron job started (every 5 minutes)');
    
    // Run immediately on start
    try {
      await this.fetchAndStorePlays();
    } catch (error) {
      console.error('Initial tracking failed:', error);
    }
  }

  async stopCronJob() {
    cron.getTasks().forEach(task => task.stop());
    console.log('Spotify tracker cron job stopped');
  }

  async getTrackingStats() {
    try {
      const { data, error } = await supabase
        .from('spotify_plays')
        .select('played_at')
        .eq('user_id', this.userId)
        .order('played_at', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      const { count, error: countError } = await supabase
        .from('spotify_plays')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', this.userId);

      if (countError) {
        throw countError;
      }

      return {
        totalPlays: count || 0,
        lastPlayAt: data?.[0]?.played_at || null,
        isRunning: this.isRunning,
      };
    } catch (error) {
      console.error('Error getting tracking stats:', error);
      throw error;
    }
  }

  async manualSync() {
    console.log('Starting manual sync...');
    return await this.fetchAndStorePlays();
  }

  // Health check method
  async healthCheck() {
    try {
      const spotifyHealth = await this.spotify.healthCheck();
      const trackingStats = await this.getTrackingStats();

      return {
        status: 'healthy',
        spotify: spotifyHealth,
        tracking: trackingStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
const tracker = new SpotifyTracker();

export default tracker;
export { SpotifyTracker };
