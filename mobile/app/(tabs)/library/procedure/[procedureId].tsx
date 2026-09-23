import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../../contexts/ThemeContext';
import { useIsTablet } from '../../../../hooks/useIsTablet';
import { Screen, Text, Badge, Section, EmptyState, HeaderBackButton, BackLink, IconButton } from '../../../../components/ui';
import { DrillPlayer } from '../../../../components/tactics/DrillPlayer';
import { ProcedureEditSheet } from '../../../../components/training/ProcedureEditSheet';
import { phaseTone, intensiteTone } from '../../../../lib/tactics/procedureTaxonomy';
import { getProcedureById, type TrainingProcedureRecord } from '../../../../lib/services/trainingProceduresService';
import { getSchematicById, type SchematicRecord } from '../../../../lib/services/schematicsService';

/**
 * Fiche procédé, plein écran — mêmes champs que la fiche de
 * app/webapp/library/page.tsx (web, ProcedureDetailModal) : Bloc/Format/
 * Phase de jeu/Intensité, Principes, Description, Objectifs, Mécanismes
 * inducteurs, Scoring, Comportements attendus, Variables +/-, infos
 * pratiques. Demande explicite de Robin : "possibilité de voir l'ensemble
 * des descriptifs et règles associé à chaque procédé" côté mobile.
 *
 * Le schéma lié (s'il y en a un) se joue avec DrillPlayer — lecture seule,
 * step + continu, jamais d'édition ici (cf DrillPlayer).
 */
export default function ProcedureDetailScreen() {
  const { procedureId } = useLocalSearchParams<{ procedureId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const isTablet = useIsTablet();
  const s = useStyles();

  const [procedure, setProcedure] = useState<TrainingProcedureRecord | null>(null);
  const [schematic, setSchematic] = useState<SchematicRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editVisible, setEditVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProcedureById(procedureId)
      .then(async (proc) => {
        if (cancelled) return;
        setProcedure(proc);
        if (proc?.schematic_id) {
          const sch = await getSchematicById(proc.schematic_id).catch(() => null);
          if (!cancelled) setSchematic(sch);
        }
      })
      .catch((err) => Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement du procédé impossible'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [procedureId]);

  useEffect(() => {
    navigation.setOptions({
      title: procedure?.title || 'Procédé',
      headerLeft: () => <HeaderBackButton onPress={() => router.back()} />,
    });
  }, [navigation, procedure, router]);

  if (loading || !procedure) {
    return (
      <Screen scroll={false}>
        {isTablet && <BackLink onPress={() => router.back()} />}
        <View style={s.center}>
          <ActivityIndicator color={c.accent.default} />
        </View>
      </Screen>
    );
  }

  const hasMecanismes = procedure.mecanismes && procedure.mecanismes.length > 0;
  const hasScoring = procedure.scoring && procedure.scoring.length > 0;
  const hasComportements = procedure.comportements && procedure.comportements.length > 0;
  const hasVariablesPlus = procedure.variables_plus && procedure.variables_plus.length > 0;
  const hasVariablesMoins = procedure.variables_moins && procedure.variables_moins.length > 0;

  return (
    <Screen>
      {isTablet && <BackLink onPress={() => router.back()} />}
      <View style={s.titleRow}>
        <Text variant="title" style={s.flex}>
          {procedure.title || 'Sans titre'}
        </Text>
        <IconButton icon="create-outline" label="Modifier le procédé" onPress={() => setEditVisible(true)} variant="surface" />
      </View>

      <View style={s.badgeRow}>
        {procedure.bloc && <Badge label={procedure.bloc} tone="neutral" />}
        {procedure.type && <Badge label={procedure.type} tone="accent" />}
        {procedure.theme && <Badge label={procedure.theme} tone={phaseTone(procedure.theme)} />}
        {procedure.intensite && <Badge label={procedure.intensite} tone={intensiteTone(procedure.intensite)} />}
      </View>

      {procedure.principes.length > 0 && (
        <View style={s.badgeRow}>
          {procedure.principes.map((p) => (
            <Badge key={p} label={p} tone="accent" size="sm" />
          ))}
        </View>
      )}

      <Section title="Schéma tactique">
        {schematic ? (
          <DrillPlayer drill={schematic.data} />
        ) : (
          <EmptyState icon="layers-outline" title="Pas de schéma" description="Ce procédé n'a pas encore de schéma dessiné." compact />
        )}
      </Section>

      {procedure.instructions && (
        <Section title="Description">
          <Text variant="body">{procedure.instructions}</Text>
        </Section>
      )}

      <Section title="Objectifs">
        <Text variant="body">{procedure.objectives}</Text>
      </Section>

      {hasMecanismes && (
        <Section title="Règles avec mécanisme inducteur">
          <View style={s.list}>
            {procedure.mecanismes.map((m, i) => (
              <Text key={i} variant="body">
                {m.regle}
                {m.induit ? <Text variant="body" tone="tertiary"> → {m.induit}</Text> : null}
              </Text>
            ))}
          </View>
        </Section>
      )}

      {hasScoring && (
        <Section title="Scoring">
          <View style={s.list}>
            {procedure.scoring.map((sc, i) => (
              <Text key={i} variant="body">
                • {sc}
              </Text>
            ))}
          </View>
        </Section>
      )}

      {(hasComportements || procedure.corrections) && (
        <Section title="Comportements attendus">
          <View style={s.list}>
            {hasComportements ? (
              procedure.comportements.map((cp, i) => (
                <Text key={i} variant="body">
                  • {cp}
                </Text>
              ))
            ) : (
              <Text variant="body">{procedure.corrections}</Text>
            )}
          </View>
        </Section>
      )}

      {(hasVariablesPlus || hasVariablesMoins || procedure.variants) && (
        <Section title="Variantes">
          <View style={s.list}>
            {procedure.variables_plus.map((v, i) => (
              <Text key={`p${i}`} variant="body">
                + {v}
              </Text>
            ))}
            {procedure.variables_moins.map((v, i) => (
              <Text key={`m${i}`} variant="body">
                − {v}
              </Text>
            ))}
            {procedure.variants && <Text variant="body">{procedure.variants}</Text>}
          </View>
        </Section>
      )}

      <Section title="Informations pratiques">
        <View style={s.infoGrid}>
          {procedure.rapport_numerique && <InfoTile label="Rapport" value={procedure.rapport_numerique} />}
          {procedure.field_dimensions && <InfoTile label="Terrain" value={procedure.field_dimensions} />}
          {procedure.duration_minutes ? <InfoTile label="Durée" value={`${procedure.duration_minutes} min`} /> : null}
          {procedure.min_players ? <InfoTile label="Joueurs min." value={String(procedure.min_players)} /> : null}
        </View>
      </Section>

      <ProcedureEditSheet
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        procedure={procedure}
        onSaved={setProcedure}
      />
    </Screen>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ backgroundColor: c.bg.surface, borderColor: c.border.subtle, borderWidth: 1, borderRadius: theme.radius.md, padding: theme.space.md, minWidth: 110 }}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="callout" weight="600">
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.md },
  flex: { flex: 1 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs, marginTop: t.space.md },
  list: { gap: t.space.xs },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
}));
