-- Spotify Stats Database Schema
-- Run this in your Supabase SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add image_url column if it doesn't exist (for existing tables)
ALTER TABLE users ADD COLUMN IF NOT EXISTS image_url TEXT;

-- User tokens table
CREATE TABLE IF NOT EXISTS user_tokens (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spotify plays table
CREATE TABLE IF NOT EXISTS spotify_plays (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    track_name TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_ms INTEGER,
    played_at TIMESTAMP WITH TIME ZONE NOT NULL,
    source TEXT DEFAULT 'import',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Import history table
CREATE TABLE IF NOT EXISTS import_history (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    total_plays INTEGER,
    inserted_plays INTEGER,
    updated_plays INTEGER,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_spotify_plays_user_id ON spotify_plays(user_id);
CREATE INDEX IF NOT EXISTS idx_spotify_plays_played_at ON spotify_plays(played_at);
CREATE INDEX IF NOT EXISTS idx_spotify_plays_track_id ON spotify_plays(track_id);
CREATE INDEX IF NOT EXISTS idx_import_history_user_id ON import_history(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotify_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now - in production you'd restrict by user_id)
CREATE POLICY "Enable all operations on users" ON users USING (true) WITH CHECK (true);
CREATE POLICY "Enable all operations on user_tokens" ON user_tokens USING (true) WITH CHECK (true);
CREATE POLICY "Enable all operations on spotify_plays" ON spotify_plays USING (true) WITH CHECK (true);
CREATE POLICY "Enable all operations on import_history" ON import_history USING (true) WITH CHECK (true);
