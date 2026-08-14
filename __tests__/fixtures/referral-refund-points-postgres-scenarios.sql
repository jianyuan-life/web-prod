\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('10000000-0000-4000-8000-000000000001', 'referrer-1@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'buyer-1@example.test'),
  ('20000000-0000-4000-8000-000000000001', 'referrer-2@example.test'),
  ('20000000-0000-4000-8000-000000000002', 'buyer-2@example.test'),
  ('70000000-0000-4000-8000-000000000001', 'legacy-referrer@example.test'),
  ('70000000-0000-4000-8000-000000000002', 'legacy-buyer@example.test'),
  ('80000000-0000-4000-8000-000000000001', 'spent-referrer@example.test'),
  ('80000000-0000-4000-8000-000000000002', 'spent-buyer@example.test'),
  ('90000000-0000-4000-8000-000000000001', 'reversal-referrer@example.test'),
  ('90000000-0000-4000-8000-000000000002', 'reversal-buyer@example.test');

INSERT INTO public.paid_reports (id, stripe_session_id, customer_email, amount_usd) VALUES
  ('30000000-0000-4000-8000-000000000001', 'cs_refund_atomic_1', 'buyer-1@example.test', 10),
  ('30000000-0000-4000-8000-000000000002', 'cs_refund_atomic_2', 'buyer-2@example.test', 20),
  ('30000000-0000-4000-8000-000000000003', 'cs_durable_intent', NULL, 12),
  ('80000000-0000-4000-8000-000000000003', 'cs_spent_points', 'spent-buyer@example.test', 18),
  ('90000000-0000-4000-8000-000000000003', 'cs_reversal_full', 'reversal-buyer@example.test', 10);

INSERT INTO public.paid_reports (
  id, stripe_session_id, customer_email, amount_usd, refunded_at,
  refunded_amount_usd, refund_reason, stripe_refund_id, status
) VALUES (
  '70000000-0000-4000-8000-000000000003',
  'cs_legacy_refund',
  'legacy-buyer@example.test',
  30,
  now(),
  30,
  'requested_by_customer',
  're_legacy_full',
  'completed'
);

INSERT INTO public.revenue_log (
  report_id, plan_code, amount_usd, stripe_session_id, customer_email
) VALUES
  ('30000000-0000-4000-8000-000000000001', 'C', 10, 'cs_refund_atomic_1', 'buyer-1@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'G15', 20, 'cs_refund_atomic_2', 'buyer-2@example.test'),
  ('30000000-0000-4000-8000-000000000003', 'C', 12, 'cs_durable_intent', NULL),
  ('80000000-0000-4000-8000-000000000003', 'C', 18, 'cs_spent_points', 'spent-buyer@example.test'),
  ('90000000-0000-4000-8000-000000000003', 'C', 10, 'cs_reversal_full', 'reversal-buyer@example.test'),
  ('70000000-0000-4000-8000-000000000003', 'C', 30, 'cs_legacy_refund', 'legacy-buyer@example.test');

UPDATE public.revenue_log
SET refunded_amount_usd = 30, refunded_at = now()
WHERE stripe_session_id = 'cs_legacy_refund';

INSERT INTO public.expense_log (
  category, subcategory, report_id, amount_usd, description, source, created_by, metadata
) VALUES (
  'refund', 'stripe_refund', '70000000-0000-4000-8000-000000000003', 30,
  'legacy refund expense', 'refund_api', 'admin', '{}'::jsonb
);

INSERT INTO public.referrals (
  id, referrer_user_id, referred_user_id, referred_email, status, referrer_points_awarded
) VALUES
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'buyer-1@example.test',
    'purchased',
    10
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'buyer-2@example.test',
    'purchased',
    15
  ),
  (
    '70000000-0000-4000-8000-000000000004',
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002',
    'legacy-buyer@example.test',
    'refunded',
    20
  ),
  (
    '80000000-0000-4000-8000-000000000004',
    '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000002',
    'spent-buyer@example.test',
    'purchased',
    12
  ),
  (
    '90000000-0000-4000-8000-000000000004',
    '90000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000002',
    'reversal-buyer@example.test',
    'purchased',
    10
  );

INSERT INTO public.user_points (id, user_id, balance, total_earned) VALUES
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 100, 100),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 80, 80),
  ('70000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000001', 40, 40),
  ('80000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000001', 0, 12),
  ('90000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000001', 100, 100);

