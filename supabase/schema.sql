-- ============================================================================
--  LODStudios — Supabase schema
-- ============================================================================
--  HOW TO USE
--    1. Supabase Dashboard → your project → SQL Editor → "New query"
--    2. Paste this whole file and press "Run".
--    It is safe to run more than once (everything is "if not exists").
--
--  SECURITY MODEL
--    Row Level Security is ENABLED on every table and there are NO policies.
--    That means the public "anon" key can read and write NOTHING. Only the
--    server, using the SERVICE ROLE key from .env (SUPABASE_SERVICE_ROLE_KEY),
--    can access the data. The service role key must never be exposed to the
--    browser — it has no VITE_ prefix on purpose.
-- ============================================================================

-- ── partners / clients (homepage logo marquee) ──────────────────────────────
create table if not exists public.partners (
  id          text primary key,
  name        text        not null,
  image       text        not null,            -- permanent logo URL
  link        text        not null,            -- opened on click
  created_at  timestamptz not null default now()
);

-- ── newsletter subscribers ──────────────────────────────────────────────────
create table if not exists public.subscribers (
  cfx_id      text primary key,                -- verified CFX / FiveM id
  username    text        not null,
  email       text        not null,
  hidden      boolean     not null default false,  -- excluded from broadcasts
  created_at  timestamptz not null default now()
);

-- ── e-mail templates (admin broadcasts) ─────────────────────────────────────
create table if not exists public.email_templates (
  id          text primary key,
  name        text        not null,
  subject     text        not null,
  body        text        not null,
  updated_at  timestamptz not null default now()
);

-- ── admin / audit log ───────────────────────────────────────────────────────
create table if not exists public.logs (
  id              text primary key,
  at              timestamptz not null default now(),
  type            text        not null,
  actor           text,
  cfx_name        text,
  tebex_id        text,
  package_name    text,
  amount          numeric,
  currency        text,
  payment_method  text,
  detail          text
);
create index if not exists logs_at_idx on public.logs (at desc);

-- ── admin roster: who may enter the admin panel ─────────────────────────────
create table if not exists public.admin_roster (
  cfx_id      text primary key,                -- normalised: lower-case, no "fivem:" prefix
  role        text        not null,
  label       text        not null default '',
  protected   boolean     not null default false,  -- can never be edited/removed in the panel
  updated_at  timestamptz not null default now()
);

-- The default account (LODStudios) is a normal row in this table with
-- protected = true. The rule "can never be deleted or changed" is enforced by
-- the DATABASE ITSELF, not only by the app: this trigger rejects any DELETE of
-- a protected row and any UPDATE that would change who it is or what it may do.
-- (Only `updated_at` may change, so re-running the migration stays harmless.)
create or replace function public.protect_admin_roster()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.protected then
      raise exception 'protected admin account "%" cannot be deleted', old.cfx_id
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.protected and (
       new.cfx_id    is distinct from old.cfx_id
    or new.role      is distinct from old.role
    or new.label     is distinct from old.label
    or new.protected is distinct from old.protected
  ) then
    raise exception 'protected admin account "%" cannot be modified', old.cfx_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists admin_roster_protect on public.admin_roster;
create trigger admin_roster_protect
  before update or delete on public.admin_roster
  for each row execute function public.protect_admin_roster();

-- ── custom admin roles (built-in roles live in code) ────────────────────────
create table if not exists public.admin_roles (
  key          text primary key,
  label        text  not null,
  description  text  not null default '',
  permissions  jsonb not null default '[]'::jsonb   -- ["perm.a","perm.b"] or "*"
);

-- ── wishlists (one row per user, mirrored from the browser) ─────────────────
create table if not exists public.wishlists (
  cfx_id        text primary key,
  cfx_id_lower  text generated always as (lower(cfx_id)) stored,
  username      text        not null default '',
  items         jsonb       not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);
create unique index if not exists wishlists_cfx_lower_idx on public.wishlists (cfx_id_lower);

-- ── referral program state ──────────────────────────────────────────────────
--  The referral program is one aggregate (settings, rewards, users, referrals,
--  claims, activity) that is always evaluated as a whole, so it is stored as a
--  single JSON document. `version` gives optimistic locking: the server only
--  saves when the version it read is still current, so two simultaneous
--  requests can never overwrite each other.
create table if not exists public.referral_state (
  id          smallint primary key default 1 check (id = 1),
  data        jsonb       not null default '{}'::jsonb,
  version     bigint      not null default 0,
  updated_at  timestamptz not null default now()
);
insert into public.referral_state (id) values (1) on conflict (id) do nothing;

-- ── lock everything down ────────────────────────────────────────────────────
alter table public.partners         enable row level security;
alter table public.subscribers      enable row level security;
alter table public.email_templates  enable row level security;
alter table public.logs             enable row level security;
alter table public.admin_roster     enable row level security;
alter table public.admin_roles      enable row level security;
alter table public.wishlists        enable row level security;
alter table public.referral_state   enable row level security;

-- Belt and braces: even if a policy is added by mistake later, the public
-- API roles hold no table privileges at all.
revoke all on public.partners, public.subscribers, public.email_templates,
              public.logs, public.admin_roster, public.admin_roles,
              public.wishlists, public.referral_state
  from anon, authenticated;

-- ============================================================================
--  DEFAULT ACCOUNT (LODStudios) — founder, protected
--    Stored in the database only, never in the application code. Once this row
--    exists, the trigger above makes it impossible to delete or change it —
--    from the admin panel, from the app, or by a stray query.
--
--    Safe to run again:
--      • row missing            → it is created
--      • row exists, unprotected → promoted to protected founder
--      • row already protected   → left untouched (no trigger error)
-- ============================================================================
insert into public.admin_roster (cfx_id, role, label, protected)
values ('1157155', 'founder', 'LODStudios', true)
on conflict (cfx_id) do update
  set role       = excluded.role,
      label      = excluded.label,
      protected  = true,
      updated_at = now()
  where public.admin_roster.protected = false;

--  More protected accounts later:   npm run db:founder -- CFX_ID "Name"
--
--  Emergency only — if YOU, as the database owner, ever need to change one:
--      alter table public.admin_roster disable trigger admin_roster_protect;
--      -- … your change …
--      alter table public.admin_roster enable trigger admin_roster_protect;
