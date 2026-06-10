-- Table pour stocker les tokens Expo Push Notification par utilisateur
create table public.push_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  token      text        not null,
  platform   text,                         -- 'ios' | 'android'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.push_tokens enable row level security;

-- Chaque utilisateur gère uniquement ses propres tokens
create policy "push_tokens: own rows only"
  on public.push_tokens
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
