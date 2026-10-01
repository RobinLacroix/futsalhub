# Mobile — Mode Séance Live (chrono + équipes + score)

**Date :** 2026-09-23
**Origine :** demande de Robin — mode live pour coachs, accessible depuis un événement, avec chrono configurable (séries/repos), composition d'équipes à partir des joueurs présents, suivi de score par procédé et sur l'ensemble de la séance.
**Statut :** cadrage avant code, à valider avec Robin.

---

## 1. Ce qui existe déjà — LOT C, jamais implémenté

Cette feature a déjà été spécifiée dans [`SPEC_FEATURES_BETA_2026-08.md`](../../../../SPEC_FEATURES_BETA_2026-08.md) §5 "LOT C — Performance en séance", arbitrée par Robin le 13/08/2026. Vérifié : **aucune trace dans `mobile/` ni `supabase/migrations/`** (`grep -rl "training_squads\|training_games"` ne retourne rien) — rien n'a été construit.

Le présent document **étend LOT C**, il ne le remplace pas. Décisions héritées et non renégociées ici :

- Composition d'équipe **figée par jeu**, pas par séance (le rebrassage entre jeux est le cœur de la manipulation des supériorités numériques).
- Le score est **deux entiers bruts par jeu**, jamais ventilé par unité de score, jamais d'attribution de buteur.
- Agrégat saison de référence = **% de jeux gagnés**, jamais le différentiel brut cumulé (une récupération et un but ne s'additionnent pas).
- Classement joueur visible (réglage club `show_training_ranking_to_players`, défaut activé), seuil d'entrée **20 jeux sur la saison**, brassage obligatoire côté coach pour que le classement reste défendable.
- `color_token` sur les plateaux (pas un hex) — le repo a déjà quatre tables de couleurs divergentes, ne pas en créer une cinquième.
- Persistance `AsyncStorage` locale, offline-first, pattern du match recorder.

Décisions prises dans ce document, qui divergent de ou complètent LOT C :

1. **Composition par tap-to-cycle**, pas de drag & drop (confirmé — LOT C l'avait déjà écarté pour la vitesse pitchside, décision reconduite après discussion).
2. **Gardiens dans un pool séparé**, assignation manuelle, ignorés par "Équilibrer" (non traité par LOT C).
3. **Chrono à deux modes** — Continu (identique à LOT C) et Séries (nouveau : nb de séries, durée de série, durée de repos).
4. **Score actif pendant le repos** (décision explicite de Robin — le tap +1 reste disponible même pendant le décompte de repos, contrairement à l'hypothèse initiale de le désactiver).

---

## 2. Modèle de données — delta sur LOT C

Les trois tables de LOT C (`training_squads`, `training_games`, `training_game_players`, cf. §5.3 du spec d'août) sont construites telles quelles. Delta pour le chrono à séries :

```sql
alter table training_games add column timer_mode text not null default 'continu'
  check (timer_mode in ('continu', 'series'));
alter table training_games add column series_count smallint;
alter table training_games add column series_duration_seconds integer;
alter table training_games add column rest_duration_seconds integer;

alter table training_games add constraint training_games_series_config_check check (
  (timer_mode = 'continu' and series_count is null and series_duration_seconds is null and rest_duration_seconds is null)
  or
  (timer_mode = 'series' and series_count > 0 and series_duration_seconds > 0 and rest_duration_seconds >= 0)
);
```

**Pas de nouvelle table, pas de score par série.** Le score reste un cumul unique pour tout le jeu (toutes séries confondues) — ventiler par série serait revenir sur l'arbitrage du 13/08 qui interdit la ventilation par unité de score (§5.2 du spec d'août). Si un besoin de comparaison "série 1 vs série 3" émerge plus tard, il se traite en ajoutant une table d'historique de points horodatés, pas en complexifiant `training_games`.

**L'état runtime du chrono (série en cours, secondes restantes, phase repos/série) est éphémère, côté client uniquement** — pas de colonne DB pour ça. Seuls `duration_seconds`, `started_at`, `ended_at` sont écrits en base, à la fin du jeu (ou périodiquement, voir §7). C'est le même principe que `MatchRecorderContext` : l'état vivant du chrono vit en mémoire + `AsyncStorage`, jamais en base tant que le jeu tourne.

Migration à créer sous `supabase/migrations/`, nommage `YYYYMMDDHHMMSS_mode_seance_live.sql`, vérifier qu'aucun fichier existant ne partage le timestamp avant de committer (règle CLAUDE.md). Contient à la fois les 3 tables de LOT C (jamais créées) et ce delta — un seul fichier, puisque rien n'existe encore.

---

## 3. Sécurité — RPC

Toute écriture passe par des RPC `SECURITY DEFINER`, jamais un `supabase.from()` direct depuis un écran (pattern Batch 2, CLAUDE.md). RPC à créer, toutes avec `REVOKE ALL ... FROM PUBLIC` explicite et garde d'accès sur `p_training_id` via `has_team_write_access` (résolu depuis `trainings.team_id`) :

- `save_training_squads(p_training_id, p_squads jsonb)` — remplace l'ensemble des plateaux d'une séance (upsert + suppression de ceux retirés).
- `start_training_game(p_training_id, p_home_squad_id, p_away_squad_id, p_timer_mode, p_series_count, p_series_duration_seconds, p_rest_duration_seconds, p_procedure_id, p_label, p_score_unit_label)` — crée la ligne `training_games`, insère `training_game_players` depuis la composition courante des plateaux.
- `update_training_game_score(p_game_id, p_score_home, p_score_away)` — upsert du score courant, appelée à chaque `+1`/annulation (débattue en local, voir §7 pour la fréquence d'appel réseau).
- `end_training_game(p_game_id, p_duration_seconds)` — pose `ended_at`.

Toutes prennent `p_training_id` ou un id résolvable jusqu'à `training_id` en premier paramètre pour permettre la garde d'accès — jamais un `club_id` fourni par le client sans vérification (règle CLAUDE.md sur la comparaison d'identité NULL-safe et les gardes obligatoires).

Nouveau fichier service mobile : `mobile/lib/services/trainingGames.ts`, miroir des fonctions ci-dessus, signatures typées — c'est la seule couche que les écrans appellent.

---

## 4. Écrans et parcours

**Point d'entrée.** Bouton "Mode Live" dans le header card de `mobile/app/(tabs)/calendar/training/[trainingId].tsx`, juste après le bouton "Partager la convocation" existant (ligne ~480-488), même pattern (`variant="secondary"`, `block`, icône — `"play-circle-outline"` ou `"flash-outline"` à trancher en implémentation). Affiché seulement si au moins un joueur est présent ou en retard (même garde que `counts.convoked > 0` pour la convocation, adaptée à `counts.present + counts.late > 0`).

**Écran 1 — Plateaux** (une fois par séance, rebrassable entre jeux).
- Joueurs éligibles : statut `present` ou `late` (pas `absent`/`injured`) issus de `training.attendance`.
- Pool "Gardiens" séparé du pool "Joueurs de champ", filtré sur `player.position === 'Gardien'` (catalogue `POSITIONS` de `mobile/components/players/positions.ts`).
- Tap sur une pastille de joueur de champ → bascule au plateau suivant dans l'ordre (2 plateaux par défaut, ajout possible). Tap sur une pastille de gardien → bascule entre "non assigné" et les plateaux, indépendamment du cycle des joueurs de champ.
- Bouton "Équilibrer" : répartition auto des joueurs de champ par poste (`PositionKey`) et, quand la donnée existe, par % de jeux gagnés sur la saison — les gardiens non assignés ne sont jamais touchés par ce bouton.

**Écran 2 — Jeu en cours (chrono + score combinés).**
- Avant de lancer : choix du mode, **Continu** ou **Séries**. En mode Séries, saisie nb de séries / durée de série / durée de repos — les trois derniers réglages utilisés sont proposés par défaut (persistés en `AsyncStorage`, pas en base — confort de device, pas une donnée métier).
- Suggestion de mode par défaut selon le bloc de la séance d'où le jeu est lancé, si la séance est rattachée à un `TrainingSessionRecord` et que le jeu correspond à un bloc précis : `Analytique`/`Situation` → suggère Séries ; `JeuOriente`/`MatchLibre` → suggère Continu. Pure suggestion, jamais imposé — le coach change librement.
- Deux aplats plein écran, un par plateau, score en très grand, zone de tap plein cadran pour `+1`. **Le tap reste actif pendant le repos** (décision Robin, §1).
- Transitions série → repos → série suivante automatiques, son + vibration à chaque bascule (le coach regarde le terrain).
- Annulation nommée et toujours visible ("Annuler le point [plateau]"), jamais d'appui long.
- Fin du jeu (dernière série terminée en mode Séries, ou arrêt manuel en mode Continu) → écran "Jeu suivant" : garder les plateaux ou rebrasser, identique à LOT C.

**Écran 3 — Récap de fin de séance.** Inchangé par rapport à LOT C §5.4 : résultats des jeux, cumul des plateaux, classement du jour, lecture seule, un tap depuis le dernier jeu.

**Reprise et saisie a posteriori.** Identiques à LOT C : rouvrir une séance avec des jeux non clos propose de reprendre ; un mode "saisir les résultats" sans chrono permet de noter une séance a posteriori.

---

## 5. Comportement du chrono — détail

- **Mode Continu** : chrono en différence de `Date.now()` (jamais un compteur incrémental — un chrono qui repart de zéro en arrière-plan est le bug déjà rencontré sur les recorders). Arrêt manuel par le coach.
- **Mode Séries** : la phase courante (série `n/N`, repos) et le temps restant sont calculés depuis un timestamp de début de phase (`Date.now()` diff), pas décrémentés en `setInterval` naïf, pour survivre à une mise en arrière-plan de l'app (l'OS peut throttle les timers JS ; recalculer depuis un timestamp de référence à chaque `AppState` "active" est le pattern à reprendre).
- Score : un seul cumul par jeu, incrémenté à tout moment (série ou repos), jamais remis à zéro entre séries.
- Fin de la dernière série : passage automatique à l'écran "Jeu suivant".

---

## 6. Offline et persistance

Reprend le pattern de `mobile/lib/offline/matchRecorderOutbox.ts` (`AsyncStorage`, file d'opérations rejouée au retour réseau, `isDeviceOffline`/`shouldTreatAsOfflineError` de `networkReachability.ts`), simplifié : pas de log d'événements ici (le score n'est pas un flux d'événements, cf. §2), donc pas d'opérations `ins`/`del` à rejouer — une seule opération `upd` par jeu (upsert du score courant + de l'état de fin), avec debounce local (le tap met à jour l'état en mémoire immédiatement pour le retour haptique et l'affichage, l'appel réseau est débattu à ~1-2s ou synchronisé à la fermeture d'écran).

Snapshot `AsyncStorage` de l'état complet (plateaux, jeu en cours, score, phase chrono) toutes les 5s sur mobile et tablette, comme LOT C §5.4 — un plantage forcé pendant un jeu ne doit rien perdre.

---

## 7. Hors périmètre pour cette itération

Identique aux exclusions déjà actées en août (LOT C §5.7), reconduites : attribution du buteur, ventilation des points par unité de score, +/- ajusté par la force des coéquipiers, localisation des points sur le terrain, chrono de temps de jeu individuel par joueur.

Le tracking saison / par période individuelle (mentionné par Robin comme "plus tard") **n'a aucun écran construit dans cette itération**, mais n'est pas bloqué : le modèle de données (une ligne par jeu, horodatée, avec `training_id`) permet nativement d'agréger par saison ou par toute plage de dates arbitraire plus tard, sans migration. C'est le même choix de conception que LOT C §5.3 point 4.

---

## 8. Critères de fin

Reprend LOT C §5.8, complétés pour le chrono à séries :

- [ ] Un point se saisit d'un tap, sans écran intermédiaire, actif en série comme en repos
- [ ] L'écran de saisie (chrono + score) est lisible à cinq mètres
- [ ] Rebrasser les plateaux entre deux jeux ne fausse aucun cumul joueur
- [ ] Le chrono (continu et séries) survit à trois minutes de téléphone en poche / arrière-plan
- [ ] Un plantage forcé de l'app pendant un jeu ne perd rien
- [ ] Les transitions série/repos déclenchent un signal sonore + haptique, sans requérir de regarder l'écran
- [ ] Aucun différentiel n'est cumulé sur la saison, le classement est en % de jeux gagnés
- [ ] Aucun joueur sous 20 jeux n'apparaît au classement
- [ ] Les gardiens n'entrent jamais dans le calcul d'"Équilibrer" sauf assignation manuelle
- [ ] Le récap de fin de séance s'ouvre en un tap depuis le dernier jeu
