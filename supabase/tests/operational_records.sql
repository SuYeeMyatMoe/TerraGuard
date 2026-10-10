-- Run with the SQL editor / MCP after the migration. No test rows survive.
begin;
set local role service_role;
do $$
declare
    saved public.actions%rowtype;
    incident text := '__terraguard_test_' || gen_random_uuid()::text;
begin
    select * into saved from public.record_action('test', incident, 'ASSIGN_INSPECTION', null, 'INSPECT', ' Alpha ');
    assert saved.id is not null;
    assert (select count(*) from public.actions where incident_id = incident) = 1;
    assert (select status from public.incident_status where incident_id = incident) = 'Inspection assigned';
    assert (select team_name from public.team_assignments where action_id = saved.id) = 'Alpha';
    assert (select assigned_at from public.team_assignments where action_id = saved.id) = saved.created_at;

    perform public.record_action('test', incident, 'REQUEST_RECHECK', null, 'RECHECK');
    assert (select count(*) from public.actions where incident_id = incident) = 2;
    assert (select count(*) from public.incident_status where incident_id = incident) = 1;
    assert (select status from public.incident_status where incident_id = incident) = 'Recheck requested';

    -- The assignment constraint fails AFTER audit insertion and status upsert.
    begin
        perform public.record_action('test', incident, 'ASSIGN_INSPECTION', null, 'INSPECT', ' ');
        raise exception 'Blank assignment unexpectedly succeeded';
    exception when check_violation then null;
    end;
    assert (select count(*) from public.actions where incident_id = incident) = 2;
    assert (select status from public.incident_status where incident_id = incident) = 'Recheck requested';
    assert (select count(*) from public.team_assignments where incident_id = incident) = 1;

    begin
        perform public.record_action('test', incident || '_new', 'ASSIGN_INSPECTION', null, 'INSPECT', repeat('A', 121));
        raise exception 'Oversized assignment unexpectedly succeeded';
    exception when check_violation then null;
    end;
    assert not exists (select from public.actions where incident_id = incident || '_new');
    assert not exists (select from public.incident_status where incident_id = incident || '_new');

    begin
        perform public.record_action('test', incident, 'DISMISS', ' ', 'MONITOR');
        raise exception 'Dismissal without a reason unexpectedly succeeded';
    exception when invalid_parameter_value then null;
    end;
end;
$$;
reset role;
do $$
declare
    browser_role text;
    operational_table text;
    privilege text;
begin
    foreach browser_role in array array['anon', 'authenticated'] loop
        foreach operational_table in array array['actions', 'incident_status', 'team_assignments'] loop
            foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
                assert not has_table_privilege(browser_role, 'public.' || operational_table, privilege);
            end loop;
            assert (select relrowsecurity from pg_class where oid = ('public.' || operational_table)::regclass);
        end loop;
        assert not has_function_privilege(browser_role, 'public.record_action(text,text,text,text,text,text)', 'EXECUTE');
    end loop;
    assert has_function_privilege('service_role', 'public.record_action(text,text,text,text,text,text)', 'EXECUTE');
end;
$$;
rollback;
