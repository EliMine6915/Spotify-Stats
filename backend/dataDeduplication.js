import { supabase } from './supabase.js';

class DataDeduplication {
  constructor() {
    this.userId = '123e4567-e89b-12d3-a456-426614174000'; // Fixed UUID for now
  }

  // Remove import plays that are within ±5 seconds of existing API plays
  async removeDuplicateImportPlays(plays) {
    if (!plays || plays.length === 0) {
      return { cleaned: [], removed: 0 };
    }

    const cleaned = [];
    let removed = 0;

    for (const play of plays) {
      // Only process import plays
      if (play.source !== 'import') {
        cleaned.push(play);
        continue;
      }

      // Check if there's an API play within ±5 seconds
      const hasNearbyApiPlay = await this.hasNearbyApiPlay(play.played_at);
      
      if (hasNearbyApiPlay) {
        removed++;
        console.log(`Removing duplicate import play: ${play.track_name} at ${play.played_at}`);
      } else {
        cleaned.push(play);
      }
    }

    return { cleaned, removed };
  }

  // Check if there's an API play within ±5 seconds of the given timestamp
  async hasNearbyApiPlay(timestamp) {
    const playTime = new Date(timestamp);
    const fiveSecondsBefore = new Date(playTime.getTime() - 5000);
    const fiveSecondsAfter = new Date(playTime.getTime() + 5000);

    try {
      const { data, error } = await supabase
        .from('spotify_plays')
        .select('id')
        .eq('user_id', this.userId)
        .eq('source', 'api')
        .gte('played_at', fiveSecondsBefore.toISOString())
        .lte('played_at', fiveSecondsAfter.toISOString())
        .limit(1);

      if (error) {
        console.error('Error checking for nearby API plays:', error);
        return false; // Assume no duplicate on error
      }

      return data && data.length > 0;
    } catch (error) {
      console.error('Error in hasNearbyApiPlay:', error);
      return false;
    }
  }

  // Clean existing import plays in the database
  async cleanExistingImportPlays() {
    console.log('Starting deduplication of existing import plays...');

    try {
      // Get all import plays
      const { data: importPlays, error: fetchError } = await supabase
        .from('spotify_plays')
        .select('*')
        .eq('user_id', this.userId)
        .eq('source', 'import')
        .order('played_at', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      if (!importPlays || importPlays.length === 0) {
        console.log('No import plays found to clean');
        return { total: 0, removed: 0 };
      }

      console.log(`Found ${importPlays.length} import plays to check`);

      const { cleaned, removed } = await this.removeDuplicateImportPlays(importPlays);

      if (removed > 0) {
        // Get IDs of plays to remove
        const idsToRemove = importPlays
          .filter(play => !cleaned.includes(play))
          .map(play => play.id);

        // Batch delete the duplicate import plays
        const { error: deleteError } = await supabase
          .from('spotify_plays')
          .delete()
          .in('id', idsToRemove);

        if (deleteError) {
          throw deleteError;
        }

        console.log(`Removed ${removed} duplicate import plays from database`);
      }

      return {
        total: importPlays.length,
        removed,
        remaining: cleaned.length,
      };

    } catch (error) {
      console.error('Error in cleanExistingImportPlays:', error);
      throw error;
    }
  }

  // Filter new plays before insertion (used during import)
  async filterNewPlays(newPlays) {
    if (!newPlays || newPlays.length === 0) {
      return [];
    }

    console.log(`Filtering ${newPlays.length} new plays for duplicates`);

    const { cleaned, removed } = await this.removeDuplicateImportPlays(newPlays);

    console.log(`Filtered: ${cleaned.length} kept, ${removed} removed as duplicates`);

    return cleaned;
  }

  // Get statistics about data sources
  async getDataSourceStats() {
    try {
      const { data, error } = await supabase
        .from('spotify_plays')
        .select('source')
        .eq('user_id', this.userId);

      if (error) {
        throw error;
      }

      const stats = {
        total: data?.length || 0,
        api: 0,
        import: 0,
      };

      data?.forEach(play => {
        stats[play.source]++;
      });

      return stats;
    } catch (error) {
      console.error('Error getting data source stats:', error);
      throw error;
    }
  }

  // Run full deduplication process
  async runDeduplication() {
    console.log('=== Starting Data Deduplication ===');
    
    try {
      const startTime = Date.now();
      
      // Get initial stats
      const initialStats = await this.getDataSourceStats();
      console.log('Initial stats:', initialStats);

      // Clean existing import plays
      const cleanResult = await this.cleanExistingImportPlays();
      
      // Get final stats
      const finalStats = await this.getDataSourceStats();
      console.log('Final stats:', finalStats);

      const duration = Date.now() - startTime;

      const result = {
        success: true,
        duration: `${duration}ms`,
        initialStats,
        finalStats,
        cleanResult,
        removedDuplicates: cleanResult.removed,
      };

      console.log('=== Deduplication completed ===', result);
      return result;

    } catch (error) {
      console.error('Deduplication failed:', error);
      return {
        success: false,
        error: error.message,
        duration: `${Date.now() - startTime}ms`,
      };
    }
  }
}

export default DataDeduplication;
