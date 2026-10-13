-- Disposable experiment schema, NOT an application migration.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE TABLE IF NOT EXISTS study_metric_matches (
  "matchId" text NOT NULL REFERENCES matches("matchId") ON DELETE CASCADE,
  generation int NOT NULL, patch text, "queueId" int NOT NULL, "mapId" int NOT NULL,
  "gameCreation" bigint NOT NULL, common jsonb NOT NULL,
  PRIMARY KEY("matchId",generation)
);
CREATE INDEX IF NOT EXISTS study_metric_cohort ON study_metric_matches(patch,"queueId","mapId","gameCreation");
CREATE TABLE IF NOT EXISTS study_metric_groups (
  "matchId" text NOT NULL, generation int NOT NULL,
  "subjectKind" text NOT NULL,"subjectId" text NOT NULL,"horizonKey" text NOT NULL,
  "championId" int, role text, "playerIds" text[] NOT NULL, meta jsonb NOT NULL, metrics jsonb NOT NULL,
  PRIMARY KEY("matchId",generation,"subjectKind","subjectId","horizonKey"),
  FOREIGN KEY("matchId",generation) REFERENCES study_metric_matches("matchId",generation) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS study_group_subject ON study_metric_groups("subjectKind","subjectId","horizonKey");
CREATE INDEX IF NOT EXISTS study_group_champion ON study_metric_groups("championId",role);
CREATE INDEX IF NOT EXISTS study_group_players ON study_metric_groups USING gin("playerIds");
CREATE TABLE IF NOT EXISTS study_jobs (
  "matchId" text PRIMARY KEY, stage text NOT NULL DEFAULT 'pending',
  queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  facts_at timestamptz, metrics_at timestamptz, completed_at timestamptz,
  packed jsonb, deltas jsonb
);
CREATE INDEX IF NOT EXISTS study_jobs_stage ON study_jobs(stage,queued_at);
