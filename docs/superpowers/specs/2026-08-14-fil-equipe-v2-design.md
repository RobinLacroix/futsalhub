# Fil d'équipe — V2 (triggers automatiques)

Date : 2026-08-14
Statut : validé, prêt pour implémentation
Dépend de : [2026-08-14-fil-equipe-v1-design.md](2026-08-14-fil-equipe-v1-design.md) (socle en prod, testé)

## Contexte

La V1 a livré le socle du fil (posts manuels staff, tag joueurs, commentaires). Cette V2 couvre les 4 briques reportées à l'époque :
1. Notification d'anniversaire de joueur
2. Partage d'une convocation (entraînement ou match) dans le fil
3. Partage du planning de la semaine dans le fil
4. Notification de nouvelle vidéo publiée dans le module Partage, avec lien

## Décisions actées

| Sujet | Décision |
|---|---|
| Déclenchement convocation/planning/vidéo | **Bouton staff** ("Partager dans le fil"), pas automatique. Un post à chaque convocation d'entraînement (2-3×/semaine) noierait le fil ; le staff garde la main sur ce qui mérite une annonce. |
| Déclenchement anniversaire | Seul cas 100% automatique — personne ne "déclenche" un anniversaire. |
| Mécanisme anniversaire | **Calcul à la lecture** dans `get_team_feed`, pas de `pg_cron` (non installé sur le projet, éviterait une dépendance d'infra nouvelle). Table de log pour l'idempotence. |
| Portée anniversaire | Équipe principale du joueur uniquement (`players.team_id`), pas toutes ses équipes. |
| Emplacement bouton convocation | Écran détail entraînement/match, visible si des joueurs sont convoqués, staff only. |
| Emplacement bouton planning | Onglet Calendrier, indépendant d'un événement précis (digest 7 prochains jours). |
| Emplacement bouton vidéo | Case à cocher au moment de l'ajout d'un contenu dans le module Partage. |
| Auteur des posts système | Convocation/planning/vidéo : le staff qui a tapé le bouton (`auth.uid()`, comme un post manuel). Anniversaire : premier admin du club (résolu côté RPC), seul cas sans humain à l'origine. |

## Modèle de données

Extension additive de `team_posts` (V1 en prod, non cassante) :

```sql
ALTER TABLE team_posts
  ADD COLUMN post_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (post_type IN ('manual','birthday','convocation','planning','video')),
  ADD COLUMN link_url TEXT;  -- nullable : cible du bouton "Voir" (route in-app ou URL externe pour la vidéo)

CREATE TABLE team_feed_birthday_log (
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  birthday_year INT  NOT NULL,  -- année civile du post ; empêche un doublon si le fil est ouvert 10x le même jour
  post_id       UUID REFERENCES team_posts(id) ON DELETE SET NULL,
  PRIMARY KEY (team_id, player_id, birthday_year)
);
```

`post_type`/`link_url` ne changent rien pour les posts manuels V1 (défaut `'manual'`, `link_url` NULL) — `get_team_feed`/`get_team_post` les exposent, le client les ignore silencieusement s'il ne les reconnaît pas encore.

## Surface RPC

```
share_convocation_to_feed(p_training_id UUID DEFAULT NULL, p_match_id UUID DEFAULT NULL)
  RETURNS JSONB {success, post_id}
  - exactement un des deux paramètres non NULL, sinon {success:false, error:'bad_request'}
  - has_team_write_access(team_id de l'entraînement/match) sinon 'forbidden'
  - lit date/lieu/adversaire + nombre de convoqués (trainings.convoked_players ou matches.players)
  - content : "Convocation : Entraînement <jour> <heure> — <lieu> (<N> joueurs)" (ou équivalent match)
  - link_url : route in-app vers le détail (/(tabs)/calendar/training/<id> ou matchDetail/<id>)
  - post_type = 'convocation'
  - si aucun joueur convoqué : {success:false, error:'no_convocation'}

share_weekly_planning_to_feed(p_team_id UUID) RETURNS JSONB {success, post_id}
  - has_team_write_access(p_team_id)
  - agrège trainings + matches du p_team_id sur les 7 prochains jours (now() → now()+7j)
  - content : digest formaté, une ligne par événement (date, heure, lieu/adversaire)
  - link_url = route in-app /(tabs)/calendar ; post_type = 'planning'
  - si aucun événement à 7 jours : {success:false, error:'no_events'}

share_video_to_feed(p_shared_content_id UUID) RETURNS JSONB {success, post_id}
  - has_team_write_access(team_id du contenu)
  - lit title/url depuis shared_content
  - content : "Nouvelle vidéo : <title>" ; link_url = shared_content.url (externe)
  - post_type = 'video'

_ensure_birthday_posts(p_team_id UUID) RETURNS VOID  -- interne, appelée par get_team_feed
  - joueurs actifs (status='active') de players.team_id = p_team_id
    dont EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND EXTRACT(DAY FROM birth_date) = EXTRACT(DAY FROM CURRENT_DATE)
  - pour chacun : INSERT INTO team_feed_birthday_log (team_id, player_id, birthday_year)
    VALUES (p_team_id, player.id, EXTRACT(YEAR FROM CURRENT_DATE)) ON CONFLICT DO NOTHING
  - si la ligne est effectivement insérée (pas de conflit) : crée le post
    ("🎂 Joyeux anniversaire <Prénom> !", post_type='birthday', author = premier admin du club)
```

Toutes les fonctions publiques : `REVOKE ALL FROM PUBLIC` explicite + `GRANT EXECUTE TO authenticated`, même discipline que la V1 et le reste du repo (garde-fou §15 de `20260803100000`).

`get_team_feed` et `get_team_post` sont modifiées (`CREATE OR REPLACE`) pour : (1) appeler `_ensure_birthday_posts(p_team_id)` avant la lecture, (2) inclure `post_type` et `link_url` dans le JSON retourné.

## Mobile — points d'entrée

- **`calendar/training/[trainingId].tsx`** et **`calendar/matchDetail/[matchId].tsx`** : bouton "Partager la convocation" (staff only, visible si convoqués non vides) → appelle `share_convocation_to_feed`, confirmation puis lien vers le fil.
- **`calendar/index.tsx`** : action "Partager le planning" dans le header/barre d'actions (staff only) → `share_weekly_planning_to_feed(activeTeamId)`.
- **`share/index.tsx`** (formulaire d'ajout de contenu) : case à cocher "Partager dans le fil d'équipe", cochée par défaut. Après `createSharedContent` réussi, si cochée, appelle `share_video_to_feed(content.id)` en suivi (best-effort, non bloquant : un échec ne remet pas en cause l'ajout du contenu).
- **`components/feed/FeedList.tsx`** et **`PostDetail.tsx`** : icône par `post_type` (🎂/📋/🗓️/🎬, rien pour `manual`), bouton "Voir" si `link_url` présent — `router.push` pour une route in-app, `Linking.openURL` pour une URL externe (vidéo).
- Types mobiles (`TeamFeedPost`) : ajout de `post_type` et `link_url`.

## Hors scope V2

- Modifier/supprimer un post système autrement que par la modération standard déjà en place (auteur ou staff, V1).
- Répéter le partage planning automatiquement chaque semaine (reste un geste staff volontaire).
- Notification push de masse sur ces posts système (reprend la règle V1 : push uniquement aux joueurs tagués — les posts système n'ont pas de tags, donc pas de push, juste visibles à l'ouverture du fil).

## Risques / points d'attention pour l'implémentation

- `_ensure_birthday_posts` s'exécute à chaque appel de `get_team_feed` : garder la requête indexée sur `birth_date` (pas d'index existant dessus — à ajouter si le volume le justifie, non critique pour un effectif de ~20 joueurs).
- `share_convocation_to_feed` doit gérer proprement le cas "ni training_id ni match_id" et "les deux" comme des erreurs de requête, pas des 500.
- Vérifier qu'aucun timestamp de migration existant ne collisionne avant de committer.
