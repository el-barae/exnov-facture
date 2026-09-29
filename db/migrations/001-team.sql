-- Organisation unique EXNOV. Les identités et sessions sont gérées par Better Auth.
CREATE TABLE IF NOT EXISTS team_members (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','manager','technician','technician_pro')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_projects (
  id uuid PRIMARY KEY,
  data jsonb NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (data->>'id' = id::text)
);
CREATE TABLE IF NOT EXISTS project_tasks (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES team_projects(id) ON DELETE CASCADE,
  assignee_id text NOT NULL REFERENCES team_members(user_id),
  data jsonb NOT NULL,
  CHECK (data->>'id' = id::text),
  CHECK (data->>'projectId' = project_id::text),
  CHECK (data->>'assigneeId' = assignee_id)
);
CREATE INDEX IF NOT EXISTS project_tasks_assignment ON project_tasks(assignee_id, project_id);
CREATE TABLE IF NOT EXISTS project_files (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES team_projects(id) ON DELETE CASCADE,
  uploaded_by text NOT NULL REFERENCES "user"(id),
  drive_file_id text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (length(sha256) = 64)
);
CREATE INDEX IF NOT EXISTS project_files_project ON project_files(project_id);
-- Les transferts sont découpés pour rester sous la limite des requêtes serverless.
CREATE TABLE IF NOT EXISTS project_uploads (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES team_projects(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL,
  bytes bytea NOT NULL DEFAULT ''::bytea,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day',
  CHECK (octet_length(bytes) <= 20971520)
);
CREATE INDEX IF NOT EXISTS project_uploads_owner ON project_uploads(user_id);
CREATE TABLE IF NOT EXISTS team_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id text NOT NULL REFERENCES "user"(id),
  project_id uuid REFERENCES team_projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_ai_usage (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  day date NOT NULL,
  requests integer NOT NULL CHECK (requests > 0),
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS project_imports (
  local_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES team_projects(id),
  imported_by text NOT NULL REFERENCES "user"(id),
  snapshot jsonb NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Une suppression Drive échouée est reprise après commit ou par files:cleanup.
CREATE TABLE IF NOT EXISTS drive_file_cleanup (
  file_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
