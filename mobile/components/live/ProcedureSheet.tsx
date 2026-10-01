import { View } from 'react-native';
import { makeStyles } from '../../contexts/ThemeContext';
import { formatClock } from '../../lib/liveSession/levels';
import type { SeriesConfig } from '../../hooks/useLiveGameTimer';
import type { TrainingProcedureRecord } from '../../lib/services/trainingProceduresService';
import { Sheet, Card, Text, Button, IconButton } from '../ui';
import { FilterChip } from '../tactics/FilterChip';

export interface ProcedureDraft {
  procedure: TrainingProcedureRecord | null;
  /** Libellé quand il n'y a pas de fiche (bloc prévu sans procédé, ou jeu libre). */
  freeLabel: string | null;
  pointsPerTap: number;
  seriesOn: boolean;
  series: SeriesConfig;
}

export interface PlannedBlock {
  label: string;
  durationMin: number;
}

function Stepper({
  label,
  display,
  onDec,
  onInc,
  decDisabled,
}: {
  label: string;
  display: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
}) {
  const s = useStyles();
  return (
    <View style={s.stepperRow}>
      <Text variant="body" style={s.stepperLabel}>{label}</Text>
      <IconButton icon="remove" label={`Diminuer : ${label}`} variant="surface" size="lg" disabled={decDisabled} onPress={onDec} />
      <Text variant="headline" numeric style={s.stepperValue}>{display}</Text>
      <IconButton icon="add" label={`Augmenter : ${label}`} variant="surface" size="lg" onPress={onInc} />
    </View>
  );
}

/**
 * Feuille "Procédé suivant" / "Démarrer un procédé". Le procédé prévu dans la
 * séance est pré-rempli : le cas courant est deux taps (ouvrir, lancer).
 */
export function ProcedureSheet({
  visible,
  onClose,
  hasOpenGame,
  hasGames,
  planned,
  draft,
  onChange,
  onPickProcedure,
  busy,
  onLaunch,
  onEndSession,
}: {
  visible: boolean;
  onClose: () => void;
  hasOpenGame: boolean;
  hasGames: boolean;
  planned: PlannedBlock | null;
  draft: ProcedureDraft;
  onChange: (next: ProcedureDraft) => void;
  onPickProcedure: () => void;
  busy: boolean;
  onLaunch: () => void;
  onEndSession: () => void;
}) {
  const s = useStyles();
  const set = (patch: Partial<ProcedureDraft>) => onChange({ ...draft, ...patch });
  const setSeries = (patch: Partial<SeriesConfig>) => set({ series: { ...draft.series, ...patch } });

  const procedureName = draft.procedure ? draft.procedure.title || 'Sans titre' : draft.freeLabel ?? 'Jeu libre';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={hasOpenGame ? 'Procédé suivant' : 'Démarrer un procédé'}
      subtitle={hasOpenGame ? 'La séquence en cours est clôturée, ses scores sont conservés.' : undefined}
    >
      <View style={s.body}>
        {planned ? (
          <Card variant="flat" padding="md" style={s.planned}>
            <Text variant="caption" tone="tertiary">Prévu dans la séance</Text>
            <Text variant="headline" numberOfLines={2}>{planned.label}</Text>
            {planned.durationMin > 0 ? <Text variant="caption" tone="secondary">{planned.durationMin} min</Text> : null}
          </Card>
        ) : null}

        <View style={s.section}>
          <Text variant="caption" tone="tertiary">PROCÉDÉ</Text>
          <Button label={procedureName} icon="document-text-outline" variant="secondary" block onPress={onPickProcedure} accessibilityHint="Choisir une autre fiche" />
          {draft.procedure || draft.freeLabel ? (
            <Button label="Sans fiche (jeu libre)" variant="ghost" size="sm" onPress={() => set({ procedure: null, freeLabel: null })} />
          ) : null}
          {draft.procedure && draft.procedure.scoring.length > 0 ? (
            <Text variant="caption" tone="tertiary">Rappel : {draft.procedure.scoring.join(' · ')}</Text>
          ) : null}
        </View>

        <View style={s.section}>
          <Text variant="caption" tone="tertiary">SCORE</Text>
          <Stepper
            label="Valeur d'un point"
            display={String(draft.pointsPerTap)}
            decDisabled={draft.pointsPerTap <= 1}
            onDec={() => set({ pointsPerTap: Math.max(1, draft.pointsPerTap - 1) })}
            onInc={() => set({ pointsPerTap: draft.pointsPerTap + 1 })}
          />
        </View>

        <View style={s.section}>
          <Text variant="caption" tone="tertiary">CHRONO DES SÉQUENCES</Text>
          <View style={s.chips}>
            <FilterChip label="Libre" active={!draft.seriesOn} onPress={() => set({ seriesOn: false })} />
            <FilterChip label="Séries et repos" active={draft.seriesOn} onPress={() => set({ seriesOn: true })} />
          </View>
          {draft.seriesOn ? (
            <>
              <Stepper
                label="Séries"
                display={String(draft.series.seriesCount)}
                decDisabled={draft.series.seriesCount <= 1}
                onDec={() => setSeries({ seriesCount: Math.max(1, draft.series.seriesCount - 1) })}
                onInc={() => setSeries({ seriesCount: draft.series.seriesCount + 1 })}
              />
              <Stepper
                label="Durée d'une série"
                display={formatClock(draft.series.seriesDurationSeconds)}
                decDisabled={draft.series.seriesDurationSeconds <= 15}
                onDec={() => setSeries({ seriesDurationSeconds: Math.max(15, draft.series.seriesDurationSeconds - 15) })}
                onInc={() => setSeries({ seriesDurationSeconds: draft.series.seriesDurationSeconds + 15 })}
              />
              <Stepper
                label="Repos"
                display={formatClock(draft.series.restDurationSeconds)}
                decDisabled={draft.series.restDurationSeconds <= 0}
                onDec={() => setSeries({ restDurationSeconds: Math.max(0, draft.series.restDurationSeconds - 5) })}
                onInc={() => setSeries({ restDurationSeconds: draft.series.restDurationSeconds + 5 })}
              />
            </>
          ) : (
            <Text variant="caption" tone="tertiary">Pas de décompte par séquence : tu enchaînes avec « Séquence suivante ».</Text>
          )}
        </View>

        <Button label="Lancer le procédé" icon="play" size="lg" block loading={busy} onPress={onLaunch} />
        {hasGames ? <Button label="Terminer la séance" icon="flag-outline" variant="ghost" block disabled={busy} onPress={onEndSession} /> : null}
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.lg, paddingBottom: t.space.lg },
  planned: { gap: t.space.xs },
  section: { gap: t.space.sm },
  chips: { flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  stepperLabel: { flex: 1 },
  stepperValue: { minWidth: 56, textAlign: 'center' },
}));
