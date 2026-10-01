# Mobile — Mode Séance Live (chrono + équipes + score) — Implementation Plan

> **For agentic workers:** Ce repo n'a pas les skills `subagent-driven-development`/`executing-plans` installés — exécuter task par task directement en session, dans l'ordre. Pas de suite de tests dans ce repo (`CLAUDE.md` : "Zéro test... `tsc` comme oracle") : chaque étape "test" ci-dessous est remplacée par une vérification `tsc --noEmit` + vérification manuelle simulateur en fin de plan. Cases à cocher (`- [ ]`) pour le suivi.

**Goal:** Livrer le mode live pour coachs sur mobile — chrono configurable (continu ou séries/repos), composition d'équipes par tap-to-cycle à partir des joueurs présents (gardiens dans un pool séparé), suivi de score par jeu et sur l'ensemble de la séance, offline-first.

**Spec de référence :** [2026-09-23-mode-seance-live-design.md](../specs/2026-09-23-mode-seance-live-design.md), elle-même une extension de [`SPEC_FEATURES_BETA_2026-08.md`](../../../../SPEC_FEATURES_BETA_2026-08.md) §5 (LOT C, jamais implémenté).

**Architecture :** Composant écran → service (`mobile/lib/services/trainingGames.ts`) → `supabase-js` (`.from()`, sous RLS — pas de RPC `SECURITY DEFINER` custom, voir note Task 1) → Postgres. Pattern Context API + refetch manuel, pas de React Query, comme le reste du mobile.

**Déviation actée par rapport à la spec :** la spec de conception (et LOT C avant elle) envisageait des RPC `SECURITY DEFINER` dédiées (`save_training_squads`, `start_training_game`...). En écrivant ce plan, `training_sessions` (migration `20260921100000`, la table la plus récente et la plus proche par sa forme — club-scoped, JSON, créée il y a 2 jours) s'est révélée construite **sans aucune RPC custom** : table + trigger d'auto-remplissage de `club_id` + policies RLS `has_club_access`/`has_club_write_access`, accès direct `supabase.from()` depuis le service. C'est plus simple, strictement équivalent en sécurité (RLS fait le travail), et cohérent avec le seul précédent construit dans ce repo pour une table de cette forme. Ce plan suit ce patron, pas celui, plus lourd, esquissé dans la spec d'août.

## Global Constraints

