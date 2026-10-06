-- Additive server-only operational ledger. Review and apply separately; never client accessible.
CREATE SCHEMA IF NOT EXISTS agent_private;
REVOKE ALL ON SCHEMA agent_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS agent_private.model_budgets (
 service text NOT NULL, principal text NOT NULL, period bigint NOT NULL,
 requests bigint NOT NULL DEFAULT 0, reserved_tokens bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(service, principal, period),
 CHECK(requests >= 0 AND reserved_tokens >= 0)
);
ALTER TABLE agent_private.model_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_private.model_budgets FROM PUBLIC, anon, authenticated;
-- The migration owner can use the ledger. Grant only the selected server runtime role
-- USAGE on schema and SELECT/INSERT/UPDATE on table after explicit deployment review.
-- Expired periods may be pruned by a server task after two days. No user content is stored.

-- Dedicated NOLOGIN groups avoid broad BYPASSRLS privileges. Runtime membership is
-- a separate, reviewed grant to the actual deployed server role, never a client role.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='yaqin_budget_server') THEN CREATE ROLE yaqin_budget_server NOLOGIN; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='standalone_budget_server') THEN CREATE ROLE standalone_budget_server NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA agent_private TO yaqin_budget_server, standalone_budget_server;
GRANT SELECT,INSERT,UPDATE ON agent_private.model_budgets TO yaqin_budget_server, standalone_budget_server;
DROP POLICY IF EXISTS yaqin_server ON agent_private.model_budgets;
CREATE POLICY yaqin_server ON agent_private.model_budgets TO yaqin_budget_server
 USING(service='yaqin') WITH CHECK(service='yaqin');
DROP POLICY IF EXISTS standalone_server ON agent_private.model_budgets;
CREATE POLICY standalone_server ON agent_private.model_budgets TO standalone_budget_server
 USING(service='standalone') WITH CHECK(service='standalone');

-- Provider usage is independent of quota reservations. Apply before deploying accounting.
-- Totals include input/output and separate cache read/creation counts.
-- NULL tokens means a started call has no durable provider count (including timeouts).
-- No historical backfill from reservations; retain usage independently of quota pruning.
CREATE TABLE IF NOT EXISTS agent_private.model_usage (
 service text NOT NULL, call_id text NOT NULL, user_id uuid NOT NULL, period bigint NOT NULL,
 tokens bigint CHECK(tokens >= 0),
 PRIMARY KEY(service,call_id)
);
-- Provider-reported breakdown, nullable: older rows and unfinished calls stay unknown.
ALTER TABLE agent_private.model_usage ADD COLUMN IF NOT EXISTS input_tokens bigint CHECK(input_tokens >= 0);
ALTER TABLE agent_private.model_usage ADD COLUMN IF NOT EXISTS output_tokens bigint CHECK(output_tokens >= 0);
ALTER TABLE agent_private.model_usage ADD COLUMN IF NOT EXISTS cache_read_tokens bigint CHECK(cache_read_tokens >= 0);
ALTER TABLE agent_private.model_usage ADD COLUMN IF NOT EXISTS cache_write_tokens bigint CHECK(cache_write_tokens >= 0);
CREATE INDEX IF NOT EXISTS model_usage_user_day ON agent_private.model_usage(service,period,user_id);
ALTER TABLE agent_private.model_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_private.model_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON agent_private.model_usage TO yaqin_budget_server, standalone_budget_server;
DROP POLICY IF EXISTS yaqin_server ON agent_private.model_usage;
CREATE POLICY yaqin_server ON agent_private.model_usage TO yaqin_budget_server
 USING(service='yaqin') WITH CHECK(service='yaqin');
DROP POLICY IF EXISTS standalone_server ON agent_private.model_usage;
CREATE POLICY standalone_server ON agent_private.model_usage TO standalone_budget_server
 USING(service='standalone') WITH CHECK(service='standalone');