INSERT INTO public.point_transactions (
  id, user_id, type, amount, balance_after, description, reference_id
) VALUES
  (
    '60000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'earn_referral', 10, 100, 'fixture award 1', 'cs_refund_atomic_1'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'earn_referral', 15, 80, 'fixture award 2', 'cs_refund_atomic_2'
  ),
  (
    '70000000-0000-4000-8000-000000000006',
    '70000000-0000-4000-8000-000000000001',
    'earn_referral', 20, 60, 'legacy source award', 'cs_legacy_refund'
  ),
  (
    '70000000-0000-4000-8000-000000000007',
    '70000000-0000-4000-8000-000000000001',
    'refund_clawback', -20, 40, 'legacy refund clawback', 'refund_re_legacy_full'
  ),
  (
    '80000000-0000-4000-8000-000000000006',
    '80000000-0000-4000-8000-000000000001',
    'earn_referral', 12, 12, 'spent fixture award', 'cs_spent_points'
  ),
  (
    '90000000-0000-4000-8000-000000000006',
    '90000000-0000-4000-8000-000000000001',
    'earn_referral', 10, 100, 'reversal fixture award', 'cs_reversal_full'
  );

DO $durable_admin_refund_intent$
DECLARE
  v_result record;
  v_failed boolean := false;
