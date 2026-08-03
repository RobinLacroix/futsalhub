# CLAUDE.md — FutsalHub

Ce fichier est chargé au début de chaque session Claude Code sur ce repo. Il remplace l'exploration : lis-le avant de faire des `Glob`/`Grep` d'architecture, l'info y est déjà.

## Ce que c'est

SaaS pour coachs de futsal (gestion joueurs, séances, convocations, analytics match, contenu pédagogique). Solo-dev (Robin). Beta interne en cours (Paris XIV Futsal, saison 25/26). Beta externe visé saison 26/27. Produit commercial, pas un portfolio.

## Stack et architecture réelle

Trois briques indépendantes, ~65k lignes TS/TSX au total, **pas de lien de code entre elles** :

1. **Web** — `app/` (App Router), Next.js 16 / React 19. ~35k lignes. Radix UI + Tailwind, `react-hook-form` + `yup`.
2. **Mobile** — `mobile/`, Expo / React Native, **projet Node séparé** (son propre `node_modules`, `package.json`, `tsconfig.json`). ~30k lignes.
3. **Générateur de schémas** — `generateur-schemas/` (dans le dossier parent `livrables/futsalhub/`), outil autonome IA pour générer des exercices. Aucun lien avec le reste.

**Backend : Supabase (Postgres).** La logique métier vit majoritairement dans des fonctions RPC `SECURITY DEFINER` (87 migrations dans `supabase/migrations/`), pas dans le code applicatif. Le front est un client relativement mince. C'est un choix assumé, pas un accident — mais ça veut dire que **comprendre une feature veut souvent dire lire la migration SQL, pas juste le composant.**

Flux de données type :
```
Composant .tsx → lib/services/*.ts (web) ou mobile/lib/services/*.ts (mobile) → supabase-js → RPC SECURITY DEFINER → Postgres
```

Pas de React Query / SWR : gestion d'état via Context API (`ActiveTeamContext`, `AppRoleContext`, `MatchRecorderContext`, `NotificationContext`...). Chaque page refetch à la main.

## Carte des dossiers utiles

- `lib/services/` (web) et `mobile/lib/services/` (mobile) — couche services. C'est **la** référence pour parler à la base, même si elle est encore contournée par endroits (voir Dette technique).
- `types/index.ts` (web, 370 l.) et `mobile/types/index.ts` (mobile, 129 l.) — définitions d'entités. Pas encore unifiées.
- `components/` (web) et `mobile/components/` — composants partagés. `BodyMap.tsx` est dupliqué verbatim web/mobile (pattern assumé pour ce composant précis, voir `context/futsalhub.md` du workspace parent pour le pourquoi).
- `supabase/migrations/` — 87 fichiers, source de vérité du schéma. Numérotation par timestamp `YYYYMMDDHHMMSS_description.sql` : **vérifie qu'aucun autre fichier ne partage ton timestamp avant de committer** (deux collisions déjà rencontrées et corrigées).
- `livrables/futsalhub/` (dossier parent, hors ce repo) — tous les audits et specs à jour : `AUDIT_ARCHITECTURE_2026-07.md`, `AUDIT_SECURITE_RPC_2026-07.md`, `SPEC_EVALUATION_MATCH_2026-07.md`, `SPRINT0_SYNTHESE_ARBITRAGE_2026-07.md`. Si une question porte sur "pourquoi c'est fait comme ça", la réponse est probablement déjà écrite là — chercher avant de redemander à Robin.

## Convention de travail actée : pattern Batch 2

Refonte en cours, non-régression stricte, **`tsc` = oracle** (0 erreur avant, 0 erreur après, pas de nouvelle erreur tolérée même transitoire).

Pattern cible pour toute nouvelle feature ou tout code touché : **composant → service (`lib/services`) → RPC**. Zéro accès DB direct (`supabase.from()` / `supabase.rpc()`) depuis un `.tsx`. C'est déjà la règle appliquée sur le module `pain_reports` (juillet 2026, référence à suivre) et sur le pilote `matches`/`tracker`.

Deux corrections apportées à la méthode par Robin, à respecter :
1. Dans un god-component, **décomposer avant de router vers les services** — router d'abord casse.
2. Un accès DB direct n'est pas automatiquement de la dette : une partie est de l'accès hétérogène légitime. Ne pas migrer par réflexe, vérifier le cas.

## Pièges connus — ne pas re-découvrir à chaque session