- `cd mobile && npx tsc --noEmit -p tsconfig.json` doit rester à 0 erreur après chaque tâche.
- Toute écriture SQL suit les 4 règles non négociables de `CLAUDE.md` (§ Sécurité) : `REVOKE ALL ... FROM PUBLIC` explicite, garde d'accès sur l'id fourni, `has_*_access` pour la lecture / `has_*_write_access` pour l'écriture, comparaison d'identité NULL-safe. Vérifié en session sur la base réelle (rôle `claude_audit`) : `has_club_access(p_club_id uuid)`, `has_club_write_access(p_club_id uuid)` existent et sont utilisables tels quels — mêmes signatures que celles déjà utilisées par `training_sessions`/`training_procedures`.
- `trainings.club_id` existe en base (colonne directe, vérifié par introspection `pg_attribute` — absent du type mobile `Training` aujourd'hui, ce qui n'est pas un problème : le trigger d'auto-remplissage (Task 1) dérive `club_id` côté serveur depuis `training_id`, le client n'a jamais besoin de le connaître ni de l'envoyer).
- Aucune table `training_squads`/`training_games`/`training_game_players` n'existe en base aujourd'hui (vérifié par introspection catalogue) — Task 1 les crée de zéro.
- Nommage migration : `YYYYMMDDHHMMSS_description.sql`. `20260923150000` vérifié libre (`ls supabase/migrations | grep ^20260923` → vide) au moment de l'écriture de ce plan — **revérifier juste avant de committer**, une autre migration a pu être écrite entretemps.
- Pas de `window.confirm` : `Alert.alert` pour toute confirmation destructive, pattern déjà en place ailleurs.
- Nouvelle dépendance : `expo-audio` (aucune lib audio dans ce repo aujourd'hui, vérifié par grep — première introduction, à documenter dans le commit qui l'ajoute plutôt que la glisser discrètement dans un commit fonctionnel, cf. Task 6).
- Import unique des primitives UI depuis `mobile/components/ui` (barrel).

---

## Task 1: Migration — tables, trigger, RLS

**Files:**
- Create: `supabase/migrations/20260923150000_mode_seance_live.sql`

**Interfaces:**
- Produces: tables `training_squads`, `training_games`, `training_game_players` — consommées par Task 2.

- [ ] **Step 1: Vérifier l'absence de collision de timestamp**

```bash
ls supabase/migrations | grep ^20260923150000
```
Expected: aucune sortie. Si collision, décaler le timestamp de quelques secondes et adapter le nom de fichier ci-dessous.

- [ ] **Step 2: Écrire la migration**

```sql
-- ═════════════════════════════════════════════════════════════════════════════
-- Mode Séance Live : plateaux (chasubles) et jeux chronométrés/scorés d'une
-- séance d'entraînement. Reprend le modèle de LOT C
-- (livrables/futsalhub/SPEC_FEATURES_BETA_2026-08.md §5, arbitré 13/08/2026,
-- jamais implémenté), étendu avec un chrono à séries/repos
-- (docs/superpowers/specs/2026-09-23-mode-seance-live-design.md).
--
-- Décisions à ne pas défaire (cf. design doc §1) :
--  - Composition figée PAR JEU, pas par séance (training_game_players).
--  - Score = deux entiers bruts par jeu, jamais ventilé, jamais d'attribution
--    de buteur — aucune table d'événements ici, volontairement.
--  - club_id est DÉRIVÉ par trigger depuis training_id, jamais fourni par le
--    client — élimine par construction le risque qu'un client cohérent en
--    apparence associe un training_id d'un club à un club_id d'un autre club
--    où il a un accès en écriture.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_squads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  club_id     uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  label       text NOT NULL,
  color_token text NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.training_squads IS
  'Plateaux (chasubles) d''une séance — scope training, pas club. Nom distinct de teams pour éviter la collision de vocabulaire avec les équipes du club.';
COMMENT ON COLUMN public.training_squads.color_token IS
  'Index/clé dans theme.colors.chartSeries côté mobile — jamais un hex stocké ici.';

CREATE INDEX IF NOT EXISTS idx_training_squads_training_id ON public.training_squads (training_id);

CREATE TABLE IF NOT EXISTS public.training_games (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id            uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  club_id                uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  sequence               smallint NOT NULL,
  part_index             smallint,
  procedure_id           uuid REFERENCES public.training_procedures(id) ON DELETE SET NULL,
  label                  text,
  score_unit_label       text,
  home_squad_id          uuid NOT NULL REFERENCES public.training_squads(id) ON DELETE CASCADE,
  away_squad_id          uuid NOT NULL REFERENCES public.training_squads(id) ON DELETE CASCADE,
  score_home             smallint NOT NULL DEFAULT 0,
  score_away             smallint NOT NULL DEFAULT 0,
  timer_mode             text NOT NULL DEFAULT 'continu' CHECK (timer_mode IN ('continu', 'series')),
  series_count           smallint,
  series_duration_seconds integer,
  rest_duration_seconds  integer,
  duration_seconds       integer,
  started_at             timestamptz,
  ended_at               timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (training_id, sequence),
  CHECK (home_squad_id <> away_squad_id),
  CHECK (
    (timer_mode = 'continu' AND series_count IS NULL AND series_duration_seconds IS NULL AND rest_duration_seconds IS NULL)
    OR
    (timer_mode = 'series' AND series_count > 0 AND series_duration_seconds > 0 AND rest_duration_seconds >= 0)
  )
);

COMMENT ON TABLE public.training_games IS
  'Un jeu chronométré/scoré de la séance. score_unit_label est un libellé DESCRIPTIF ("buts", "récupérations"), affiché, jamais agrégé — ne jamais sommer des score_home/score_away entre jeux d''unités différentes.';
COMMENT ON COLUMN public.training_games.part_index IS
  'Indice dans trainings.session_parts / lien futur vers le bloc de l''assembleur de séance — posé sans UI pour cette itération.';

CREATE INDEX IF NOT EXISTS idx_training_games_training_id ON public.training_games (training_id, sequence);

CREATE TABLE IF NOT EXISTS public.training_game_players (
  game_id   uuid NOT NULL REFERENCES public.training_games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  squad_id  uuid NOT NULL REFERENCES public.training_squads(id) ON DELETE CASCADE,
  club_id   uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, player_id)
);

COMMENT ON TABLE public.training_game_players IS
  'Composition FIGÉE PAR JEU (pas par séance) — le rebrassage des plateaux entre deux jeux est le cœur de la manipulation des supériorités numériques. Une composition au niveau séance rendrait tout cumul joueur faux dès le premier rebrassage.';

CREATE INDEX IF NOT EXISTS idx_training_game_players_game_id ON public.training_game_players (game_id);
CREATE INDEX IF NOT EXISTS idx_training_game_players_player_id ON public.training_game_players (player_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. club_id dérivé par trigger, jamais fourni par le client (BEFORE INSERT).
-- Même patron que training_sessions_fill_ownership (20260921100000 §2), mais
-- la source de vérité ici est training_id → trainings.club_id, pas
-- club_members : ces lignes appartiennent à UN entraînement précis, pas au
-- choix libre du créateur.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.training_squads_fill_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  SELECT club_id INTO NEW.club_id FROM public.trainings WHERE id = NEW.training_id;
  IF NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'training_id % introuvable ou sans club_id.', NEW.training_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS training_squads_fill_club_id_trg ON public.training_squads;
CREATE TRIGGER training_squads_fill_club_id_trg
  BEFORE INSERT ON public.training_squads
  FOR EACH ROW EXECUTE FUNCTION public.training_squads_fill_club_id();

CREATE OR REPLACE FUNCTION public.training_games_fill_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  SELECT club_id INTO NEW.club_id FROM public.trainings WHERE id = NEW.training_id;
  IF NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'training_id % introuvable ou sans club_id.', NEW.training_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS training_games_fill_club_id_trg ON public.training_games;
CREATE TRIGGER training_games_fill_club_id_trg
  BEFORE INSERT ON public.training_games
  FOR EACH ROW EXECUTE FUNCTION public.training_games_fill_club_id();

CREATE OR REPLACE FUNCTION public.training_game_players_fill_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  SELECT club_id INTO NEW.club_id FROM public.training_games WHERE id = NEW.game_id;
  IF NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'game_id % introuvable.', NEW.game_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS training_game_players_fill_club_id_trg ON public.training_game_players;
CREATE TRIGGER training_game_players_fill_club_id_trg
  BEFORE INSERT ON public.training_game_players
  FOR EACH ROW EXECUTE FUNCTION public.training_game_players_fill_club_id();

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Privilèges de table
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.training_squads FROM PUBLIC;
REVOKE ALL ON TABLE public.training_squads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_squads TO authenticated;

REVOKE ALL ON TABLE public.training_games FROM PUBLIC;
REVOKE ALL ON TABLE public.training_games FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_games TO authenticated;

REVOKE ALL ON TABLE public.training_game_players FROM PUBLIC;
REVOKE ALL ON TABLE public.training_game_players FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.training_game_players TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. RLS — lecture has_club_access, écriture has_club_write_access. club_id
-- étant dérivé par trigger (§2), WITH CHECK sur club_id porte uniquement sur
-- l'accès écriture de l'utilisateur, pas sur la cohérence training/club (déjà
-- garantie par le trigger, qui tourne avant l'évaluation de la policy).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_squads_select ON public.training_squads FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));
CREATE POLICY training_squads_insert ON public.training_squads FOR INSERT TO authenticated
  WITH CHECK (public.has_club_write_access((SELECT club_id FROM public.trainings WHERE id = training_id)));
CREATE POLICY training_squads_update ON public.training_squads FOR UPDATE TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));
CREATE POLICY training_squads_delete ON public.training_squads FOR DELETE TO authenticated
  USING (public.has_club_write_access(club_id));

ALTER TABLE public.training_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_games_select ON public.training_games FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));
CREATE POLICY training_games_insert ON public.training_games FOR INSERT TO authenticated
  WITH CHECK (public.has_club_write_access((SELECT club_id FROM public.trainings WHERE id = training_id)));
CREATE POLICY training_games_update ON public.training_games FOR UPDATE TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));
CREATE POLICY training_games_delete ON public.training_games FOR DELETE TO authenticated
  USING (public.has_club_write_access(club_id));

ALTER TABLE public.training_game_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_game_players_select ON public.training_game_players FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));
CREATE POLICY training_game_players_insert ON public.training_game_players FOR INSERT TO authenticated
  WITH CHECK (public.has_club_write_access((SELECT club_id FROM public.training_games WHERE id = game_id)));
CREATE POLICY training_game_players_delete ON public.training_game_players FOR DELETE TO authenticated
  USING (public.has_club_write_access(club_id));

-- Note : la garde §15 de 20260803100000 échoue toute migration qui laisse une
-- fonction DEFINER exécutable par PUBLIC. Les trois triggers ci-dessus sont
-- des fonctions trigger (pas des RPC appelables directement) mais héritent du
-- même défaut PUBLIC — REVOKE explicite par prudence, même si non requis pour
-- une fonction trigger (jamais appelée via /rest/v1/rpc/).
REVOKE ALL ON FUNCTION public.training_squads_fill_club_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.training_games_fill_club_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.training_game_players_fill_club_id() FROM PUBLIC;

COMMIT;
```

- [ ] **Step 3: Faire appliquer par Robin**

Dire à Robin de copier le fichier dans le SQL Editor du dashboard Supabase, encadré par le `BEGIN;`/`COMMIT;` déjà présent dans le fichier (ne pas les dupliquer — ils y sont déjà).

- [ ] **Step 4: Vérifier après application**

```bash
JARVIS="/Users/robinlacroix/Library/Mobile Documents/com~apple~CloudDocs/Documents/Claude/Projects/Jarvis"
set -a && source "$JARVIS/.env" && set +a
psql "$FUTSALHUB_AUDIT_DB_URL" -Atc "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('training_squads','training_games','training_game_players');"
```
Expected: les 3 noms de table.

- [ ] **Step 5: Committer**

```bash
git add supabase/migrations/20260923150000_mode_seance_live.sql
git commit -m "feat(db): tables training_squads/training_games/training_game_players — mode séance live"
```

---

## Task 2: Service mobile `trainingGames.ts`

**Files:**
- Create: `mobile/lib/services/trainingGames.ts`

**Interfaces:**
- Consumes: `supabase` (`mobile/lib/supabase.ts`).
- Produces: types `TrainingSquad`, `TrainingGame`, `TrainingGamePlayer`, `TimerMode`, et les fonctions ci-dessous — consommées par Task 4 (écran Plateaux), Task 7 (écran Jeu), Task 8 (récap).

- [ ] **Step 1: Écrire le service**

```ts
import { supabase } from '../supabase';

export type TimerMode = 'continu' | 'series';

export interface TrainingSquad {
  id: string;
  training_id: string;
  club_id: string;
  label: string;
  color_token: string;
  sort_order: number;
  created_at: string;
}

export interface TrainingGame {
  id: string;
  training_id: string;
  club_id: string;
  sequence: number;
  part_index: number | null;
  procedure_id: string | null;
  label: string | null;
  score_unit_label: string | null;
  home_squad_id: string;
  away_squad_id: string;
  score_home: number;
  score_away: number;
  timer_mode: TimerMode;
  series_count: number | null;
  series_duration_seconds: number | null;
  rest_duration_seconds: number | null;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface TrainingGamePlayer {
  game_id: string;
  player_id: string;
  squad_id: string;
  club_id: string;
}

/** Plateaux d'une séance, dans l'ordre d'affichage. */
export async function getSquadsForTraining(trainingId: string): Promise<TrainingSquad[]> {
  const { data, error } = await supabase
    .from('training_squads')
    .select('*')
    .eq('training_id', trainingId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Remplace l'ensemble des plateaux d'une séance : supprime ceux retirés,
 * met à jour ceux qui existent, insère les nouveaux. `club_id` n'est jamais
 * envoyé — dérivé par trigger depuis `training_id` (voir migration).
 */
export async function saveSquadsForTraining(
  trainingId: string,
  squads: { id?: string; label: string; color_token: string; sort_order: number }[],
): Promise<TrainingSquad[]> {
  const existing = await getSquadsForTraining(trainingId);
  const keepIds = new Set(squads.filter((s) => s.id).map((s) => s.id as string));
  const toDelete = existing.filter((s) => !keepIds.has(s.id));

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('training_squads')
      .delete()
      .in('id', toDelete.map((s) => s.id));
    if (error) throw error;
  }

  const toUpdate = squads.filter((s) => s.id);
  for (const s of toUpdate) {
    const { error } = await supabase
      .from('training_squads')
      .update({ label: s.label, color_token: s.color_token, sort_order: s.sort_order })
      .eq('id', s.id as string);
    if (error) throw error;
  }

  const toInsert = squads.filter((s) => !s.id);
  if (toInsert.length > 0) {
    const { error } = await supabase.from('training_squads').insert(
      toInsert.map((s) => ({ training_id: trainingId, label: s.label, color_token: s.color_token, sort_order: s.sort_order })),
    );
    if (error) throw error;
  }

  return getSquadsForTraining(trainingId);
}

/** Tous les jeux d'une séance, dans l'ordre de jeu — utilisé par le récap (Task 8). */
export async function getGamesForTraining(trainingId: string): Promise<TrainingGame[]> {
  const { data, error } = await supabase
    .from('training_games')
    .select('*')
    .eq('training_id', trainingId)
    .order('sequence', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Le jeu non clos le plus récent d'une séance, s'il y en a un — propose la reprise. */
export async function getOpenGameForTraining(trainingId: string): Promise<TrainingGame | null> {
  const { data, error } = await supabase
    .from('training_games')
    .select('*')
    .eq('training_id', trainingId)
    .is('ended_at', null)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getGamePlayers(gameId: string): Promise<TrainingGamePlayer[]> {
  const { data, error } = await supabase.from('training_game_players').select('*').eq('game_id', gameId);
  if (error) throw error;
  return data ?? [];
}

export interface StartGameInput {
  trainingId: string;
  homeSquadId: string;
  awaySquadId: string;
  timerMode: TimerMode;
  seriesCount?: number;
  seriesDurationSeconds?: number;
  restDurationSeconds?: number;
  procedureId?: string | null;
  label?: string | null;
  scoreUnitLabel?: string | null;
  /** joueur → plateau, au moment du lancement — figé pour ce jeu (voir migration §1). */
  composition: { playerId: string; squadId: string }[];
}

/** Crée le jeu suivant (sequence = max+1) et fige la composition courante. */
export async function startTrainingGame(input: StartGameInput): Promise<TrainingGame> {
  const existing = await getGamesForTraining(input.trainingId);
  const nextSequence = existing.reduce((max, g) => Math.max(max, g.sequence), 0) + 1;

  const { data: game, error } = await supabase
    .from('training_games')
    .insert({
      training_id: input.trainingId,
      sequence: nextSequence,
      procedure_id: input.procedureId ?? null,
      label: input.label ?? null,
      score_unit_label: input.scoreUnitLabel ?? null,
      home_squad_id: input.homeSquadId,
      away_squad_id: input.awaySquadId,
      timer_mode: input.timerMode,
      series_count: input.timerMode === 'series' ? input.seriesCount : null,
      series_duration_seconds: input.timerMode === 'series' ? input.seriesDurationSeconds : null,
      rest_duration_seconds: input.timerMode === 'series' ? input.restDurationSeconds : null,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  if (input.composition.length > 0) {
    const { error: playersError } = await supabase.from('training_game_players').insert(
      input.composition.map((c) => ({ game_id: game.id, player_id: c.playerId, squad_id: c.squadId })),
    );
    if (playersError) throw playersError;
  }

  return game;
}

/** Upsert du score courant — appelée à chaque +1/annulation, et par l'outbox offline (Task 7). */
export async function updateTrainingGameScore(gameId: string, scoreHome: number, scoreAway: number): Promise<void> {
  const { error } = await supabase
    .from('training_games')
    .update({ score_home: scoreHome, score_away: scoreAway })
    .eq('id', gameId);
  if (error) throw error;
}

export async function endTrainingGame(gameId: string, durationSeconds: number): Promise<void> {
  const { error } = await supabase
    .from('training_games')
    .update({ ended_at: new Date().toISOString(), duration_seconds: durationSeconds })
    .eq('id', gameId);
  if (error) throw error;
}
```

- [ ] **Step 2: Vérifier et committer**

```bash
cd mobile && npx tsc --noEmit -p tsconfig.json
git add mobile/lib/services/trainingGames.ts
git commit -m "feat(mobile): service trainingGames (plateaux, jeux, score) — mode séance live"
```

---

## Task 3: Stockage local de la session live (snapshot crash-safe)

**Files:**
- Create: `mobile/lib/liveSession/liveSessionStorage.ts`

**Interfaces:**
- Produces: `LiveSessionSnapshot`, `readLiveSessionSnapshot`, `writeLiveSessionSnapshot`, `clearLiveSessionSnapshot` — consommés par Task 4 (écran Plateaux, pour faire voyager la composition courante vers l'écran Jeu sans Context partagé entre deux routes Expo Router) et Task 7 (snapshot 5s, reprise après crash).

- [ ] **Step 1: Écrire le stockage**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TimerMode } from '../services/trainingGames';

const KEY_PREFIX = '@futsalhub_live_session_v1_';

/**
 * État complet d'une session live en cours, un training à la fois. Sert deux
 * besoins avec un seul mécanisme : faire voyager la composition des plateaux
 * de l'écran Plateaux vers l'écran Jeu (deux routes Expo Router distinctes,
 * pas de Context partagé entre elles), et le snapshot crash-safe 5s pendant
 * un jeu (design doc §6).
 */
export interface LiveSessionSnapshot {
  trainingId: string;
  squads: { id: string; label: string; color_token: string }[];
  /** playerId -> squadId ; absent = non assigné (banc, ou gardien non affecté). */
  composition: Record<string, string>;
  activeGameId: string | null;
  timerMode: TimerMode | null;
  /** Dernier réglage séries utilisé — proposé par défaut au prochain lancement. */
  lastSeriesConfig: { seriesCount: number; seriesDurationSeconds: number; restDurationSeconds: number } | null;
  /** Timestamp epoch ms du début de la phase courante (série ou repos) — recalculé au retour au premier plan, jamais décrémenté. */
  phaseStartedAtMs: number | null;
  phaseKind: 'serie' | 'repos' | null;
  currentSeriesIndex: number | null;
  scoreHome: number;
  scoreAway: number;
  updatedAtMs: number;
}

export async function readLiveSessionSnapshot(trainingId: string): Promise<LiveSessionSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + trainingId);
    return raw ? (JSON.parse(raw) as LiveSessionSnapshot) : null;
  } catch {
    return null;
  }
}