BEGIN
  SELECT * INTO STRICT v_result
  FROM public.reserve_admin_refund_intent(
    '30000000-0000-4000-8000-000000000003',
    'durable-request-1', repeat('a', 64), 400, 'requested_by_customer',
    'cs_durable_intent', 'pi_durable_intent'
  );
  IF v_result.outcome <> 'created' OR v_result.state <> 'reserved' THEN
    RAISE EXCEPTION 'durable refund intent was not created before provider mutation';
  END IF;

  UPDATE public.admin_refund_intent
  SET created_at = now() - interval '25 hours'
  WHERE report_id = '30000000-0000-4000-8000-000000000003'
    AND request_id = 'durable-request-1';

  SELECT * INTO STRICT v_result
  FROM public.reserve_admin_refund_intent(
    '30000000-0000-4000-8000-000000000003',
    'durable-request-1', repeat('a', 64), 400, 'requested_by_customer',
    'cs_durable_intent', 'pi_durable_intent'
  );
  IF v_result.outcome <> 'existing' OR v_result.state <> 'reserved' THEN
    RAISE EXCEPTION 'durable refund intent expired or was not replayable after 24 hours';
  END IF;

  BEGIN
    PERFORM *
    FROM public.reserve_admin_refund_intent(
      '30000000-0000-4000-8000-000000000003',
      'durable-request-1', repeat('b', 64), 400, 'requested_by_customer',
      'cs_durable_intent', 'pi_durable_intent'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'durable refund request accepted a conflicting payload hash';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.start_admin_refund_provider_attempt(
    '30000000-0000-4000-8000-000000000003',
    'durable-request-1', repeat('a', 64)
  );
  IF v_result.outcome <> 'started' OR v_result.state <> 'provider_pending' THEN
    RAISE EXCEPTION 'durable refund provider attempt did not start by CAS';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.start_admin_refund_provider_attempt(
    '30000000-0000-4000-8000-000000000003',
    'durable-request-1', repeat('a', 64)
  );
  IF v_result.outcome <> 'existing' OR v_result.state <> 'provider_pending' THEN
    RAISE EXCEPTION 'durable refund provider-attempt replay was not idempotent';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.bind_admin_refund_intent_provider_result(
    '30000000-0000-4000-8000-000000000003',
    'durable-request-1', repeat('a', 64), 're_durable_1', 'ch_durable_1', 400
  );
  IF v_result.state <> 'provider_applied' OR v_result.stripe_refund_id <> 're_durable_1' THEN
    RAISE EXCEPTION 'durable refund provider identity was not bound';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'admin_refund:30000000-0000-4000-8000-000000000003:durable-request-1',
    'refund.created', 'cs_durable_intent', 'ch_durable_1', 'pi_durable_intent',
    're_durable_1', 400, 'requested_by_customer'
  );
  IF v_result.outcome <> 'applied' OR v_result.refunded_amount_cents <> 400 THEN
    RAISE EXCEPTION 'durable refund intent accounting did not apply';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.complete_admin_refund_intent(
    '30000000-0000-4000-8000-000000000003',
    'durable-request-1', repeat('a', 64), 're_durable_1', 400
  );
  IF v_result.state <> 'reconciled' THEN
    RAISE EXCEPTION 'durable refund intent did not reach reconciled';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.complete_admin_refund_intent(
    '30000000-0000-4000-8000-000000000003',
    'durable-request-1', repeat('a', 64), 're_durable_1', 400
  );
  IF v_result.state <> 'reconciled' THEN
    RAISE EXCEPTION 'durable refund completion replay was not idempotent';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.reserve_admin_refund_intent(
    '30000000-0000-4000-8000-000000000003',
    'durable-request-2', repeat('c', 64), 300, 'duplicate',
    'cs_durable_intent', 'pi_durable_intent'
  );
  IF v_result.outcome <> 'created' THEN
    RAISE EXCEPTION 'later intentional partial refund could not create a new intent';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM *
    FROM public.reserve_admin_refund_intent(
      '30000000-0000-4000-8000-000000000003',
      'durable-request-3', repeat('d', 64), 300, 'duplicate',
      'cs_durable_intent', 'pi_durable_intent'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'parallel active refund intent was not blocked';
  END IF;
END
$durable_admin_refund_intent$;

DO $spent_referral_balance_hold$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM *
    FROM public.reserve_admin_refund_intent(
      '80000000-0000-4000-8000-000000000003',
      'spent-request-1', repeat('e', 64), 1800, 'requested_by_customer',
      'cs_spent_points', 'pi_spent_points'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_failed := true;
  END;
  IF NOT v_failed
    OR EXISTS (
      SELECT 1 FROM public.admin_refund_intent
      WHERE report_id = '80000000-0000-4000-8000-000000000003'
    )
  THEN
    RAISE EXCEPTION 'spent referral balance was not held before Stripe mutation';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM *
    FROM public.reconcile_stripe_refund_event(
      'evt_spent_balance_full', 'charge.refunded', 'cs_spent_points',
      'ch_spent_points', 'pi_spent_points', NULL, 1800, 'charge.refunded'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_failed := true;
  END;
  IF NOT v_failed
    OR COALESCE((
      SELECT refunded_amount_usd FROM public.paid_reports
      WHERE id = '80000000-0000-4000-8000-000000000003'
    ), 0) <> 0
    OR (SELECT balance FROM public.user_points WHERE id = '80000000-0000-4000-8000-000000000005') <> 0
    OR (SELECT status FROM public.referrals WHERE id = '80000000-0000-4000-8000-000000000004') <> 'purchased'
    OR EXISTS (SELECT 1 FROM public.stripe_refund_event_ledger WHERE event_id = 'evt_spent_balance_full')
    OR EXISTS (
      SELECT 1 FROM public.referral_refund_point_ledger
      WHERE report_id = '80000000-0000-4000-8000-000000000003'
    )
  THEN
    RAISE EXCEPTION 'spent referral balance was silently finalized instead of rolling back';
  END IF;
END
$spent_referral_balance_hold$;

DO $full_refund_hold_and_terminal_reversal$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO STRICT v_result
  FROM public.reserve_admin_refund_intent(
    '90000000-0000-4000-8000-000000000003',
    'reversal-request-1', repeat('9', 64), 1000, 'requested_by_customer',
    'cs_reversal_full', 'pi_reversal_full'
  );
  IF v_result.outcome <> 'created'
    OR (SELECT balance FROM public.user_points WHERE user_id = '90000000-0000-4000-8000-000000000001') <> 90
    OR (SELECT state FROM public.admin_refund_point_hold
        WHERE report_id = '90000000-0000-4000-8000-000000000003'
          AND request_id = 'reversal-request-1') <> 'held'
  THEN
    RAISE EXCEPTION 'full refund did not escrow referral points before provider mutation';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.start_admin_refund_provider_attempt(
    '90000000-0000-4000-8000-000000000003',
    'reversal-request-1', repeat('9', 64)
  );
  IF v_result.state <> 'provider_pending' OR v_result.provider_attempted_at IS NULL THEN
    RAISE EXCEPTION 'full refund did not persist the provider attempt timestamp';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.bind_admin_refund_intent_provider_result(
    '90000000-0000-4000-8000-000000000003',
    'reversal-request-1', repeat('9', 64), 're_reversal_full', 'ch_reversal_full', 1000
  );

  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'admin_refund:90000000-0000-4000-8000-000000000003:reversal-request-1',
    'refund.created', 'cs_reversal_full', 'ch_reversal_full', 'pi_reversal_full',
    're_reversal_full', 1000, 'requested_by_customer'
  );
  IF v_result.outcome <> 'applied'
    OR NOT v_result.is_full_refund
    OR v_result.points_clawed_back <> 10
    OR (SELECT balance FROM public.user_points WHERE user_id = '90000000-0000-4000-8000-000000000001') <> 90
    OR (SELECT total_earned FROM public.user_points WHERE user_id = '90000000-0000-4000-8000-000000000001') <> 90
    OR (SELECT state FROM public.admin_refund_point_hold
        WHERE report_id = '90000000-0000-4000-8000-000000000003'
          AND request_id = 'reversal-request-1') <> 'clawed_back'
  THEN
    RAISE EXCEPTION 'full refund did not convert referral escrow to clawback exactly once';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.complete_admin_refund_intent(
    '90000000-0000-4000-8000-000000000003',
    'reversal-request-1', repeat('9', 64), 're_reversal_full', 1000
  );

  SELECT * INTO STRICT v_result
  FROM public.reverse_stripe_refund_event(
    'evt_reversal_failed_1', 'refund.failed', 'cs_reversal_full',
    'ch_reversal_full', 'pi_reversal_full', 're_reversal_full', 'failed',
    1000, 0, 'declined', 'reversal-request-1', repeat('9', 64)
  );
  IF v_result.outcome <> 'reversed'
    OR v_result.refunded_amount_cents <> 0
    OR v_result.is_full_refund
    OR v_result.points_restored <> 10
    OR v_result.intent_state <> 'provider_failed'
    OR COALESCE((SELECT refunded_amount_usd FROM public.paid_reports
                 WHERE id = '90000000-0000-4000-8000-000000000003'), -1) <> 0
    OR (SELECT status FROM public.paid_reports
        WHERE id = '90000000-0000-4000-8000-000000000003') <> 'completed'
    OR COALESCE((SELECT refunded_amount_usd FROM public.revenue_log
                 WHERE stripe_session_id = 'cs_reversal_full'), -1) <> 0
    OR COALESCE((SELECT amount_usd FROM public.expense_log
                 WHERE report_id = '90000000-0000-4000-8000-000000000003'
                   AND category = 'refund'), -1) <> 0
    OR (SELECT balance FROM public.user_points
        WHERE user_id = '90000000-0000-4000-8000-000000000001') <> 100
    OR (SELECT total_earned FROM public.user_points
        WHERE user_id = '90000000-0000-4000-8000-000000000001') <> 100
    OR (SELECT status FROM public.referrals
        WHERE id = '90000000-0000-4000-8000-000000000004') <> 'purchased'
    OR (SELECT state FROM public.admin_refund_intent
        WHERE report_id = '90000000-0000-4000-8000-000000000003'
          AND request_id = 'reversal-request-1') <> 'provider_failed'
    OR (SELECT state FROM public.admin_refund_point_hold
        WHERE report_id = '90000000-0000-4000-8000-000000000003'
          AND request_id = 'reversal-request-1') <> 'restored'
  THEN
    RAISE EXCEPTION 'terminal refund reversal did not restore canonical accounting and points';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.reverse_stripe_refund_event(
    'evt_reversal_failed_1', 'refund.failed', 'cs_reversal_full',
    'ch_reversal_full', 'pi_reversal_full', 're_reversal_full', 'failed',
    1000, 0, 'declined', 'reversal-request-1', repeat('9', 64)
  );
  IF v_result.outcome <> 'already'
    OR v_result.points_restored <> 10
    OR (SELECT count(*) FROM public.point_transactions
        WHERE user_id = '90000000-0000-4000-8000-000000000001'
          AND type = 'refund_clawback_reversal') <> 1
    OR (SELECT count(*) FROM public.stripe_refund_reversal_ledger
        WHERE event_id = 'evt_reversal_failed_1') <> 1
  THEN
    RAISE EXCEPTION 'terminal refund reversal replay was not exactly once';
  END IF;
END
$full_refund_hold_and_terminal_reversal$;

DO $explicit_new_request_after_terminal_failure$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO STRICT v_result
  FROM public.reserve_admin_refund_intent(
    '90000000-0000-4000-8000-000000000003',
    'reversal-request-2', repeat('8', 64), 1000, 'requested_by_customer',
    'cs_reversal_full', 'pi_reversal_full'
  );
  IF v_result.outcome <> 'created'
    OR (SELECT balance FROM public.user_points
        WHERE user_id = '90000000-0000-4000-8000-000000000001') <> 90
    OR (SELECT state FROM public.admin_refund_point_hold
        WHERE report_id = '90000000-0000-4000-8000-000000000003'
          AND request_id = 'reversal-request-2') <> 'held'
  THEN
    RAISE EXCEPTION 'explicit new request did not reserve restored referral points';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.start_admin_refund_provider_attempt(
    '90000000-0000-4000-8000-000000000003',
    'reversal-request-2', repeat('8', 64)
  );
  SELECT * INTO STRICT v_result
  FROM public.bind_admin_refund_intent_provider_result(
    '90000000-0000-4000-8000-000000000003',
    'reversal-request-2', repeat('8', 64), 're_reversal_full_2', 'ch_reversal_full', 1000
  );
  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'admin_refund:90000000-0000-4000-8000-000000000003:reversal-request-2',
    'refund.created', 'cs_reversal_full', 'ch_reversal_full', 'pi_reversal_full',
    're_reversal_full_2', 1000, 'requested_by_customer'
  );
  IF v_result.outcome <> 'applied'
    OR NOT v_result.is_full_refund
    OR v_result.points_clawed_back <> 10
    OR (SELECT balance FROM public.user_points
        WHERE user_id = '90000000-0000-4000-8000-000000000001') <> 90
    OR (SELECT total_earned FROM public.user_points
        WHERE user_id = '90000000-0000-4000-8000-000000000001') <> 90
    OR (SELECT status FROM public.referrals
        WHERE id = '90000000-0000-4000-8000-000000000004') <> 'refunded'
    OR (SELECT state FROM public.admin_refund_point_hold
        WHERE report_id = '90000000-0000-4000-8000-000000000003'
          AND request_id = 'reversal-request-2') <> 'clawed_back'
    OR (SELECT points_restored FROM public.referral_refund_point_ledger
        WHERE report_id = '90000000-0000-4000-8000-000000000003') <> 0
    OR (SELECT count(*) FROM public.point_transactions
        WHERE user_id = '90000000-0000-4000-8000-000000000001'
          AND type = 'refund_clawback') <> 2
  THEN
    RAISE EXCEPTION 'explicit new request did not reapply the full refund exactly once';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.complete_admin_refund_intent(
    '90000000-0000-4000-8000-000000000003',
    'reversal-request-2', repeat('8', 64), 're_reversal_full_2', 1000
  );
  IF v_result.state <> 'reconciled' THEN
    RAISE EXCEPTION 'explicit new request did not reach reconciled terminal state';
  END IF;
END
$explicit_new_request_after_terminal_failure$;

DO $partial_refunds$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'evt_partial_1', 'refund.created', 'cs_refund_atomic_1', 'ch_1', 'pi_1',
    're_partial_1', 250, 'requested_by_customer'
  );
  IF v_result.outcome <> 'applied'
    OR v_result.refunded_amount_cents <> 250
    OR v_result.is_full_refund
    OR v_result.points_clawed_back <> 0
  THEN
    RAISE EXCEPTION 'first partial refund result mismatch';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'evt_partial_2', 'refund.updated', 'cs_refund_atomic_1', 'ch_1', 'pi_1',
    're_partial_2', 600, 'requested_by_customer'
  );
  IF v_result.outcome <> 'applied'
    OR v_result.refunded_amount_cents <> 600
    OR v_result.is_full_refund
    OR v_result.points_clawed_back <> 0
  THEN
    RAISE EXCEPTION 'second partial refund result mismatch';
  END IF;

  IF (SELECT balance FROM public.user_points WHERE id = '50000000-0000-4000-8000-000000000001') <> 100
    OR (SELECT status FROM public.referrals WHERE id = '40000000-0000-4000-8000-000000000001') <> 'purchased'
    OR EXISTS (
      SELECT 1 FROM public.referral_refund_point_ledger
      WHERE report_id = '30000000-0000-4000-8000-000000000001'
    )
  THEN
    RAISE EXCEPTION 'partial refund changed referral point state';
  END IF;
