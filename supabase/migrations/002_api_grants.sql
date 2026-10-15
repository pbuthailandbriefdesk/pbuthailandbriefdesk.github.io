-- Lets the Supabase Data API see the tables. Needed on projects created with
-- "automatically expose new tables" switched off. Row level security (001_schema.sql)
-- still decides which rows each signed-in person can read or change; anonymous
-- visitors get no table access at all.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Same for anything added later.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

notify pgrst, 'reload schema';