export async function writeLiveSessionSnapshot(snapshot: LiveSessionSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + snapshot.trainingId, JSON.stringify({ ...snapshot, updatedAtMs: Date.now() }));
  } catch {
    // best-effort — un échec d'écriture locale ne doit jamais bloquer la saisie du coach.
  }
}

export async function clearLiveSessionSnapshot(trainingId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + trainingId);
  } catch {
    // idem
  }
}
```

- [ ] **Step 2: Vérifier et committer**

```bash
cd mobile && npx tsc --noEmit -p tsconfig.json
git add mobile/lib/liveSession/liveSessionStorage.ts
git commit -m "feat(mobile): snapshot local de la session live (crash-safe, pont entre écrans)"
```

---

## Task 4: File d'attente offline pour le score

**Files:**
- Create: `mobile/lib/offline/trainingGameOutbox.ts`

**Interfaces:**
- Consumes: `updateTrainingGameScore` (Task 2), `isDeviceOffline`/`shouldTreatAsOfflineError` (`mobile/lib/offline/networkReachability.ts`, existant).
- Produces: `enqueueTrainingGameScoreUpdate`, `flushTrainingGameOutbox` — consommés par Task 7.

- [ ] **Step 1: Écrire l'outbox**

Fichier dédié plutôt qu'extension de `matchRecorderOutbox.ts` : forme différente (un seul type d'opération — upsert de score, pas de log d'événements insert/delete, cf. design doc §2 "pas de ventilation par unité") et domaine différent, pas de raison de coupler les deux.

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateTrainingGameScore } from '../services/trainingGames';
import { isDeviceOffline, shouldTreatAsOfflineError } from './networkReachability';

const STORAGE_KEY = '@futsalhub_training_game_outbox_v1';

/** Une seule opération par jeu en file à la fois : la plus récente écrase la précédente (dernier score gagne), pas la peine de rejouer un historique de taps. */
type OutboxMap = Record<string, { scoreHome: number; scoreAway: number }>;

async function readOutbox(): Promise<OutboxMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxMap) : {};
  } catch {
    return {};
  }
}

async function writeOutbox(map: OutboxMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

let flushing = false;

/** Met à jour la file locale (remplace toute entrée en attente pour ce jeu) puis tente un flush en tâche de fond. */
export async function enqueueTrainingGameScoreUpdate(gameId: string, scoreHome: number, scoreAway: number): Promise<void> {
  const map = await readOutbox();
  map[gameId] = { scoreHome, scoreAway };
  await writeOutbox(map);
  void flushTrainingGameOutbox();
}

/** Rejoue la file — no-op si hors ligne ou déjà en cours. Un score par jeu, donc pas d'ordre à préserver entre jeux différents. */
export async function flushTrainingGameOutbox(): Promise<void> {
  if (flushing) return;
  if (await isDeviceOffline()) return;
  flushing = true;
  try {
    const map = await readOutbox();
    const entries = Object.entries(map);
    for (const [gameId, { scoreHome, scoreAway }] of entries) {
      try {
        await updateTrainingGameScore(gameId, scoreHome, scoreAway);
        const current = await readOutbox();
        if (current[gameId]?.scoreHome === scoreHome && current[gameId]?.scoreAway === scoreAway) {
          delete current[gameId];
          await writeOutbox(current);
        }
      } catch (err) {
        if (shouldTreatAsOfflineError(err)) return; // réessaiera au prochain enqueue/flush
        // erreur non liée au réseau (ex: jeu supprimé) — on abandonne cette entrée pour ne pas bloquer les autres.
        const current = await readOutbox();
        delete current[gameId];
        await writeOutbox(current);
      }
    }
  } finally {
    flushing = false;
  }
}
```