- **`app/webapp/tracker/matchrecorder/page.tsx`** — ~5000 lignes, 26 `useState`, 7 `useEffect`, 26 accès DB directs. Le pire fichier du repo. Toute modif dessus : décomposer la portion touchée en sous-composant avant d'ajouter du code, ne jamais ajouter au monolithe.
- **`calendar/page.tsx`** — 3736 lignes, agrégation de données côté client (`select('*')` puis calcul JS). Idem pour `analytics/page.tsx` (1586 l.) et `schematics` (2545 l.).
- **Duplication web/mobile assumée mais non résolue** : `lib/services/matchesService.ts` (web) et `mobile/lib/services/matches.ts` (mobile) exposent les mêmes fonctions et **ont déjà divergé**. Pareil pour players, teams, trainings, matchEvents. Si tu changes une règle métier côté web, vérifie si l'équivalent mobile existe et divergera.
- **Trois libs de graphiques** (`chart.js`+`react-chartjs-2`, `recharts`, `framer-motion` pour des animations de charts) + **deux libs de dates** (`moment` déprécié + `date-fns`). Ne pas en ajouter une quatrième : réutiliser l'existant du fichier voisin.
- **248 `console.*`** en dur dans les pages web, zéro stratégie de logging homogène. Ne pas s'étonner d'en croiser, ne pas en ajouter sans raison.
- **Zéro test** dans le repo. Ne pas supposer qu'une régression sera attrapée ailleurs que par `tsc` et une vérification manuelle.

## Sécurité — RPC `SECURITY DEFINER`

Point chaud, prérequis dur avant tout onboarding de club externe (isolation multi-clubs). Deux passes d'audit, à lire dans l'ordre : `AUDIT_SECURITE_RPC_2026-07.md` (isolation inter-clubs) puis **`AUDIT_SECURITE_RPC_2026-08.md` (exposition `anon`, le plus important)**. Ne pas re-auditer à froid.

**Quatre règles, non négociables, pour toute nouvelle fonction :**

1. **`REVOKE ALL ... FROM PUBLIC` explicite, toujours** — y compris sur les helpers internes préfixés `_` et sur ceux qu'on croit non exposés. Postgres accorde `EXECUTE` à `PUBLIC` **par défaut** à la création, et sous Supabase `anon` et `authenticated` sont membres de `PUBLIC`. Un `GRANT ... TO authenticated` **n'enlève rien**, il ajoute une entrée : `PUBLIC` reste. C'est le défaut qui a laissé ~60 fonctions `DEFINER` sur 66 appelables sans compte via `/rest/v1/rpc/<nom>` jusqu'en août 2026. Le garde-fou §15 de `20260803100000` fait échouer toute migration qui réintroduit le trou — ne jamais le neutraliser, lire la liste qu'il affiche et arbitrer.
2. **Paramètre d'id (`p_team_id`, `p_club_id`, `p_match_id`, `p_player_id`) => garde d'accès obligatoire** via les primitives existantes (`has_club_access`, `has_team_access`, `is_club_admin`, `is_team_coach`, `has_player_access`). Elles scopent correctement sur `auth.uid()` — les réutiliser, ne pas en réinventer. Vérifier aussi qu'une primitive appelée **existe** : `has_club_admin_access` n'a jamais existé et a planté `set_team_main_coach` pendant deux mois.
3. **Lecture ≠ écriture.** `has_club_access` et `has_team_access` renvoient TRUE pour le rôle `viewer` : ce sont des gardes de **lecture**. Toute écriture prend `has_club_write_access` / `has_team_write_access` (ce dernier est team-scopé, cf. `20260730100000`).
4. **Comparaison d'identité NULL-safe.** `IF auth.uid() <> p_user_id THEN RAISE` est **cassé** : pour un appelant `anon`, `auth.uid()` vaut NULL, `NULL <> x` vaut NULL, et le `IF` ne se déclenche pas — la garde saute exactement pour celui qu'elle doit bloquer. Écrire `IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id`.

Pattern sain pour les fonctions `get_my_*` (sans paramètre spoofable) : résoudre l'identité via `auth.uid()` en premier, scoper dessus ensuite. C'est le pattern à copier pour toute nouvelle fonction self-scopée.

**Surface `anon` assumée, et elle seule** (3 RPC à token `gen_random_uuid()` = 128 bits) : `get_feedback_session_by_token`, `submit_training_feedback`, `report_pain_by_token`. Toute autre RPC joignable sans authentification est un bug.

**RLS : ne JAMAIS créer une policy depuis l'interface Supabase.** Ses templates produisent des `USING (true)`. En PostgreSQL les policies permissives se combinent en **OU** : une seule policy ouverte annule toutes les autres policies de la table. C'est ce qui a laissé la prod ouverte en lecture à Internet jusqu'au 2026-08-03 (85 joueurs, 145 séances, 2598 événements, 7 profils avec email et téléphone, lisibles sans compte) alors que les policies écrites en migration étaient correctes. 33 policies ouvertes et 3 tables sans RLS, aucune dans le repo. Corrigé par `20260803140000_rls_lockdown.sql`, dont le §9 fait échouer toute migration future qui en réintroduirait. Exception assumée et documentée : `training_procedures`.

