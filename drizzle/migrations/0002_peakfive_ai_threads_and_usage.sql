CREATE TABLE public.ai_conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, title text NOT NULL DEFAULT 'New conversation', messages jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), revision integer NOT NULL DEFAULT 0, CHECK (char_length(title) BETWEEN 1 AND 120), CHECK (jsonb_typeof(messages) = 'array'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_conversations_owner ON public.ai_conversations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX ai_conversations_owner_updated ON public.ai_conversations(user_id, updated_at DESC);
CREATE TABLE public.ai_usage (scope text NOT NULL, day date NOT NULL DEFAULT CURRENT_DATE, requests integer NOT NULL DEFAULT 0, PRIMARY KEY(scope,day));
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.ai_access_blocks (scope text PRIMARY KEY, reason text NOT NULL, status integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ai_access_blocks TO service_role;
ALTER TABLE public.ai_access_blocks ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.reserve_ai_request(p_scope text, p_authenticated boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_person integer; v_total integer;
BEGIN
PERFORM pg_advisory_xact_lock(hashtext('peakfive-ai-usage'));
SELECT requests INTO v_total FROM public.ai_usage WHERE scope = 'shared' AND day = CURRENT_DATE;
SELECT requests INTO v_person FROM public.ai_usage WHERE scope = p_scope AND day = CURRENT_DATE;
IF coalesce(v_total,0) >= 300 OR coalesce(v_person,0) >= (CASE WHEN p_authenticated THEN 100 ELSE 20 END) THEN RETURN false; END IF;
INSERT INTO public.ai_usage(scope,day,requests) VALUES ('shared',CURRENT_DATE,1) ON CONFLICT(scope,day) DO UPDATE SET requests=ai_usage.requests+1;
INSERT INTO public.ai_usage(scope,day,requests) VALUES (p_scope,CURRENT_DATE,1) ON CONFLICT(scope,day) DO UPDATE SET requests=ai_usage.requests+1;
RETURN true;
END; $fn$;
REVOKE ALL ON FUNCTION public.reserve_ai_request(text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_request(text,boolean) TO service_role;