- [ ] **Step 2: Vérifier et committer**

```bash
cd mobile && npx tsc --noEmit -p tsconfig.json
git add mobile/lib/offline/trainingGameOutbox.ts
git commit -m "feat(mobile): file offline pour le score des jeux de séance live"
```

---

## Task 5: Écran Plateaux — composition par tap-to-cycle

**Files:**
- Create: `mobile/app/(tabs)/calendar/training/squads/[trainingId].tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` (enregistrement de la route)
- Modify: `mobile/lib/navigation.ts` — **ne pas toucher** (écran training-detail-only, hors `SECONDARY_DESTINATIONS`, confirmé par exploration).

**Interfaces:**
- Consumes: `getSquadsForTraining`/`saveSquadsForTraining` (Task 2), `readLiveSessionSnapshot`/`writeLiveSessionSnapshot` (Task 3), `POSITIONS`/`positionMeta` (`mobile/components/players/positions.ts`, existant), `ATTENDANCE_STATUSES` non requis ici (le filtre présent/en retard se fait sur `training.attendance` déjà chargé).
- Produces: écran routable `calendar/training/squads/[trainingId]`, navigue vers `calendar/training/live/[trainingId]` (Task 7).

- [ ] **Step 1: Enregistrer la route (hidden, routable depuis le détail training)**

