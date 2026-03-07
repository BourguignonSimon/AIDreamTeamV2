-- Migration 001: PostgreSQL Extensions
-- Required extensions for Operia platform

-- UUID generation (v4)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Async HTTP calls from PostgreSQL — used to trigger evaluate-output Edge Function
-- after a workflow_node is inserted (AR-04: Asynchronous Quality Evaluation)
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- Full-text search (future use for document indexing)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
