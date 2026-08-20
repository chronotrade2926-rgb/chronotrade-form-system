-- Phase B live security advisor hardening.
-- Non-destructive: function execution permissions and search_path only.

alter function public.refresh_idea_signal_counts(uuid) set search_path = public;
alter function public.refresh_idea_signal_counts_trigger() set search_path = public;

revoke execute on function public.enforce_super_admin_security() from anon;
revoke execute on function public.enforce_super_admin_security() from authenticated;
revoke execute on function public.enforce_super_admin_security() from public;

grant execute on function public.enforce_super_admin_security() to service_role;