Dans `mobile/app/(tabs)/_layout.tsx`, ajouter `'calendar/training/squads/[trainingId]'` à `HIDDEN_ROUTES` (même liste que `'calendar/training/edit/[trainingId]'`) et, dans `HIDDEN_ROUTE_TITLES`, `'calendar/training/squads/[trainingId]': 'Plateaux'`.

- [ ] **Step 2: Écrire l'écran**

Charge le training (déjà un pattern existant dans `training/[trainingId].tsx` — réutiliser la même fonction de chargement, `getTrainingById` ou équivalent déjà utilisé par cet écran) pour obtenir `attendance`/`convoked_players`, puis les joueurs de l'équipe (`getPlayersByTeamId` ou équivalent déjà utilisé ailleurs dans le mobile pour cette liste — même source que `training/[trainingId].tsx` utilise pour afficher les présences).

Logique de tap-to-cycle : chaque joueur de champ présent/en retard a un `squadIndex` (0, 1, 2... ou `null` = non assigné) dans l'état local `composition: Record<playerId, string /* squadId */>`. Un tap fait avancer au plateau suivant dans l'ordre des plateaux configurés, en boucle. Les gardiens (`position === 'Gardien'`) ont leur propre cycle indépendant : non-assigné → plateau 1 → ... → non-assigné, jamais inclus dans "Équilibrer".

```tsx
// squelette de la logique d'assignation — à intégrer dans l'écran, pas un fichier séparé (couplage fort à cet écran uniquement)
function cycleAssignment(current: string | undefined, squadIds: string[]): string | undefined {
  if (squadIds.length === 0) return undefined;
  if (!current) return squadIds[0];
  const idx = squadIds.indexOf(current);
  if (idx === -1 || idx === squadIds.length - 1) return undefined; // dernier plateau -> retour "non assigné"
  return squadIds[idx + 1];
}
```

