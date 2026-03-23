create or replace function public.handle_new_doifly_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    username,
    username_hash,
    visual_mode,
    drone_profile,
    scheduled_flights,
    scheduled_reports
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.raw_user_meta_data ->> 'username_hash', ''),
    coalesce(new.raw_user_meta_data ->> 'visual_mode', 'night'),
    coalesce((new.raw_user_meta_data -> 'drone_profile')::jsonb, '{}'::jsonb),
    coalesce((new.raw_user_meta_data -> 'scheduled_flights')::jsonb, '[]'::jsonb),
    coalesce((new.raw_user_meta_data -> 'scheduled_reports')::jsonb, '{}'::jsonb)
  )
  on conflict (id) do update set
    username = excluded.username,
    username_hash = excluded.username_hash,
    visual_mode = excluded.visual_mode,
    drone_profile = excluded.drone_profile,
    scheduled_flights = excluded.scheduled_flights,
    scheduled_reports = excluded.scheduled_reports,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_doifly_user();
