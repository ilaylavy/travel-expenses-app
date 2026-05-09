-- Revoke public EXECUTE on the is_split trigger helpers so they don't
-- show up under /rest/v1/rpc. They're only meant to be called from the
-- AFTER trigger on expense_splits.
--
-- Note: 20260509113519_is_split_trigger.sql already includes the same
-- revokes for fresh installs. This separate migration exists because
-- the trigger migration was applied first via the MCP server, then the
-- security advisors flagged the public-execute warning, and the revokes
-- were applied as a follow-up. Both migrations are idempotent.
revoke execute on function public.recompute_is_split(uuid) from public, anon, authenticated;
revoke execute on function public.expense_splits_maintain_is_split_flag() from public, anon, authenticated;
