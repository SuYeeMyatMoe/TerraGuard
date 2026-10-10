-- Operational records only. Detection, model, simulation and AI cache stay in files.
create table public.actions (
    id bigint generated always as identity primary key,
    scenario_id text not null,
    incident_id text not null,
    action text not null check (action in ('ASSIGN_INSPECTION', 'REQUEST_RECHECK', 'DISMISS')),
    reason text,
    recommendation_at_time text,
    created_at timestamptz not null default now()
);

create table public.incident_status (
    incident_id text primary key,
    status text not null,
    updated_at timestamptz not null default now()
);

create table public.team_assignments (
    id bigint generated always as identity primary key,
    action_id bigint not null references public.actions(id),
    incident_id text not null,
    scenario_id text not null,
    team_name text not null check (length(btrim(team_name)) between 1 and 120),
    assigned_at timestamptz not null default now()
);
create index team_assignments_action_id_idx on public.team_assignments(action_id);

alter table public.actions enable row level security;
alter table public.incident_status enable row level security;
alter table public.team_assignments enable row level security;

-- Closed to browser roles: no RLS policies and no table/sequence grants.
revoke all on table public.actions, public.incident_status, public.team_assignments
    from public, anon, authenticated, service_role;
revoke all on sequence public.actions_id_seq, public.team_assignments_id_seq
    from public, anon, authenticated, service_role;
grant select, insert on table public.actions, public.team_assignments to service_role;
grant select, insert, update on table public.incident_status to service_role;
grant usage, select on sequence public.actions_id_seq, public.team_assignments_id_seq to service_role;

create function public.record_action(
    p_scenario_id text,
    p_incident_id text,
    p_action text,
    p_reason text default null,
    p_recommendation text default null,
    p_team_name text default null
)
returns setof public.actions
language plpgsql
security invoker
set search_path = ''
as $$
declare
    saved public.actions%rowtype;
    status_text text;
    recorded_at timestamptz;
begin
    if p_team_name is not null and p_action <> 'ASSIGN_INSPECTION' then
        raise exception 'A named team requires ASSIGN_INSPECTION' using errcode = '22023';
    end if;
    if p_action = 'DISMISS' and (p_reason is null or btrim(p_reason) = '') then
        raise exception 'Dismissing an incident requires a reason' using errcode = '22023';
    end if;

    -- Serialize decisions before allocating audit IDs or changing latest status.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_incident_id, 0));
    recorded_at := pg_catalog.clock_timestamp();
    status_text := case p_action
        when 'ASSIGN_INSPECTION' then 'Inspection assigned'
        when 'REQUEST_RECHECK' then 'Recheck requested'
        when 'DISMISS' then 'Dismissed'
    end;

    insert into public.actions (scenario_id, incident_id, action, reason, recommendation_at_time, created_at)
    values (p_scenario_id, p_incident_id, p_action, p_reason, p_recommendation, recorded_at)
    returning * into saved;

    insert into public.incident_status (incident_id, status, updated_at)
    values (p_incident_id, status_text, recorded_at)
    on conflict (incident_id) do update
    set status = excluded.status, updated_at = excluded.updated_at;

    if p_team_name is not null then
        insert into public.team_assignments (action_id, incident_id, scenario_id, team_name, assigned_at)
        values (saved.id, p_incident_id, p_scenario_id, btrim(p_team_name), recorded_at);
    end if;
    return next saved;
end;
$$;

revoke all on function public.record_action(text, text, text, text, text, text)
    from public, anon, authenticated, service_role;
grant execute on function public.record_action(text, text, text, text, text, text) to service_role;
