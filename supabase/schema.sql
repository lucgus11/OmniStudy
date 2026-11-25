-- ═══════════════════════════════════════════════════════════════════════════
--  OmniStudy — schéma Supabase (PostgreSQL)
--  À exécuter dans : Supabase → SQL Editor → New query → Run
--  Le script est idempotent : tu peux le relancer sans casser les données.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Fonction trigger : horodatage serveur + résolution de conflit (LWW) ─────
--  • updated_at  = horodatage SERVEUR → curseur fiable pour la synchro "pull"
--  • modified_at = horodatage CLIENT  → "last write wins" : une écriture plus
--    ancienne que celle déjà en base (appareil resté hors-ligne) est ignorée.
create or replace function public.omni_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.modified_at < old.modified_at then
    return null;               -- écriture périmée : on ignore silencieusement
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ── subjects : matières / dossiers ──────────────────────────────────────────
create table if not exists public.subjects (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#5e6ad2',
  exam_date   timestamptz,
  created_at  timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

-- ── courses : cours importés + contenus générés par l'IA ────────────────────
create table if not exists public.courses (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id       uuid not null references public.subjects(id) on delete cascade,
  title            text not null,
  source           text not null default 'paste' check (source in ('pdf','md','txt','paste')),
  content          text not null default '',
  summary          text not null default '',          -- Markdown + {{termes à flouter}}
  keywords         jsonb not null default '[]'::jsonb, -- [{term, definition}]
  audio_script     text not null default '',
  ai_status        text not null default 'none' check (ai_status in ('none','pending','done','error')),
  ai_generated_at  timestamptz,
  created_at       timestamptz not null default now(),
  modified_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted          boolean not null default false
);

-- ── cards : questions du deck + état de répétition espacée (SRS) ────────────
create table if not exists public.cards (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id        uuid not null references public.courses(id) on delete cascade,
  subject_id       uuid not null references public.subjects(id) on delete cascade,
  type             text not null check (type in ('qcm','tf','open','match')),
  question         text not null,
  options          jsonb not null default '[]'::jsonb, -- QCM : ["A","B","C","D"]
  pairs            jsonb not null default '[]'::jsonb, -- mini-jeu : [{left,right}]
  answer           text not null default '',
  explanation      text not null default '',
  critical         boolean not null default false,
  origin           text not null default 'ai' check (origin in ('ai','manual')),
  ease             real not null default 2.5,
  interval_days    real not null default 0,
  due_at           timestamptz not null default now(),
  reps             integer not null default 0,
  lapses           integer not null default 0,
  mastery          smallint not null default 0 check (mastery between 0 and 2),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  modified_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted          boolean not null default false
);

-- ── sessions : historique de révision (streak, statistiques) ────────────────
create table if not exists public.sessions (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id   uuid references public.subjects(id) on delete set null,
  mode         text not null check (mode in ('cards','blur','podcast','voice')),
  pace         text not null default 'free' check (pace in ('express','focus','free','urgent')),
  duration_sec integer not null default 0,
  reviewed     integer not null default 0,
  correct      integer not null default 0,
  started_at   timestamptz not null default now(),
  modified_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

-- ── Index (curseur de synchro + jointures) ──────────────────────────────────
create index if not exists subjects_user_updated_idx on public.subjects (user_id, updated_at);
create index if not exists courses_user_updated_idx  on public.courses  (user_id, updated_at);
create index if not exists courses_subject_idx       on public.courses  (subject_id);
create index if not exists cards_user_updated_idx    on public.cards    (user_id, updated_at);
create index if not exists cards_course_idx          on public.cards    (course_id);
create index if not exists cards_subject_idx         on public.cards    (subject_id);
create index if not exists sessions_user_updated_idx on public.sessions (user_id, updated_at);

-- ── Triggers ────────────────────────────────────────────────────────────────
drop trigger if exists omni_subjects_write on public.subjects;
create trigger omni_subjects_write before insert or update on public.subjects
  for each row execute function public.omni_before_write();

drop trigger if exists omni_courses_write on public.courses;
create trigger omni_courses_write before insert or update on public.courses
  for each row execute function public.omni_before_write();

drop trigger if exists omni_cards_write on public.cards;
create trigger omni_cards_write before insert or update on public.cards
  for each row execute function public.omni_before_write();

drop trigger if exists omni_sessions_write on public.sessions;
create trigger omni_sessions_write before insert or update on public.sessions
  for each row execute function public.omni_before_write();

-- ═══════════════════════════════════════════════════════════════════════════
--  Row Level Security : chaque utilisateur ne voit / ne modifie QUE ses lignes
--  (et ne peut rattacher une ligne qu'à une matière / un cours qui lui appartient)
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.subjects enable row level security;
alter table public.courses  enable row level security;
alter table public.cards    enable row level security;
alter table public.sessions enable row level security;

-- subjects
drop policy if exists "subjects_owner_all" on public.subjects;
create policy "subjects_owner_all" on public.subjects
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- courses
drop policy if exists "courses_owner_all" on public.courses;
create policy "courses_owner_all" on public.courses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.subjects s
                where s.id = subject_id and s.user_id = (select auth.uid()))
  );

-- cards
drop policy if exists "cards_owner_all" on public.cards;
create policy "cards_owner_all" on public.cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.courses c
                where c.id = course_id and c.user_id = (select auth.uid()))
  );

-- sessions
drop policy if exists "sessions_owner_all" on public.sessions;
create policy "sessions_owner_all" on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (subject_id is null or exists (select 1 from public.subjects s
                where s.id = subject_id and s.user_id = (select auth.uid())))
  );

-- ── Privilèges : uniquement le rôle "authenticated" (jamais "anon") ─────────
revoke all on public.subjects, public.courses, public.cards, public.sessions from anon;
grant select, insert, update, delete
  on public.subjects, public.courses, public.cards, public.sessions to authenticated;