END
$partial_refunds$;

DO $out_of_order_and_duplicate$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'evt_out_of_order', 'refund.updated', 'cs_refund_atomic_1', 'ch_1', 'pi_1',
    're_partial_1', 250, 'requested_by_customer'
  );
  IF v_result.outcome <> 'stale' OR v_result.refunded_amount_cents <> 600 THEN
    RAISE EXCEPTION 'out-of-order refund lowered cumulative state';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'evt_partial_2', 'refund.updated', 'cs_refund_atomic_1', 'ch_1', 'pi_1',
    're_partial_2', 600, 'requested_by_customer'
  );
  IF v_result.outcome <> 'already'
    OR v_result.refunded_amount_cents <> 600
    OR v_result.points_clawed_back <> 0
  THEN
    RAISE EXCEPTION 'same-event retry was not idempotent';
  END IF;

  IF round((SELECT refunded_amount_usd FROM public.paid_reports WHERE id = '30000000-0000-4000-8000-000000000001') * 100)::integer <> 600
    OR round((SELECT refunded_amount_usd FROM public.revenue_log WHERE stripe_session_id = 'cs_refund_atomic_1') * 100)::integer <> 600
    OR round((SELECT amount_usd FROM public.expense_log WHERE report_id = '30000000-0000-4000-8000-000000000001' AND category = 'refund') * 100)::integer <> 600
    OR (SELECT count(*) FROM public.expense_log WHERE report_id = '30000000-0000-4000-8000-000000000001' AND category = 'refund') <> 1
  THEN
    RAISE EXCEPTION 'partial accounting cumulative state mismatch';
  END IF;
