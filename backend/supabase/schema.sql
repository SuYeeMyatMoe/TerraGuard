-- TerraGuard AI · operational records in Supabase
-- Run once in the Supabase SQL editor. Safe to re-run.
-- Only operational records live here: coordinator actions (audit), incident status, team assignments.
-- Detections, the model and simulation results stay in the files the backend loads.
-- The FastAPI backend is the only client (service-role / secret key in backend/.env). Never use this key in Next.js.

-- ---------------------------------------------------------------- Part 1 · tables (matches the current code)
create table if not exists public.actions (
  id bigint generated always as identity primary key,
  scenario_id text not null,
  incident_id text not null,
  action text not null check (action in ('ASSIGN_INSPECTION', 'REQUEST_RECHECK', 'DISMISS')),
  reason text,
  recommendation_at_time text,
  created_at timestamptz not null default now()
);

create table if not exists public.incident_status (
  incident_id text primary key,
  status text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.team_assignments (
  id bigint generated always as identity primary key,
  action_id bigint not null references public.actions(id),
  incident_id text not null,
  scenario_id text not null,
  team_name text not null,
  assigned_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Part 2 · decision snapshot (additive)
-- Makes each row a record someone could defend: the recommendation at that moment, the crew, and who was left waiting.
-- The backend still works without these columns (it keeps the audit row and reports that the snapshot was not stored).
alter table public.actions add column if not exists team_name text;
alter table public.actions add column if not exists priority_rank int;
alter table public.actions add column if not exists priority_score real;
alter table public.actions add column if not exists probability real;
alter table public.actions add column if not exists followed_recommendation boolean;
alter table public.actions add column if not exists reassigned_from text;
alter table public.actions add column if not exists left_waiting jsonb;   -- [{incident_id, region, probability, rank, recommendation}]
alter table public.actions add column if not exists archived_at timestamptz;
alter table public.team_assignments add column if not exists archived_at timestamptz;

create index if not exists actions_scenario_idx on public.actions (scenario_id, id desc);
create index if not exists team_assignments_scenario_idx on public.team_assignments (scenario_id, id desc);

-- ---------------------------------------------------------------- Part 3 · row-level security
-- RLS on, no policies: closed to the browser (anon / authenticated keys). The service role bypasses RLS.
alter table public.actions enable row level security;
alter table public.incident_status enable row level security;
alter table public.team_assignments enable row level security;

-- ---------------------------------------------------------------- Part 4 · append-only audit (optional, recommended)
-- Actions can be archived (archived_at) for a clean demo but never edited or deleted.
create or replace function public.actions_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'actions is append-only: rows cannot be deleted';
  end if;
  if (to_jsonb(new) - 'archived_at') is distinct from (to_jsonb(old) - 'archived_at') then
    raise exception 'actions is append-only: only archived_at may change';
  end if;
  return new;
end $$;

drop trigger if exists actions_append_only on public.actions;
create trigger actions_append_only
  before update or delete on public.actions
  for each row execute function public.actions_append_only();
