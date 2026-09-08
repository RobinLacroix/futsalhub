-- ═════════════════════════════════════════════════════════════════════════════
-- Ajout au catalogue système : FIET (Futsal Intermittent Endurance Test)
--
-- Test d'endurance intermittente spécifique futsal (Barbero-Alvarez et al.
-- 2005 ; Castagna & Barbero 2010) : navettes de 45 m (3 × 15 m) à vitesse
-- progressive imposée par bande sonore, jusqu'à épuisement. Le score officiel
-- du protocole est la distance totale parcourue (m) — c'est elle qui est
-- enregistrée ici, exactement comme `yoyo_ir1` (même famille de test).
--
-- La distance seule ne se compare pas d'un œil à la VIFT (`ift_30_15`,
-- déjà en km/h) : `fietFinalSpeedKmh()` (lib/physicalTests.ts, dupliquée
-- mobile) dérive la vitesse finale à l'affichage, jamais stockée. Voir le
-- docstring de cette fonction pour la formule (départ 9 km/h, paliers de
-- 0.33 km/h sur les 9 premières navettes puis 0.20 km/h ensuite).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO public.physical_test_types
  (club_id, code, label, category, unit, direction, decimals, attempts, aggregation, sort_order, protocol_note)
VALUES
  (NULL, 'fiet', 'FIET (endurance intermittente futsal)', 'endurance', 'm', 'higher_is_better', 0, 1, 'last', 95,
   'Navettes de 45 m (3 × 15 m), 10 s de récupération active entre chaque, 30 s toutes les 8 navettes. Départ à 9 km/h, vitesse imposée par bande sonore. Arrêt à la 2e navette manquée. Noter la distance totale parcourue : la vitesse finale (km/h) s''affiche automatiquement à côté.')
ON CONFLICT (club_id, code) DO NOTHING;

DO $mig$
DECLARE
  v_unit text;
BEGIN
  SELECT unit INTO v_unit FROM public.physical_test_types WHERE club_id IS NULL AND code = 'fiet';

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'Test fiet absent du catalogue systeme apres insertion.';
  END IF;
  IF v_unit <> 'm' THEN
    RAISE EXCEPTION 'Test fiet : unite inattendue (%), attendu m.', v_unit;
  END IF;

  RAISE NOTICE 'OK : test fiet present dans le catalogue systeme, unite m.';
END
$mig$;

COMMIT;