END
$out_of_order_and_duplicate$;

DO $external_full_refund$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'evt_external_full_1', 'charge.refunded', 'cs_refund_atomic_1', 'ch_1', 'pi_1',
    NULL, 1000, 'charge.refunded'
  );
  IF v_result.outcome <> 'applied'
    OR v_result.refunded_amount_cents <> 1000
    OR NOT v_result.is_full_refund
    OR v_result.points_clawed_back <> 10
  THEN
    RAISE EXCEPTION 'external full refund parity failed';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'evt_external_full_1', 'charge.refunded', 'cs_refund_atomic_1', 'ch_1', 'pi_1',
    NULL, 1000, 'charge.refunded'
  );
  IF v_result.outcome <> 'already' OR v_result.points_clawed_back <> 10 THEN
    RAISE EXCEPTION 'full-refund event retry lost its stored result';
  END IF;

  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'admin_refund:30000000-0000-4000-8000-000000000001:full-request-1',
    'refund.created', 'cs_refund_atomic_1', 'ch_1', 'pi_1',
    're_full_1', 1000, 'requested_by_customer'
  );
  IF v_result.outcome <> 'stale' OR v_result.points_clawed_back <> 0 THEN
    RAISE EXCEPTION 'admin/webhook path parity double-clawed referral points';
  END IF;

  -- Stripe retrieves the current Charge on every delivery. A redelivery of
  -- an older event after a later refund therefore carries a higher cumulative
  -- amount and must still resolve to the original event exactly once.
  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'evt_partial_1', 'refund.created', 'cs_refund_atomic_1', 'ch_1', 'pi_1',
    're_partial_1', 1000, 'requested_by_customer'
  );
  IF v_result.outcome <> 'already'
    OR v_result.refunded_amount_cents <> 250
    OR v_result.is_full_refund
    OR v_result.points_clawed_back <> 0
  THEN
    RAISE EXCEPTION 'older refund event redelivery did not preserve its stored result';
  END IF;

  IF (SELECT status FROM public.paid_reports WHERE id = '30000000-0000-4000-8000-000000000001') <> 'refunded'
    OR (SELECT balance FROM public.user_points WHERE id = '50000000-0000-4000-8000-000000000001') <> 90
    OR (SELECT total_earned FROM public.user_points WHERE id = '50000000-0000-4000-8000-000000000001') <> 90
    OR (SELECT status FROM public.referrals WHERE id = '40000000-0000-4000-8000-000000000001') <> 'refunded'
    OR (SELECT count(*) FROM public.point_transactions WHERE type = 'refund_clawback' AND user_id = '10000000-0000-4000-8000-000000000001') <> 1
    OR (SELECT count(*) FROM public.referral_refund_point_ledger WHERE report_id = '30000000-0000-4000-8000-000000000001') <> 1
    OR round((SELECT refunded_amount_usd FROM public.revenue_log WHERE stripe_session_id = 'cs_refund_atomic_1') * 100)::integer <> 1000
    OR round((SELECT amount_usd FROM public.expense_log WHERE report_id = '30000000-0000-4000-8000-000000000001' AND category = 'refund') * 100)::integer <> 1000
  THEN
    RAISE EXCEPTION 'full refund exactly-once postcondition failed';
  END IF;
