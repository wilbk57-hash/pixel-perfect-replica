CREATE OR REPLACE FUNCTION public.my_business_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  select case
    when auth.uid() is null then null
    else coalesce(
      (select owner_id from public.user_roles where user_id = auth.uid() and role = 'funcionario' limit 1),
      auth.uid()
    )
  end
$function$;

REVOKE ALL ON FUNCTION public.my_business_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_business_id() TO authenticated;