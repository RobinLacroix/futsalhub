create table public.shared_content (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  description text,
  content_type text not null check (content_type in ('youtube', 'link')),
  url text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.shared_content enable row level security;

-- Coaches/admins and players of the team can view
create policy "shared_content_select" on public.shared_content
  for select
  using (
    -- Coach/admin of the club that owns the team
    exists (
      select 1 from public.teams t
      join public.club_members cm on cm.club_id = t.club_id
      where t.id = shared_content.team_id
        and cm.user_id = auth.uid()
    )
    or
    -- Player in this team
    exists (
      select 1 from public.player_teams pt
      join public.players p on p.id = pt.player_id
      where pt.team_id = shared_content.team_id
        and p.user_id = auth.uid()
    )
  );

-- Coaches/admins can insert
create policy "shared_content_insert" on public.shared_content
  for insert
  with check (
    exists (
      select 1 from public.teams t
      join public.club_members cm on cm.club_id = t.club_id
      where t.id = shared_content.team_id
        and cm.user_id = auth.uid()
        and cm.role in ('admin', 'coach')
    )
  );

-- Creator or admin can delete
create policy "shared_content_delete" on public.shared_content
  for delete
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.teams t
      join public.club_members cm on cm.club_id = t.club_id
      where t.id = shared_content.team_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  );