END
$external_full_refund$;

DO $legacy_clawback_adoption$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'evt_legacy_replay', 'charge.refunded', 'cs_legacy_refund', 'ch_legacy', 'pi_legacy',
    NULL, 3000, 'charge.refunded'
  );

  IF v_result.outcome <> 'stale'
    OR NOT v_result.is_full_refund
    OR v_result.points_clawed_back <> 20
    OR (SELECT balance FROM public.user_points WHERE id = '70000000-0000-4000-8000-000000000005') <> 40
    OR (SELECT total_earned FROM public.user_points WHERE id = '70000000-0000-4000-8000-000000000005') <> 40
    OR (SELECT status FROM public.paid_reports WHERE id = '70000000-0000-4000-8000-000000000003') <> 'refunded'
    OR (SELECT count(*) FROM public.point_transactions WHERE type = 'refund_clawback' AND user_id = '70000000-0000-4000-8000-000000000001') <> 1
    OR (SELECT clawback_point_transaction_id FROM public.referral_refund_point_ledger WHERE report_id = '70000000-0000-4000-8000-000000000003') <> '70000000-0000-4000-8000-000000000007'
  THEN
    RAISE EXCEPTION 'legacy refund clawback was not adopted exactly once';
  END IF;
END
$legacy_clawback_adoption$;

CREATE FUNCTION public.reject_final_refund_event_update()
RETURNS trigger
LANGUAGE plpgsql
AS $reject_final_refund_event_update$
BEGIN
  IF NEW.event_id = 'evt_rollback_full' AND NEW.outcome <> 'pending' THEN
    RAISE EXCEPTION 'synthetic final-ledger failure';
  END IF;
  RETURN NEW;
END
$reject_final_refund_event_update$;

CREATE TRIGGER reject_final_refund_event_update
BEFORE UPDATE ON public.stripe_refund_event_ledger
FOR EACH ROW EXECUTE FUNCTION public.reject_final_refund_event_update();

DO $rollback_every_table$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM *
    FROM public.reconcile_stripe_refund_event(
      'evt_rollback_full', 'charge.refunded', 'cs_refund_atomic_2', 'ch_2', 'pi_2',
      NULL, 2000, 'charge.refunded'
    );
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      v_failed := true;
  END;

  IF NOT v_failed
    OR COALESCE((SELECT refunded_amount_usd FROM public.paid_reports WHERE id = '30000000-0000-4000-8000-000000000002'), 0) <> 0
    OR COALESCE((SELECT refunded_amount_usd FROM public.revenue_log WHERE stripe_session_id = 'cs_refund_atomic_2'), 0) <> 0
    OR EXISTS (SELECT 1 FROM public.expense_log WHERE report_id = '30000000-0000-4000-8000-000000000002' AND category = 'refund')
    OR (SELECT balance FROM public.user_points WHERE id = '50000000-0000-4000-8000-000000000002') <> 80
    OR (SELECT status FROM public.referrals WHERE id = '40000000-0000-4000-8000-000000000002') <> 'purchased'
    OR EXISTS (SELECT 1 FROM public.referral_refund_point_ledger WHERE report_id = '30000000-0000-4000-8000-000000000002')
    OR EXISTS (SELECT 1 FROM public.stripe_refund_accounting_state WHERE report_id = '30000000-0000-4000-8000-000000000002')
    OR EXISTS (SELECT 1 FROM public.stripe_refund_event_ledger WHERE event_id = 'evt_rollback_full')
  THEN
    RAISE EXCEPTION 'failed reconciliation did not roll back every table';
  END IF;
