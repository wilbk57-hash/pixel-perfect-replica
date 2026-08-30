create or replace function public.my_business_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when auth.uid() is null then null else public.business_id(auth.uid()) end
$$;

revoke all on function public.business_id(uuid) from public, anon, authenticated;
revoke all on function public.my_business_id() from public, anon;
grant execute on function public.my_business_id() to authenticated;
grant execute on function public.business_id(uuid) to service_role;