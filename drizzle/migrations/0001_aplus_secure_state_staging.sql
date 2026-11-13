-- Applied from docs/secure-staging/central-state.review.sql (TEST/staging only).
-- Compatibility storage: original SQLite calculations run server-side; only an encrypted snapshot is persisted here.
CREATE SCHEMA IF NOT EXISTS aplus_private;
REVOKE ALL ON SCHEMA aplus_private FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS aplus_private.secure_state(instance text PRIMARY KEY,version bigint NOT NULL DEFAULT 0,payload jsonb,lease uuid,lease_until timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS aplus_private.secure_backups(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,instance text NOT NULL,version bigint NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE aplus_private.secure_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE aplus_private.secure_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA aplus_private FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.aplus_secure_acquire(p_instance text,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aplus_private AS $$
DECLARE r aplus_private.secure_state;
BEGIN
 IF p_instance !~ '^[-a-zA-Z0-9_]{1,64}$' THEN RAISE EXCEPTION 'invalid instance';END IF;
 INSERT INTO aplus_private.secure_state(instance) VALUES(p_instance) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM aplus_private.secure_state WHERE instance=p_instance FOR UPDATE;
 IF r.lease IS NOT NULL AND r.lease_until>now() THEN RETURN jsonb_build_object('acquired',false);END IF;
 UPDATE aplus_private.secure_state SET lease=p_token,lease_until=now()+interval '5 minutes' WHERE instance=p_instance;
 RETURN jsonb_build_object('acquired',true,'version',r.version,'payload',r.payload);
END $$;
CREATE OR REPLACE FUNCTION public.aplus_secure_checkpoint(p_instance text,p_token uuid,p_version bigint,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aplus_private AS $$
DECLARE r aplus_private.secure_state;
BEGIN
 SELECT * INTO r FROM aplus_private.secure_state WHERE instance=p_instance FOR UPDATE;
 IF r IS NULL OR r.lease IS DISTINCT FROM p_token OR r.version<>p_version OR r.lease_until<=now() THEN RAISE EXCEPTION 'stale transaction';END IF;
 IF p_payload->>'v'<>'1' OR jsonb_typeof(p_payload->'data')<>'string' OR octet_length(p_payload::text)>100000000 THEN RAISE EXCEPTION 'invalid snapshot';END IF;
 IF r.payload IS NOT NULL THEN INSERT INTO aplus_private.secure_backups(instance,version,payload) VALUES(p_instance,r.version,r.payload);END IF;
 UPDATE aplus_private.secure_state SET payload=p_payload,version=version+1,updated_at=now() WHERE instance=p_instance;
 DELETE FROM aplus_private.secure_backups WHERE instance=p_instance AND id NOT IN (SELECT id FROM aplus_private.secure_backups WHERE instance=p_instance ORDER BY id DESC LIMIT 30);
 RETURN jsonb_build_object('ok',true,'version',r.version+1);
END $$;
CREATE OR REPLACE FUNCTION public.aplus_secure_release(p_instance text,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aplus_private AS $$
BEGIN UPDATE aplus_private.secure_state SET lease=NULL,lease_until=NULL WHERE instance=p_instance AND lease=p_token;RETURN jsonb_build_object('ok',true);END $$;
REVOKE ALL ON FUNCTION public.aplus_secure_acquire(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.aplus_secure_checkpoint(text,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.aplus_secure_release(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplus_secure_acquire(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.aplus_secure_checkpoint(text,uuid,bigint,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.aplus_secure_release(text,uuid) TO service_role;