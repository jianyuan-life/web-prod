-- C/G15 structured report cost ledger.
-- Stores pre-call worst-case reservations so process/report retries cannot reset spend to zero.

create table if not exists public.consultation_cost_ledgers (
  report_id text primary key,
  plan text not null check (plan in ('C', 'G15')),
  policy_version text not null,
  ledger jsonb not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consultation_cost_ledgers enable row level security;
revoke all on table public.consultation_cost_ledgers from anon, authenticated;

create or replace function public.cas_consultation_cost_ledger(
  p_report_id text,
  p_plan text,
  p_policy_version text,
  p_ledger jsonb,
  p_expected_version bigint
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next bigint;
begin
  if p_report_id is null or p_report_id !~ '^report:[A-Za-z0-9._:-]+$' then
    raise exception 'invalid report id';
  end if;
  if p_plan not in ('C', 'G15') or p_policy_version is null or p_ledger is null then
    raise exception 'invalid consultation cost ledger payload';
  end if;
  if p_expected_version = 0 then
    insert into public.consultation_cost_ledgers (
      report_id, plan, policy_version, ledger, version, updated_at
    ) values (
      p_report_id, p_plan, p_policy_version, p_ledger, 1, now()
    )
    on conflict (report_id) do nothing
    returning version into v_next;
  else
    update public.consultation_cost_ledgers
       set ledger = p_ledger,
           version = version + 1,
           updated_at = now()
     where report_id = p_report_id
       and plan = p_plan
       and policy_version = p_policy_version
       and version = p_expected_version
    returning version into v_next;
  end if;

  if v_next is null then
    raise exception 'consultation cost ledger compare-and-swap conflict'
      using errcode = '40001';
  end if;
  return v_next;
end;
$$;

revoke all on function public.cas_consultation_cost_ledger(text, text, text, jsonb, bigint) from public;
grant execute on function public.cas_consultation_cost_ledger(text, text, text, jsonb, bigint) to service_role;

create table if not exists public.consultation_chapter_drafts (
  report_id text not null,
  idempotency_key text not null,
  input_hash text not null,
  prompt_version_hash text not null,
  output_hash text not null,
  draft jsonb not null,
  created_at timestamptz not null default now(),
  primary key (report_id, idempotency_key)
);

alter table public.consultation_chapter_drafts enable row level security;
revoke all on table public.consultation_chapter_drafts from anon, authenticated;

create or replace function public.save_consultation_chapter_draft(
  p_report_id text,
  p_idempotency_key text,
  p_input_hash text,
  p_prompt_version_hash text,
  p_output_hash text,
  p_draft jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.consultation_chapter_drafts%rowtype;
begin
  if p_report_id is null or p_report_id !~ '^report:[A-Za-z0-9._:-]+$' then
    raise exception 'invalid report id';
  end if;
  if p_idempotency_key is null or p_draft is null or
     p_input_hash !~ '^sha256:[0-9a-f]{64}$' or
     p_prompt_version_hash !~ '^sha256:[0-9a-f]{64}$' or
     p_output_hash !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'invalid consultation chapter receipt';
  end if;

  insert into public.consultation_chapter_drafts (
    report_id, idempotency_key, input_hash, prompt_version_hash, output_hash, draft
  ) values (
    p_report_id, p_idempotency_key, p_input_hash, p_prompt_version_hash, p_output_hash, p_draft
  ) on conflict (report_id, idempotency_key) do nothing;

  select * into v_existing
    from public.consultation_chapter_drafts
   where report_id = p_report_id and idempotency_key = p_idempotency_key;

  if v_existing.input_hash <> p_input_hash or
     v_existing.prompt_version_hash <> p_prompt_version_hash or
     v_existing.output_hash <> p_output_hash or
     v_existing.draft <> p_draft then
    raise exception 'consultation chapter idempotency conflict'
      using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.save_consultation_chapter_draft(text, text, text, text, text, jsonb) from public;
grant execute on function public.save_consultation_chapter_draft(text, text, text, text, text, jsonb) to service_role;
