-- Facts about the person that roles are tailored from. One row today:
-- id 'resume', data {text, updatedOn} — the master resume, the only source the
-- agent may use when it writes a role-specific resume. Same access rules as the
-- other tables: server (service_role) only, RLS on with no policies.

create table public.profile (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.profile enable row level security;

revoke all on public.profile from anon, authenticated;
grant select, insert, update, delete on public.profile to service_role;

create trigger profile_set_updated_at
  before update on public.profile
  for each row execute function public.set_updated_at();
