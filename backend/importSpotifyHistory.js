import crypto from 'crypto';
import { supabase } from './supabase.js';
import DataDeduplication from './dataDeduplication.js';

class SpotifyHistoryImporter {
  constructor() {
    this.userId = '123e4567-e89b-12d3-a456-426614174000'; // Fixed UUID for now
    this.deduplicator = new DataDeduplication();
  }

  // Generate stable hash from track name and artist name
  generateTrackId(trackName, artistName) {
    if (!trackName || !artistName) return null;
    
    const input = `${trackName.toLowerCase().trim()}|${artistName.toLowerCase().trim()}`;
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 22);
  }

  // Convert Spotify endTime to ISO timestamp
  convertEndTime(endTime) {
    try {
      // Spotify format: "2023-12-27 10:30"
      const [datePart, timePart] = endTime.split(' ');
      const [year, month, day] = datePart.split('-');
      const [hour, minute] = timePart.split(':');
      
      // Create Date object in UTC
      const date = new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1, // JavaScript months are 0-indexed
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        0
      ));
      
      return date.toISOString();
    } catch (error) {
      console.error('Error converting endTime:', endTime, error);
      return null;
    }
  }

  // Validate streaming history file format
  validateFile(filename, data) {
    if (!filename.startsWith('StreamingHistory') || !filename.endsWith('.json')) {
      throw new Error('Invalid filename. Must be StreamingHistory*.json');
    }

    if (!Array.isArray(data)) {
      throw new Error('Invalid file format. Expected JSON array.');
    }

    if (data.length === 0) {
      throw new Error('File is empty.');
    }

    // Validate first item structure
    const firstItem = data[0];
    const requiredFields = ['endTime', 'trackName', 'artistName', 'msPlayed'];
    
    for (const field of requiredFields) {
      if (!(field in firstItem)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return true;
  }

  // Parse and transform streaming history data
  parseStreamingHistory(data) {
    const plays = [];
    const errors = [];

    data.forEach((item, index) => {
      try {
        const played_at = this.convertEndTime(item.endTime);
        if (!played_at) {
          errors.push(`Invalid endTime at index ${index}: ${item.endTime}`);
          return;
        }

        const playData = {
          user_id: this.userId,
          track_id: this.generateTrackId(item.trackName, item.artistName),
          track_name: item.trackName || 'Unknown Track',
          artist: item.artistName || 'Unknown Artist',
          album: null, // Not available in streaming history
          duration_ms: parseInt(item.msPlayed) || 0,
          played_at: played_at,
          source: 'import', // Mark as import data
        };

        // Skip plays with 0 duration
        if (playData.duration_ms === 0) {
          return;
        }

        plays.push(playData);
      } catch (error) {
        errors.push(`Error processing item at index ${index}: ${error.message}`);
      }
    });

    return { plays, errors };
  }

  // Batch insert plays into Supabase
  async batchInsertPlays(plays, batchSize = 100) {
    const results = {
      inserted: 0,
      duplicates: 0,
      errors: [],
    };

    for (let i = 0; i < plays.length; i += batchSize) {
      const batch = plays.slice(i, i + batchSize);
      
      try {
        const { error } = await supabase
          .from('spotify_plays')
          .upsert(batch, {
            onConflict: 'user_id,track_id,played_at',
            ignoreDuplicates: true,
          });

        if (error) {
          results.errors.push(`Batch ${i}-${i + batchSize}: ${error.message}`);
        } else {
          // Supabase doesn't return count for upsert with ignoreDuplicates
          // We'll estimate based on batch size
          results.inserted += batch.length;
        }
      } catch (error) {
        results.errors.push(`Batch ${i}-${i + batchSize}: ${error.message}`);
      }
    }

    return results;
  }

  // Check for duplicate uploads
  async checkDuplicateUpload(filename, fileHash) {
    try {
      const { data, error } = await supabase
        .from('import_uploads')
        .select('*')
        .eq('filename', filename)
        .eq('file_hash', fileHash)
        .single();

      if (data) {
        return true; // Duplicate found
      }

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error;
      }

      return false;
    } catch (error) {
      console.error('Error checking duplicate upload:', error);
      // Continue with upload even if duplicate check fails
      return false;
    }
  }

  // Record upload attempt
  async recordUpload(filename, fileHash, totalPlays, insertedPlays) {
    try {
      const { error } = await supabase
        .from('import_uploads')
        .insert({
          filename,
          file_hash: fileHash,
          user_id: this.userId,
          total_plays: totalPlays,
          inserted_plays: insertedPlays,
          uploaded_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error recording upload:', error);
      }
    } catch (error) {
      console.error('Error recording upload:', error);
    }
  }

  // Main import function
  async importStreamingHistory(filename, data) {
    const startTime = Date.now();
    let fileHash = null;

    try {
      // Generate file hash
      fileHash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');

      // Check for duplicate uploads
      const isDuplicate = await this.checkDuplicateUpload(filename, fileHash);
      if (isDuplicate) {
        throw new Error('This file has already been uploaded.');
      }

      // Validate file format
      this.validateFile(filename, data);

      // Parse and transform data
      const { plays, errors: parseErrors } = this.parseStreamingHistory(data);

      if (parseErrors.length > 0) {
        console.warn('Parse errors:', parseErrors);
      }

      if (plays.length === 0) {
        throw new Error('No valid plays found in file.');
      }

      // Filter out import plays that are within ±5 seconds of existing API plays
      console.log('Filtering import plays for duplicates with API data...');
      const filteredPlays = await this.deduplicator.filterNewPlays(plays);
      
      if (filteredPlays.length === 0) {
        throw new Error('All plays were filtered out as duplicates of existing API data.');
      }

      const duplicatesRemoved = plays.length - filteredPlays.length;
      console.log(`Filtered ${duplicatesRemoved} duplicate import plays`);

      // Batch insert filtered plays
      const insertResults = await this.batchInsertPlays(filteredPlays);

      // Record upload attempt
      await this.recordUpload(filename, fileHash, plays.length, insertResults.inserted);

      const duration = Date.now() - startTime;

      return {
        success: true,
        filename,
        totalPlays: plays.length,
        insertedPlays: insertResults.inserted,
        duplicates: plays.length - insertResults.inserted,
        parseErrors: parseErrors.length,
        insertErrors: insertResults.errors.length,
        duration: `${duration}ms`,
      };

    } catch (error) {
      console.error('Import error:', error);
      
      return {
        success: false,
        filename,
        error: error.message,
        duration: `${Date.now() - startTime}ms`,
      };
    }
  }
}

export default SpotifyHistoryImporter;
