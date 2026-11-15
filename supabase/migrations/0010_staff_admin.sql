-- Staff page: owners add people and change names, roles and access.
-- People are never deleted (their email is on holds and history); turn off "Active" instead.

create or replace function public.save_staff(p_email text, p_name text, p_role text, p_active boolean)
returns public.staff
language plpgsql security definer set search_path = public as $$
declare
  v_me    text := public.current_email();
  v_email text := lower(trim(p_email));
  v_row   public.staff;
begin
  if not exists (select 1 from public.staff where email = v_me and active and role = 'owner') then
    raise exception 'Only an owner can change staff.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Enter a name.';
  end if;
  if v_email = v_me and (p_role <> 'owner' or not p_active) then
    raise exception 'You can''t remove your own owner access.';
  end if;

  insert into public.staff (email, name, role, active)
  values (v_email, trim(p_name), p_role, p_active)
  on conflict (email) do update set name = excluded.name, role = excluded.role, active = excluded.active
  returning * into v_row;
  return v_row;
end $$;

revoke execute on function public.save_staff(text, text, text, boolean) from public, anon;