Bouton "Équilibrer" (joueurs de champ uniquement, gardiens jamais touchés) : trie les joueurs de champ éligibles par `PositionKey` (ordre tactique `POSITIONS`), puis les distribue en serpentin (`0,1,2,...,N-1,N-1,...,2,1,0,...`) entre les plateaux pour équilibrer les postes entre équipes plutôt qu'un simple round-robin qui concentrerait un poste sur un seul plateau en fin de liste. Pas de pondération par % de jeux gagnés saison dans cette itération — aucune donnée `training_games` n'existe encore au premier lancement, l'ajouter maintenant serait du code mort ; à ajouter une fois plusieurs séances live jouées (noté en hors-périmètre, design doc §7).

En-tête : nombre de plateaux configurable (stepper 2-6, `Input numeric` ou boutons +/-), un plateau par défaut nommé "Plateau 1"/"Plateau 2"... avec `color_token` = index dans `theme.colors.chartSeries` (`String(i)`).

Bouton "Lancer" en bas (`Button block variant="primary"`) : appelle `saveSquadsForTraining`, écrit le snapshot (`writeLiveSessionSnapshot`) avec `composition` courante, navigue vers `router.push('/(tabs)/calendar/training/live/' + trainingId)`.

Reprise : au montage, si `readLiveSessionSnapshot(trainingId)` renvoie un snapshot avec `composition` non vide, préremplir l'état depuis le snapshot plutôt que de repartir de zéro (le coach peut être revenu en arrière depuis l'écran Jeu).

- [ ] **Step 3: Vérifier et committer**

```bash
cd mobile && npx tsc --noEmit -p tsconfig.json
git add "mobile/app/(tabs)/calendar/training/squads/[trainingId].tsx" "mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(mobile): écran Plateaux — composition d'équipe par tap-to-cycle, mode séance live"
```

---

## Task 6: Alertes sonores — nouvelle dépendance `expo-audio`

**Files:**
- Modify: `mobile/package.json` (nouvelle dépendance)
- Create: `mobile/lib/design/liveSessionSound.ts`

**Interfaces:**
- Produces: `playPhaseTransitionSound(): Promise<void>` — consommé par Task 7 (hook chrono).

- [ ] **Step 1: Installer la dépendance**

```bash
cd mobile && npx expo install expo-audio
```

Expected: ajout de `expo-audio` à `mobile/package.json`, version compatible Expo `~56`. **Premier usage d'audio dans ce repo** (vérifié par grep préalable : aucun `expo-av`/`expo-audio`/`Audio.` existant) — signalé explicitement ici plutôt que noyé dans un commit fonctionnel, pour que Robin le voie passer.

- [ ] **Step 2: Écrire le wrapper son**

Pas de fichier audio à fournir dans ce plan (asset binaire) — utiliser un son système via l'API `expo-audio`, ou à défaut un bip généré. À trancher en implémentation selon ce que l'API `expo-audio` permet simplement sans asset ; si un asset `.mp3`/`.wav` court est nécessaire, le déposer sous `mobile/assets/sounds/phase-transition.mp3` (Robin fournit le fichier, ou une ressource libre de droits courte).

```ts
import { createAudioPlayer } from 'expo-audio';
import { haptics } from './haptics';

let player: ReturnType<typeof createAudioPlayer> | null = null;

function getPlayer() {
  if (!player) {
    player = createAudioPlayer(require('../../assets/sounds/phase-transition.mp3'));
  }
  return player;
}

/** Signal sonore + haptique à chaque bascule série/repos — le coach regarde le terrain, pas l'écran (design doc §4). */
export async function playPhaseTransitionSound(): Promise<void> {
  haptics.success();
  try {
    const p = getPlayer();
    await p.seekTo(0);
    p.play();
  } catch {
    // le retour haptique a déjà eu lieu — un échec de lecture audio (permissions, asset manquant) ne doit pas remonter d'erreur visible au coach en plein jeu.
  }
}
```

- [ ] **Step 3: Vérifier et committer**

```bash
cd mobile && npx tsc --noEmit -p tsconfig.json
git add mobile/package.json mobile/package-lock.json mobile/lib/design/liveSessionSound.ts mobile/assets/sounds
git commit -m "feat(mobile): expo-audio + signal sonore de transition série/repos"
```

---

## Task 7: Hook chrono + Écran Jeu en cours (chrono + score combinés)

**Files:**
- Create: `mobile/hooks/useLiveGameTimer.ts`
- Create: `mobile/app/(tabs)/calendar/training/live/[trainingId].tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` (enregistrement de la route)

**Interfaces:**
- Consumes: `startTrainingGame`/`endTrainingGame`/`getOpenGameForTraining` (Task 2), `enqueueTrainingGameScoreUpdate` (Task 4), `readLiveSessionSnapshot`/`writeLiveSessionSnapshot`/`clearLiveSessionSnapshot` (Task 3), `playPhaseTransitionSound` (Task 6), `haptics` (`mobile/lib/design/haptics.ts`, existant).
- Produces: écran routable `calendar/training/live/[trainingId]`.

- [ ] **Step 1: Hook `useLiveGameTimer`**

Reprend le patron `AppState` de `mobile/components/recorder/useMatchRecorder.ts:584-598` (recalcul depuis un timestamp de référence, jamais un décompte `setInterval` naïf — un chrono qui perd le temps passé en arrière-plan est le bug déjà rencontré sur les recorders).

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { playPhaseTransitionSound } from '../lib/design/liveSessionSound';

export interface SeriesConfig {
  seriesCount: number;
  seriesDurationSeconds: number;
  restDurationSeconds: number;
}

export type TimerPhaseKind = 'serie' | 'repos';

export interface LiveGameTimerState {
  mode: 'continu' | 'series';
  /** secondes écoulées depuis le début du jeu (mode continu) ou de la série courante (mode séries). */
  elapsedSeconds: number;
  /** mode séries uniquement */
  currentSeriesIndex: number | null;
  phaseKind: TimerPhaseKind | null;
  phaseRemainingSeconds: number | null;
  isFinished: boolean;
}

