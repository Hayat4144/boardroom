-- One-time local Postgres setup for Boardroom development.
-- Run as a superuser (pgvector is not a "trusted" extension, so the app role
-- can't create it itself):
--
--   sudo -u postgres psql -f scripts/setup-local-db.sql
--
-- Safe to re-run.

SELECT 'CREATE ROLE boardroom LOGIN PASSWORD ''boardroom'''
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'boardroom')
\gexec

SELECT 'CREATE DATABASE boardroom OWNER boardroom'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'boardroom')
\gexec

\connect boardroom
CREATE EXTENSION IF NOT EXISTS vector;