END
$rollback_every_table$;

DROP TRIGGER reject_final_refund_event_update ON public.stripe_refund_event_ledger;
DROP FUNCTION public.reject_final_refund_event_update();

DO $retry_after_rollback$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO STRICT v_result
  FROM public.reconcile_stripe_refund_event(
    'evt_rollback_full', 'charge.refunded', 'cs_refund_atomic_2', 'ch_2', 'pi_2',
    NULL, 2000, 'charge.refunded'
  );
  IF v_result.outcome <> 'applied'
    OR NOT v_result.is_full_refund
    OR v_result.points_clawed_back <> 15
  THEN
    RAISE EXCEPTION 'retry after rollback did not apply exactly once';
  END IF;
END
$retry_after_rollback$;

CREATE OR REPLACE FUNCTION public.reject_refund_reversal_ledger_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $reject_refund_reversal_ledger_insert$
BEGIN
  IF NEW.event_id = 'evt_reversal_rollback' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'synthetic reversal ledger failure';
  END IF;
  RETURN NEW;
END
$reject_refund_reversal_ledger_insert$;

CREATE TRIGGER reject_refund_reversal_ledger_insert
BEFORE INSERT ON public.stripe_refund_reversal_ledger
FOR EACH ROW EXECUTE FUNCTION public.reject_refund_reversal_ledger_insert();

DO $rollback_terminal_reversal$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM *
    FROM public.reverse_stripe_refund_event(
      'evt_reversal_rollback', 'refund.failed', 'cs_refund_atomic_2',
      'ch_2', 'pi_2', 're_rollback_failed', 'failed',
      2000, 0, 'synthetic_decline', NULL, NULL
    );
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      v_failed := true;
  END;

  IF NOT v_failed
    OR COALESCE((SELECT refunded_amount_usd FROM public.paid_reports
                 WHERE id = '30000000-0000-4000-8000-000000000002'), 0) <> 20
    OR (SELECT status FROM public.paid_reports
        WHERE id = '30000000-0000-4000-8000-000000000002') <> 'refunded'
    OR COALESCE((SELECT refunded_amount_usd FROM public.revenue_log
                 WHERE stripe_session_id = 'cs_refund_atomic_2'), 0) <> 20
    OR COALESCE((SELECT amount_usd FROM public.expense_log
                 WHERE report_id = '30000000-0000-4000-8000-000000000002'
                   AND category = 'refund'), 0) <> 20
    OR (SELECT balance FROM public.user_points
        WHERE id = '50000000-0000-4000-8000-000000000002') <> 65
    OR (SELECT total_earned FROM public.user_points
        WHERE id = '50000000-0000-4000-8000-000000000002') <> 65
    OR (SELECT status FROM public.referrals
        WHERE id = '40000000-0000-4000-8000-000000000002') <> 'refunded'
    OR (SELECT points_restored FROM public.referral_refund_point_ledger
        WHERE report_id = '30000000-0000-4000-8000-000000000002') <> 0
    OR EXISTS (SELECT 1 FROM public.stripe_refund_reversal_ledger
               WHERE event_id = 'evt_reversal_rollback')
  THEN
    RAISE EXCEPTION 'failed terminal reversal did not roll back every table';
  END IF;
END
$rollback_terminal_reversal$;

DROP TRIGGER reject_refund_reversal_ledger_insert ON public.stripe_refund_reversal_ledger;
DROP FUNCTION public.reject_refund_reversal_ledger_insert();

DO $retry_terminal_reversal_after_rollback$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO STRICT v_result
  FROM public.reverse_stripe_refund_event(
    'evt_reversal_rollback', 'refund.failed', 'cs_refund_atomic_2',
    'ch_2', 'pi_2', 're_rollback_failed', 'failed',
    2000, 0, 'synthetic_decline', NULL, NULL
  );
  IF v_result.outcome <> 'reversed'
    OR v_result.refunded_amount_cents <> 0
    OR v_result.points_restored <> 15
    OR COALESCE((SELECT refunded_amount_usd FROM public.paid_reports
                 WHERE id = '30000000-0000-4000-8000-000000000002'), -1) <> 0
    OR (SELECT status FROM public.paid_reports
        WHERE id = '30000000-0000-4000-8000-000000000002') <> 'completed'
    OR (SELECT balance FROM public.user_points
        WHERE id = '50000000-0000-4000-8000-000000000002') <> 80
    OR (SELECT total_earned FROM public.user_points
        WHERE id = '50000000-0000-4000-8000-000000000002') <> 80
    OR (SELECT status FROM public.referrals
        WHERE id = '40000000-0000-4000-8000-000000000002') <> 'purchased'
    OR (SELECT count(*) FROM public.stripe_refund_reversal_ledger
        WHERE event_id = 'evt_reversal_rollback') <> 1
  THEN
    RAISE EXCEPTION 'terminal reversal retry after rollback did not apply exactly once';
  END IF;