/**
 * Chrono d'un jeu, continu ou à séries/repos. `phaseStartedAtMs` est la seule
 * source de vérité temporelle — recalculé à chaque tick ET à chaque retour au
 * premier plan de l'app, jamais décrémenté. `onPhaseTransition` déclenche le
 * signal sonore/haptique (Task 6) — appelé une seule fois par bascule, pas à
 * chaque tick.
 */
export function useLiveGameTimer(params: {
  mode: 'continu' | 'series';
  seriesConfig: SeriesConfig | null;
  gameStartedAtMs: number;
  /** restauré depuis le snapshot (Task 3) en cas de reprise — sinon calculé au montage. */
  initialPhaseStartedAtMs?: number;
  initialPhaseKind?: TimerPhaseKind;
  initialSeriesIndex?: number;
  onPhaseChange?: (phaseStartedAtMs: number, phaseKind: TimerPhaseKind, seriesIndex: number | null) => void;
}): LiveGameTimerState {
  const { mode, seriesConfig, gameStartedAtMs, onPhaseChange } = params;

  const phaseStartedAtMsRef = useRef(params.initialPhaseStartedAtMs ?? gameStartedAtMs);
  const phaseKindRef = useRef<TimerPhaseKind>(params.initialPhaseKind ?? 'serie');
  const seriesIndexRef = useRef<number>(params.initialSeriesIndex ?? 0);

  const [state, setState] = useState<LiveGameTimerState>(() => computeState());

  function computeState(): LiveGameTimerState {
    if (mode === 'continu') {
      const elapsedSeconds = Math.floor((Date.now() - gameStartedAtMs) / 1000);
      return { mode, elapsedSeconds, currentSeriesIndex: null, phaseKind: null, phaseRemainingSeconds: null, isFinished: false };
    }

    if (!seriesConfig) {
      return { mode, elapsedSeconds: 0, currentSeriesIndex: 0, phaseKind: 'serie', phaseRemainingSeconds: 0, isFinished: false };
    }

    const phaseDuration = phaseKindRef.current === 'serie' ? seriesConfig.seriesDurationSeconds : seriesConfig.restDurationSeconds;
    const phaseElapsed = Math.floor((Date.now() - phaseStartedAtMsRef.current) / 1000);
    let remaining = phaseDuration - phaseElapsed;

    // Avale toutes les bascules manquées (app restée en arrière-plan plusieurs phases) en une seule passe, en notifiant chaque transition franchie.
    while (remaining <= 0) {
      const isLastSeries = seriesIndexRef.current >= seriesConfig.seriesCount - 1;
      if (phaseKindRef.current === 'serie' && isLastSeries) {
        return { mode, elapsedSeconds: 0, currentSeriesIndex: seriesIndexRef.current, phaseKind: 'serie', phaseRemainingSeconds: 0, isFinished: true };
      }
      const overshoot = -remaining;
      if (phaseKindRef.current === 'serie') {
        phaseKindRef.current = 'repos';
      } else {
        phaseKindRef.current = 'serie';
        seriesIndexRef.current += 1;
      }
      phaseStartedAtMsRef.current = Date.now() - overshoot * 1000;
      onPhaseChange?.(phaseStartedAtMsRef.current, phaseKindRef.current, seriesIndexRef.current);
      void playPhaseTransitionSound();

      const nextDuration = phaseKindRef.current === 'serie' ? seriesConfig.seriesDurationSeconds : seriesConfig.restDurationSeconds;
      remaining = nextDuration - overshoot;
    }

    return {
      mode,
      elapsedSeconds: phaseElapsed,
      currentSeriesIndex: seriesIndexRef.current,
      phaseKind: phaseKindRef.current,
      phaseRemainingSeconds: remaining,
      isFinished: false,
    };
  }

  const tick = useCallback(() => setState(computeState()), [mode, seriesConfig]);

  useEffect(() => {
    tick();
    const interval = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, seriesConfig]);

  return state;
}
```

- [ ] **Step 2: Écrire l'écran Jeu**

Trois sous-états dans un seul écran (pas de sous-navigation) : **Configuration** (choix continu/séries, réglages) → **Jeu en cours** (deux aplats plein cadran) → **Jeu suivant** (garder/rebrasser). Charge le snapshot écrit par l'écran Plateaux (Task 5) au montage ; si absent (accès direct sans passer par Plateaux), redirige vers l'écran Plateaux.

```tsx
// Extrait — la partie "deux aplats plein cadran" de l'état Jeu en cours, le
// cœur ergonomique de l'écran (design doc §4 : "lisible à cinq mètres").
// Le reste de l'écran (config, header, écran Jeu suivant) suit les mêmes
// primitives (Button/Card/Text) déjà utilisées partout ailleurs dans le mobile.

function GameFace({
  squadLabel,
  colorToken,
  score,
  onScore,
  onUndo,
}: {
  squadLabel: string;
  colorToken: string;
  score: number;
  onScore: () => void;
  onUndo: () => void;
}) {
  const { theme } = useTheme();
  const bg = theme.colors.chartSeries[Number(colorToken) % theme.colors.chartSeries.length];

  return (
    <Pressable
      onPress={() => {
        haptics.success();
        onScore();
      }}
      accessibilityRole="button"
      accessibilityLabel={`+1 ${squadLabel}`}
      style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text variant="display" tone="onFill" weight="700">{squadLabel}</Text>
      <Text variant="hero" tone="onFill" numeric weight="700">{score}</Text>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onUndo();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Annuler le point ${squadLabel}`}
        hitSlop={16}
        style={{ marginTop: theme.space.lg, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.sm, borderRadius: theme.radius.pill, backgroundColor: 'rgba(0,0,0,0.25)' }}
      >
        <Text variant="callout" tone="onFill">Annuler le point {squadLabel}</Text>
      </Pressable>
    </Pressable>
  );
}
```

Le score reste actif pendant `phaseKind === 'repos'` (décision explicite, design doc §1 point 4) — `onScore` n'est jamais désactivé selon la phase.

À chaque tap : mise à jour immédiate de l'état local (retour haptique instantané), `enqueueTrainingGameScoreUpdate(gameId, newScoreHome, newScoreAway)` (réseau débattu par l'outbox, jamais bloquant), et `writeLiveSessionSnapshot` avec le nouveau score (persistance 5s — un `useEffect` avec `setInterval(5000)` sur l'état courant suffit, pas besoin d'écrire à chaque tap en plus de l'outbox).

Fin de jeu (bouton "Terminer le jeu" en mode continu, ou `isFinished` du hook en mode séries) : `endTrainingGame`, transition vers l'état "Jeu suivant" (garder la composition ou revenir à l'écran Plateaux pour rebrasser), `clearLiveSessionSnapshot` seulement si le coach choisit de terminer la séance plutôt que d'enchaîner un jeu.

Suggestion de mode par défaut : si le training est rattaché à une séance (`training.session_id`) et qu'un bloc de cette séance a un `procedureId` correspondant au jeu en cours de configuration (pas de lien direct automatique dans cette itération — l'coach choisit le procédé manuellement s'il veut ce lien, via le même `ProcedurePickerSheet` que l'assembleur), présélectionner Séries pour `Analytique`/`Situation` et Continu pour `JeuOriente`/`MatchLibre`. Pure présélection, jamais imposée.

