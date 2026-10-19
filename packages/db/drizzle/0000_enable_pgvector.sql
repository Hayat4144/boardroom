-- pgvector must be installed on the server. Locally, scripts/setup-local-db.sql
-- creates it as superuser, so this is a no-op there.
CREATE EXTENSION IF NOT EXISTS vector;
