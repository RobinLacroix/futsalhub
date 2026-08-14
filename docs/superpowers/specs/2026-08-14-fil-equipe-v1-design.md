# Fil d'équipe — V1 (socle)

Date : 2026-08-14
Statut : validé, prêt pour plan d'implémentation

## Contexte

FutsalHub n'a aujourd'hui aucun espace d'échange partagé staff/joueurs. La demande initiale couvrait 5 briques :
1. Fil social (posts + tag joueurs + échange)
2. Notification automatique d'anniversaire de joueur
3. Partage automatique des convocations dans le fil
4. Partage automatique du planning de la semaine dans le fil
5. Notification automatique de nouvelle vidéo publiée (module Partage) avec lien

Décision de scope : **cette spec couvre uniquement la brique 1** (le socle du fil, écriture manuelle par le staff + tag + commentaires). Les briques 2 à 4 sont des posts générés automatiquement par des triggers métier distincts (anniversaire = cron, convocation = hook sur l'envoi, planning = hook sur publication, vidéo = hook sur upload) ; elles seront traitées dans une itération séparée une fois le socle posé et testé en usage réel avec l'équipe. Concevoir aujourd'hui un schéma générique pour absorber ces 4 triggers serait de la sur-construction (YAGNI) : ajouter une colonne `source`/`post_type` à `team_posts` plus tard est une migration triviale.

Mobile uniquement en V1 (pas de web) : le staff utilise déjà le mobile au quotidien avec les joueurs, et diviser le travail par deux permet de valider l'adoption avant d'investir côté web.

## Décisions actées

| Sujet | Décision |
|---|---|
| Qui publie un post | Staff uniquement (`has_team_write_access`) |
| Qui commente | Staff + joueurs de l'équipe (`has_team_access`) |
| Portée du fil | Par équipe (pas par club — cohérent avec convocations/planning déjà scopés équipe) |
| Notification push à la publication | Uniquement les joueurs explicitement taggés, pas toute l'équipe |
| Contenu du post | Texte seul en V1, pas de photo (pas de bucket Storage/upload à ce stade) |
| Édition | Autorisée, auteur uniquement (`update_team_post`/`update_post_comment`), marquée `edited_at` |
| Suppression | Auteur OU staff (modération), soft delete |
| Plateforme | Mobile uniquement |

## Modèle de données

```sql
CREATE TABLE public.team_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_user_id  UUID        NOT NULL REFERENCES auth.users(id),
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE public.team_post_tags (
  post_id    UUID NOT NULL REFERENCES team_posts(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, player_id)
);

CREATE TABLE public.team_post_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID        NOT NULL REFERENCES team_posts(id) ON DELETE CASCADE,
  author_user_id  UUID        NOT NULL REFERENCES auth.users(id),
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_team_posts_team_created   ON public.team_posts(team_id, created_at DESC);
CREATE INDEX idx_team_post_tags_player     ON public.team_post_tags(player_id);
CREATE INDEX idx_team_post_comments_post   ON public.team_post_comments(post_id, created_at);
```

## Sécurité (RLS + RPC)

Pattern de référence : `pain_reports` (`supabase/migrations/20260729120000_pain_reports.sql`).

- RLS activée sur les 3 tables.
- Policies `SELECT` : `has_team_access(team_id)` (staff + joueurs de l'équipe). Pour `team_post_tags`/`team_post_comments`, jointure vers `team_posts.team_id`.
- Policies `DELETE` : `auteur (author_user_id = auth.uid()) OR has_team_write_access(team_id)`.
- **Aucune policy `INSERT`/`UPDATE`** — toutes les écritures passent par les RPC ci-dessous. C'est la leçon directe du bug de création de joueur mobile (policy `INSERT` dépendante d'une colonne que l'appli ne renseignait plus) : en confiant l'écriture à une RPC qui fait ses propres vérifications, on élimine cette classe de bug.
- Chaque fonction : `REVOKE ALL ... FROM PUBLIC` explicite (règle non négociable du repo, cf. garde-fou §15 de `20260803100000`), puis `GRANT EXECUTE TO authenticated`.

## Surface RPC

```
create_team_post(p_team_id UUID, p_content TEXT, p_player_tags UUID[] DEFAULT '{}')
  RETURNS JSONB {success, post_id}
  - vérifie has_team_write_access(p_team_id), sinon {success:false, error:'forbidden'}
  - insère team_posts + team_post_tags
  - pour chaque player_tag avec players.user_id NON NULL :
      INSERT INTO notifications (user_id, type='post_tag', title, body, data)
      → déclenche le push existant automatiquement (trigger _push_on_notification_insert déjà en place)

update_team_post(p_post_id UUID, p_content TEXT) RETURNS JSONB {success}
  - auteur uniquement, sinon {success:false, error:'forbidden'}
  - met à jour content + edited_at

delete_team_post(p_post_id UUID) RETURNS JSONB {success}
  - auteur OU has_team_write_access → soft delete (deleted_at)

get_team_feed(p_team_id UUID, p_limit INT DEFAULT 20, p_before TIMESTAMPTZ DEFAULT NULL)
  RETURNS JSONB[]
  - vérifie has_team_access(p_team_id)
  - posts non supprimés, avec tags résolus (id, first_name, last_name) et comment_count
  - pagination par curseur created_at (p_before)

add_post_comment(p_post_id UUID, p_content TEXT) RETURNS JSONB {success, comment_id}
  - vérifie has_team_access sur le team_id du post
  - insère le commentaire
  - si commentateur ≠ auteur du post : INSERT INTO notifications (type='post_comment')

update_post_comment(p_comment_id UUID, p_content TEXT) RETURNS JSONB {success}
  - auteur uniquement

delete_post_comment(p_comment_id UUID) RETURNS JSONB {success}
  - auteur OU has_team_write_access → soft delete

get_post_comments(p_post_id UUID) RETURNS JSONB[]
  - vérifie has_team_access sur le team_id du post
```

`get_my_notification_counts` (existante) gagne une clé `post_tag` (`COUNT(*) FILTER (WHERE type = 'post_tag')`) pour badger l'entrée du fil spécifiquement — le `total` global l'inclut déjà mais un badge dédié rend visible "tu as été mentionné" sans ambiguïté.

## Mobile — écrans et points d'entrée

Pas de nouvel onglet : coach a déjà 5 tabs (limite iOS), joueur en a 4 mais on garde la même approche des deux côtés pour cohérence.

- **Carte "Fil d'équipe"** sur l'écran d'accueil, coach (`mobile/app/(tabs)/index.tsx`) et joueur (`mobile/app/(player-tabs)/index.tsx`) : aperçu des 2-3 derniers posts + badge si mentions non lues (`counts.post_tag`).
- **`(tabs)/feed` / route équivalente** (hors tab bar, poussée depuis l'accueil comme `squad/[playerId]`) : liste paginée des posts, pull-to-refresh, bouton "+" visible uniquement pour le staff.
- **Composer** : écran plein, réutilise le pattern `squad/new-player.tsx` (textarea + `ChipGroup`/liste multi-select des joueurs de l'effectif actif pour le tag).
- **Détail post** : contenu + liste de commentaires + champ de réponse. Realtime via `supabase.channel` sur `team_posts`/`team_post_comments`, même mécanisme que `NotificationContext`.
- Service : `mobile/lib/services/teamFeed.ts`, uniquement des appels `supabase.rpc(...)` (aucun `.from('team_posts')` direct), pattern `mobile/lib/services/painReports.ts`.

## Hors scope V1 (rappel)

- Photos/pièces jointes dans les posts
- Web (`app/webapp`)
- Les 4 triggers automatiques (anniversaire, convocation, planning, vidéo) — itération séparée
- Réactions/emoji
- Notification à toute l'équipe à chaque post (seuls les joueurs taggés sont notifiés en push ; le reste de l'équipe voit le post en ouvrant l'app)

## Risques / points d'attention pour le plan d'implémentation

- Vérifier qu'un joueur non taggé mais lisant le fil régulièrement n'a pas de FOMO silencieux : accepté comme compromis V1 (cf. décision "notif push = taggés uniquement"), à réévaluer après usage réel.
- `players.user_id` peut être NULL (joueur sans compte lié) : `create_team_post` doit ignorer silencieusement les tags de joueurs sans compte (pas d'erreur bloquante), juste ne pas créer de notification pour eux.
- Migration à nommer avec un timestamp `YYYYMMDDHHMMSS` unique — vérifier qu'aucun fichier existant ne le partage avant de committer.
