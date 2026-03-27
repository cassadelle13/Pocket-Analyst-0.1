-- Migration: Add projects table to datatalk_meta schema
-- This replaces localStorage-based project storage with persistent Postgres storage

\connect datatalk

CREATE TABLE IF NOT EXISTS datatalk_meta.projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  viewport JSONB NULL,
  semantic_artifacts JSONB NULL
);

CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON datatalk_meta.projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_name_idx ON datatalk_meta.projects (name);

ALTER TABLE datatalk_meta.projects OWNER TO datatalk;
GRANT SELECT, INSERT, UPDATE, DELETE ON datatalk_meta.projects TO datatalk;

-- Add a sample project for demo purposes
INSERT INTO datatalk_meta.projects (id, name, description, nodes, viewport)
SELECT 
  'project_demo_' || extract(epoch from now())::text,
  'Demo Dashboard',
  'Sample dashboard project',
  '[]'::jsonb,
  '{"pan": {"x": 0, "y": 0}, "zoom": 1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM datatalk_meta.projects WHERE name = 'Demo Dashboard');
