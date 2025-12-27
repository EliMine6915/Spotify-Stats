-- Migration: Add source column and update unique constraint
-- This migration is lossless and safe to run on existing data

-- Step 1: Add the source column with default value
ALTER TABLE spotify_plays 
ADD COLUMN source TEXT NOT NULL DEFAULT 'api';

-- Step 2: Drop the existing unique constraint
-- Note: The constraint name might vary, so we'll try to drop it by name
-- If you get an error here, check the actual constraint name with:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'spotify_plays'::regclass;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'spotify_plays'::regclass 
        AND conname = 'spotify_plays_user_id_track_id_played_at_key'
    ) THEN
        ALTER TABLE spotify_plays DROP CONSTRAINT spotify_plays_user_id_track_id_played_at_key;
    END IF;
END $$;

-- Step 3: Add the new unique constraint
ALTER TABLE spotify_plays 
ADD CONSTRAINT spotify_plays_unique_play 
UNIQUE(user_id, track_name, artist, played_at);

-- Step 4: Make track_id nullable (if it's not already)
ALTER TABLE spotify_plays 
ALTER COLUMN track_id DROP NOT NULL;

-- Step 5: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_spotify_plays_source 
ON spotify_plays(source);

CREATE INDEX IF NOT EXISTS idx_spotify_plays_user_source 
ON spotify_plays(user_id, source);

-- Step 6: Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'spotify_plays' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Step 7: Show the new constraints
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'spotify_plays'::regclass
ORDER BY conname;
