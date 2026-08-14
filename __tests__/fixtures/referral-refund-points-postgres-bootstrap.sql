\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE EXTENSION pgcrypto;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE TABLE public.paid_reports (
  id uuid PRIMARY KEY,
  stripe_session_id text NOT NULL UNIQUE,
  customer_email text,
  amount_usd numeric NOT NULL,
  refunded_at timestamptz,
  refunded_amount_usd numeric,
  refund_reason text,
  stripe_refund_id text,
  status text NOT NULL DEFAULT 'completed'
);

CREATE TABLE public.revenue_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.paid_reports(id),
  plan_code text NOT NULL,
  amount_usd numeric(10, 2) NOT NULL,
  stripe_session_id text UNIQUE,
  stripe_fee_usd numeric(10, 4) DEFAULT 0,
  customer_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expense_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  subcategory text,
  report_id uuid REFERENCES public.paid_reports(id),
  amount_usd numeric(10, 4) NOT NULL,
  description text,
  source text,
  created_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY,
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id),
  referred_user_id uuid NOT NULL REFERENCES auth.users(id),
  referred_email text,
  status text NOT NULL,
  referrer_points_awarded integer NOT NULL DEFAULT 0
);

CREATE TABLE public.user_points (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  balance integer NOT NULL CHECK (balance >= 0),
  total_earned integer NOT NULL,
  total_used integer NOT NULL DEFAULT 0,
  total_expired integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  description text,
  reference_id text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
