-- Job Hunt HQ schema.
--
-- Only the Next.js server talks to the database, using the project's secret key
-- (service_role). The browser and the scheduled agent go through /api/*, so the
-- public anon/authenticated roles get no access at all: RLS is on with no
-- policies, and their table and function privileges are revoked.

/* ---------- tables ---------- */

create table public.jobs (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.brief (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table public.events (
  id       bigint generated always as identity primary key,
  job_id   text not null,
  company  text,
  field    text not null,
  old_val  text,
  new_val  text,
  at       timestamptz not null default now()
);

create index events_at_idx on public.events (at desc);

alter table public.jobs   enable row level security;
alter table public.brief  enable row level security;
alter table public.events enable row level security;

revoke all on public.jobs, public.brief, public.events from anon, authenticated;
grant select, insert, update, delete on public.jobs, public.brief to service_role;
grant select, insert on public.events to service_role;

/* ---------- updated_at ---------- */

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create trigger brief_set_updated_at
  before update on public.brief
  for each row execute function public.set_updated_at();

/* ---------- activity log ----------
   Every change to status, interviewAt, deadline or messagedOn writes an event,
   whatever made the change: the API, the agent, or an edit in Supabase Studio.
   import_seed() turns this off for the bulk import. */

create function public.log_job_events()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f text;
begin
  if coalesce(current_setting('app.skip_events', true), '') = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.events (job_id, company, field, old_val, new_val)
    values (new.id, coalesce(new.data->>'company', ''), 'created', null,
            coalesce(new.data->>'status', 'wishlist'));
    return null;
  end if;

  foreach f in array array['status', 'interviewAt', 'deadline', 'messagedOn'] loop
    if coalesce(old.data->>f, '') <> coalesce(new.data->>f, '') then
      insert into public.events (job_id, company, field, old_val, new_val)
      values (new.id, coalesce(new.data->>'company', old.data->>'company', ''), f,
              old.data->>f, new.data->>f);
    end if;
  end loop;
  return null;
end;
$$;

create trigger jobs_log_events
  after insert or update on public.jobs
  for each row execute function public.log_job_events();

/* ---------- writes ---------- */

-- Merge (or, with p_replace, overwrite) one row in a single statement, so two
-- writers patching different fields at once can't drop each other's changes.
create function public.merge_job(p_id text, p_patch jsonb, p_replace boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  saved jsonb;
begin
  p_patch := (p_patch - 'id' - '_updatedAt')
    || jsonb_build_object('updatedOn', to_char(now() at time zone 'utc', 'YYYY-MM-DD'));

  insert into public.jobs as j (id, data)
  values (p_id, p_patch)
  on conflict (id) do update
    set data = case when p_replace then excluded.data else j.data || excluded.data end
  returning j.data into saved;

  return saved || jsonb_build_object('id', p_id);
end;
$$;

-- One-time import of the bundled snapshot. Existing rows are left alone and no
-- 'created' events are written. Returns the number of rows actually inserted.
create function public.import_seed(p_jobs jsonb, p_brief jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('app.skip_events', 'on', true);

  insert into public.jobs (id, data)
  select r->>'id', r - 'id'
    from jsonb_array_elements(p_jobs) as r
   where coalesce(r->>'id', '') <> ''
  on conflict (id) do nothing;
  get diagnostics n = row_count;

  if p_brief is not null and p_brief <> '{}'::jsonb then
    insert into public.brief (id, data) values ('today', p_brief)
    on conflict (id) do nothing;
  end if;

  return n;
end;
$$;

revoke execute on function
  public.set_updated_at(),
  public.log_job_events(),
  public.merge_job(text, jsonb, boolean),
  public.import_seed(jsonb, jsonb)
from public, anon, authenticated;

grant execute on function
  public.merge_job(text, jsonb, boolean),
  public.import_seed(jsonb, jsonb)
to service_role;