**`supabase/migrations/` n'est PAS une source de vérité fiable du schéma.** Au moins un objet a été créé à la main dans le dashboard sans migration : `get_team_stats(team_uuid)`, `SECURITY DEFINER` sans garde, appelée en prod par `app/webapp/manager/teams/page.tsx:96`, absente des 88 fichiers. Elle a été rapatriée dans `20260803100000` (§16). Avant d'onboarder des clubs externes, mesurer l'ampleur de la dérive avec `supabase db diff`. Corollaire pratique : pour toute question de sécurité, **interroger `pg_proc` / `pg_policies` sur la base**, pas seulement grep les migrations.

Historique : 3 fuites inter-clubs corrigées en juillet (`20260726120000`), 14 findings corrigés en août (`20260803100000`) dont l'exposition `anon` généralisée et l'écriture de données de santé forgeable sans compte.

## Protocole : écrire et appliquer une migration

Robin applique les migrations **à la main dans le SQL Editor du dashboard** (pas de CLI installée, pas de `config.toml`, `supabase_migrations.schema_migrations` non fiable). Ça marche, mais ça impose une discipline stricte.

**Écrire une migration :**

1. **Ne jamais donner du SQL directement dans la conversation.** Toujours écrire un fichier dans `supabase/migrations/`, puis dire à Robin de le copier. Du SQL collé depuis un message est du SQL qui n'existera dans aucun fichier : c'est comme ça que `get_team_stats` s'est retrouvée en prod hors repo.
2. Nommage `YYYYMMDDHHMMSS_description.sql` — **vérifier qu'aucun fichier ne partage le timestamp** (deux collisions déjà rencontrées).
3. Écrire **idempotent** : `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` avant `CREATE POLICY`, `IF NOT EXISTS`. Robin peut avoir à rejouer le fichier après une erreur en milieu de parcours.
4. Pour toute modification sensible, terminer par un bloc de vérification qui `RAISE EXCEPTION` si l'invariant n'est pas tenu (cf. §15 de `20260803100000`). Un contrôle qui interroge le catalogue attrape ce qu'aucune relecture de code ne voit — il a bloqué deux erreurs réelles le 2026-08-03.
5. Ne pas changer de comportement fonctionnel dans une migration de sécurité (chiffres affichés, calculs). Signaler les bugs trouvés, les corriger à part.

**Faire appliquer :** dire à Robin d'encadrer le fichier par `BEGIN;` / `COMMIT;` dans le SQL Editor. Sans ça, une erreur en cours de route laisse la base à moitié migrée.

**Accès base disponible.** Rôle `claude_audit` (lecture de catalogue uniquement, aucune table métier), connexion via `FUTSALHUB_AUDIT_DB_URL` dans le `.env` du workspace Jarvis parent. L'utiliser sans jamais afficher sa valeur :
`set -a && . .env && set +a && psql "$FUTSALHUB_AUDIT_DB_URL" -Atc "..."`

**Ne jamais supposer que le repo décrit la base.** `supabase/migrations/` n'est pas une source de vérité fiable (cf. paragraphe Sécurité). Avant un diagnostic, interroger `pg_proc`, `pg_policies`, `pg_proc.proacl` / `aclexplode` sur la base réelle — quitte à faire exécuter la requête par Robin et à attendre le résultat. Postgres distant : **15.8**.

## Ce qui est délibérément hors scope pour l'instant

Squash des 87 migrations, extraction d'une source unique de types web/mobile, introduction de React Query, déplacement de l'agrégation analytics en RPC/vues Postgres. Tout ça est identifié et priorisé dans `AUDIT_ARCHITECTURE_2026-07.md` (§ Plan d'action) — ne pas le reproposer comme une découverte, vérifier d'abord si Robin l'a déjà arbitré.

## Comment travailler ici

- Cite le fichier et la fonction exacts plutôt que de demander une exploration large — la carte ci-dessus couvre l'essentiel.
- Avant de toucher à un god-component, relire le paragraphe "Pièges connus" correspondant.
- Avant d'écrire une nouvelle RPC, relire le paragraphe Sécurité.
- `tsc` doit rester à 0 erreur en continu. Le lancer avant de considérer une tâche terminée.
- Clé APNs (`AuthKey_NBQC2X458Y.p8`) : réglé (2026-07-30). Le fichier vit dans `.secrets/` (gitignoré, jamais commité). La fonction edge `send-push-notification` ne lit pas le fichier : elle attend `APNS_PRIVATE_KEY`/`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID` en variables d'env. Secrets locaux disponibles dans `supabase/functions/.env` (gitignoré) pour tester avec `supabase functions serve`. Pour la prod, ces mêmes secrets doivent être poussés via `supabase secrets set` sur le projet distant — à vérifier si ce n'est pas déjà fait.