- [ ] **Step 3: Enregistrer la route**

Dans `mobile/app/(tabs)/_layout.tsx` : `'calendar/training/live/[trainingId]'` dans `HIDDEN_ROUTES`, `'calendar/training/live/[trainingId]': 'Séance live'` dans `HIDDEN_ROUTE_TITLES`.

- [ ] **Step 4: Vérifier et committer**

```bash
cd mobile && npx tsc --noEmit -p tsconfig.json
git add mobile/hooks/useLiveGameTimer.ts "mobile/app/(tabs)/calendar/training/live/[trainingId].tsx" "mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(mobile): hook chrono continu/séries + écran Jeu en cours, mode séance live"
```

---

## Task 8: Écran Récap de fin de séance

**Files:**
- Create: `mobile/app/(tabs)/calendar/training/recap/[trainingId].tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` (enregistrement de la route)

**Interfaces:**
- Consumes: `getGamesForTraining`, `getSquadsForTraining` (Task 2).

- [ ] **Step 1: Écran en lecture seule**

Liste des jeux joués (label, score, plateaux), cumul par plateau sur la séance (somme `score_home`/`score_away` groupée par `squad_id`, calculée côté client — pas de vue SQL pour ce volume de lignes par séance). Pas de classement joueur individuel dans cette itération (nécessiterait l'agrégat saison, hors périmètre — design doc §7) : le classement du jour reste au niveau plateau, pas joueur, pour cette première version. Accessible en un tap depuis le bouton "Terminer la séance" de l'écran Jeu (Task 7).

- [ ] **Step 2: Enregistrer la route et vérifier**

`'calendar/training/recap/[trainingId]'` dans `HIDDEN_ROUTES`/`HIDDEN_ROUTE_TITLES` ('Récap de séance').

```bash
cd mobile && npx tsc --noEmit -p tsconfig.json
git add "mobile/app/(tabs)/calendar/training/recap/[trainingId].tsx" "mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(mobile): écran récap de fin de séance, mode séance live"
```

---

## Task 9: Point d'entrée depuis le détail de l'entraînement

**Files:**
- Modify: `mobile/app/(tabs)/calendar/training/[trainingId].tsx`

**Interfaces:**
- Consumes: `getOpenGameForTraining` (Task 2) pour proposer la reprise.

- [ ] **Step 1: Ajouter le bouton "Mode Live"**

Juste après le bouton "Partager la convocation" (ligne ~488), dans le même `Card` d'en-tête :

```tsx
{counts.present + counts.late > 0 ? (
  <Button
    label="Mode Live"
    icon="flash-outline"
    variant="secondary"
    block
    onPress={() => router.push(`/(tabs)/calendar/training/squads/${trainingId}` as never)}
  />
) : null}
```

Garde sur `counts.present + counts.late > 0` (même style de garde que `counts.convoked > 0` déjà utilisé sur "Partager la convocation" juste au-dessus) — inutile de proposer le mode live sans joueur disponible pour composer une équipe.

- [ ] **Step 2: Vérifier et committer**

```bash
cd mobile && npx tsc --noEmit -p tsconfig.json
git add "mobile/app/(tabs)/calendar/training/[trainingId].tsx"
git commit -m "feat(mobile): point d'entrée Mode Live depuis le détail de l'entraînement"
```

---

## Task 10: Vérification manuelle simulateur

- [ ] **Step 1: Scénario complet**

Lancer l'app sur simulateur iOS (`npx expo run:ios` ou équivalent déjà en place dans ce repo), ouvrir un entraînement avec au moins 8 présents dont 1 gardien :
1. Tap "Mode Live" → écran Plateaux, composer 2 plateaux de 4 par tap, laisser le gardien non assigné, vérifier "Équilibrer".
2. Lancer un jeu en mode Séries (3 séries de 20s, 10s de repos) : vérifier le décompte, la bascule sonore/haptique à chaque transition, et que le tap `+1` fonctionne aussi pendant le repos.
3. Mettre l'app en arrière-plan 40s pendant une série, revenir au premier plan : vérifier que le chrono a bien avancé (pas de saut ni de blocage) et qu'aucune transition n'a été perdue.
4. Forcer la fermeture de l'app pendant un jeu, rouvrir, ouvrir à nouveau le même entraînement : vérifier la proposition de reprise (`getOpenGameForTraining`) et que le score n'a pas été perdu.
5. Terminer le jeu, choisir "Rebrasser", lancer un second jeu avec une composition différente, terminer, ouvrir le récap : vérifier le cumul par plateau.
6. Couper le réseau (mode avion), taper plusieurs points, réactiver le réseau : vérifier que `flushTrainingGameOutbox` synchronise le score final en base (vérifiable par `psql` en lecture, `claude_audit`... — le rôle n'a pas accès table métier, demander confirmation visuelle à Robin ou vérifier via l'app web si un écran de lecture des séances existe, sinon relire via un second appareil).

- [ ] **Step 2: Rapport**

Documenter tout écart au comportement attendu directement en session avant de considérer la tâche terminée — pas de fichier de rapport séparé, ce plan sert de trace.
