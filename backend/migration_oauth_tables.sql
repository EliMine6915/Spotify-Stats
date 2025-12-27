-- Migration: Add user_tokens and users tables for OAuth
-- This migration adds the necessary tables for backend OAuth integration

-- Users table for storing Spotify user profiles
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY, -- Spotify user ID
    email TEXT,
    display_name TEXT,
    country TEXT,
    product TEXT, -- free, premium, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User tokens table for storing OAuth tokens
CREATE TABLE IF NOT EXISTS user_tokens (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_tokens_expires_at ON user_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_tokens_updated_at ON user_tokens(updated_at DESC);

-- Add comments for documentation
COMMENT ON TABLE users IS 'Spotify user profiles';
COMMENT ON TABLE user_tokens IS 'OAuth tokens for Spotify users';
COMMENT ON COLUMN user_tokens.access_token IS 'Spotify access token (should be encrypted in production)';
COMMENT ON COLUMN user_tokens.refresh_token IS 'Spotify refresh token (should be encrypted in production)';
COMMENT ON COLUMN user_tokens.expires_at IS 'Token expiration time';
