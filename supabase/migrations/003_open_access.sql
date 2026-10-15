-- OPEN ACCESS: no sign-in. People pick their name in the app.
-- Decided by the project owner on 2026-10-15, accepting that anyone with the site
-- link can read and change every table. To go back to signed-in access, drop the
-- "open" policies below and re-run the policy section of 001_schema.sql.

do $$
declare t text; p record;
begin
  foreach t in array array['briefs','brief_events','brief_ios','brief_lines','brief_ad_groups','brief_ads',
                           'desk_team','brands','holidays','sdf_defaults','notifications']
  loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "open" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;

notify pgrst, 'reload schema';

select tablename, policyname, roles from pg_policies where schemaname = 'public' order by tablename;