END
$retry_terminal_reversal_after_rollback$;

SET ROLE service_role;
SELECT 1 / CASE WHEN outcome = 'already' THEN 1 ELSE 0 END AS service_role_rpc_ok
FROM public.reconcile_stripe_refund_event(
  'evt_partial_2', 'refund.updated', 'cs_refund_atomic_1', 'ch_1', 'pi_1',
  're_partial_2', 600, 'requested_by_customer'
);
SELECT 1 / CASE WHEN outcome = 'already' THEN 1 ELSE 0 END AS service_role_reversal_rpc_ok
FROM public.reverse_stripe_refund_event(
  'evt_reversal_failed_1', 'refund.failed', 'cs_reversal_full',
  'ch_reversal_full', 'pi_reversal_full', 're_reversal_full', 'failed',
  1000, 0, 'declined', 'reversal-request-1', repeat('9', 64)
);
RESET ROLE;

BEGIN;
SET LOCAL ROLE service_role;
SELECT 1 / CASE WHEN outcome = 'existing' THEN 1 ELSE 0 END AS service_role_reserve_ok
FROM public.reserve_admin_refund_intent(
  '30000000-0000-4000-8000-000000000003',
  'durable-request-2', repeat('c', 64), 300, 'duplicate',
  'cs_durable_intent', 'pi_durable_intent'
);
SELECT 1 / CASE WHEN outcome = 'started' THEN 1 ELSE 0 END AS service_role_start_ok
FROM public.start_admin_refund_provider_attempt(
  '30000000-0000-4000-8000-000000000003',
  'durable-request-2', repeat('c', 64)
);
SELECT 1 / CASE WHEN state = 'provider_applied' THEN 1 ELSE 0 END AS service_role_bind_ok
FROM public.bind_admin_refund_intent_provider_result(
  '30000000-0000-4000-8000-000000000003',
  'durable-request-2', repeat('c', 64), 're_durable_2', 'ch_durable_2', 300
);
SELECT 1 / CASE WHEN outcome = 'applied' THEN 1 ELSE 0 END AS service_role_reconcile_ok
FROM public.reconcile_stripe_refund_event(
  'admin_refund:30000000-0000-4000-8000-000000000003:durable-request-2',
  'refund.created', 'cs_durable_intent', 'ch_durable_2', 'pi_durable_intent',
  're_durable_2', 700, 'duplicate'
);
SELECT 1 / CASE WHEN state = 'reconciled' THEN 1 ELSE 0 END AS service_role_complete_ok
FROM public.complete_admin_refund_intent(
  '30000000-0000-4000-8000-000000000003',
  'durable-request-2', repeat('c', 64), 're_durable_2', 700
);
ROLLBACK;

DO $verify_privileges$
BEGIN
  IF has_function_privilege(
      'anon',
      'public.reconcile_stripe_refund_event(text,text,text,text,text,text,bigint,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.reconcile_stripe_refund_event(text,text,text,text,text,text,bigint,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.reconcile_stripe_refund_event(text,text,text,text,text,text,bigint,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.reserve_admin_refund_intent(uuid,text,text,bigint,text,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.bind_admin_refund_intent_provider_result(uuid,text,text,text,text,bigint)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.start_admin_refund_provider_attempt(uuid,text,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.complete_admin_refund_intent(uuid,text,text,text,bigint)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.reverse_stripe_refund_event(text,text,text,text,text,text,text,bigint,bigint,text,text,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.reverse_stripe_refund_event(text,text,text,text,text,text,text,bigint,bigint,text,text,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.reverse_stripe_refund_event(text,text,text,text,text,text,text,bigint,bigint,text,text,text)',
      'EXECUTE'
    )
    OR has_table_privilege('service_role', 'public.stripe_refund_event_ledger', 'SELECT')
    OR has_table_privilege('service_role', 'public.stripe_refund_accounting_state', 'SELECT')
    OR has_table_privilege('service_role', 'public.referral_refund_point_ledger', 'SELECT')
    OR has_table_privilege('service_role', 'public.admin_refund_intent', 'SELECT')
    OR has_table_privilege('service_role', 'public.admin_refund_point_hold', 'SELECT')
    OR has_table_privilege('service_role', 'public.stripe_refund_reversal_ledger', 'SELECT')
  THEN
    RAISE EXCEPTION 'unified refund privileges are not fail closed';
  END IF;
END
$verify_privileges$;

SELECT 'UNIFIED_REFUND_SQL_RUNTIME_OK' AS result;
