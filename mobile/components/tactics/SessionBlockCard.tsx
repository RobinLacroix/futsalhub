import { useState } from 'react';
import { View } from 'react-native';
import { makeStyles } from '../../contexts/ThemeContext';
import { Card, Text, Badge, Input, IconButton, Button } from '../ui';
import { blockMeta } from '../../lib/tactics/sessionBlocks';
import type { SessionBlock } from '../../lib/services/sessionsService';
import type { TrainingProcedureRecord } from '../../lib/services/trainingProceduresService';

export interface SessionBlockCardProps {
  block: SessionBlock;
  index: number;
  total: number;
  procedure: TrainingProcedureRecord | null;
  onPatch: (patch: Partial<SessionBlock>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPickProcedure: () => void;
  onViewSchematic?: (schematicId: string) => void;
}

/** Carte compacte : type + durée + réordonnancement sur une ligne, aperçu du procédé, intention pédagogique repliée. */
export function SessionBlockCard({
  block, index, total, procedure, onPatch, onRemove, onMoveUp, onMoveDown, onPickProcedure, onViewSchematic,
}: SessionBlockCardProps) {
  const s = useStyles();
  const [showIntention, setShowIntention] = useState(!!block.intentionPedagogique);
  const meta = blockMeta(block.type);

  return (
    <Card variant={meta.isCore ? 'accent' : 'raised'} padding="md" style={s.card}>
      <View style={s.header}>
        {meta.isCore && <Badge label="Cœur" tone="accent" size="sm" solid />}
        <Text variant="headline" numberOfLines={1} style={s.title}>{meta.label}</Text>
      </View>

      <View style={s.durationRow}>
        <Input
          label="Durée (min)"
          numeric
          keyboardType="number-pad"
          value={String(block.duration || 0)}
          onChangeText={(v) => onPatch({ duration: parseInt(v, 10) || 0 })}
          containerStyle={s.durationField}
        />
        <View style={s.orderActions}>
          <IconButton icon="chevron-up" label="Monter le bloc" variant="plain" size="sm" disabled={index === 0} onPress={onMoveUp} />
          <IconButton icon="chevron-down" label="Descendre le bloc" variant="plain" size="sm" disabled={index === total - 1} onPress={onMoveDown} />
          <IconButton icon="close" label="Retirer le bloc" variant="destructive" size="sm" onPress={onRemove} />
        </View>
      </View>

      <Button
        label={procedure ? (procedure.title || 'Sans titre') : 'Choisir un procédé (optionnel)'}
        icon="document-text-outline"
        variant="secondary"
        onPress={onPickProcedure}
        block
      />

      {procedure?.schematic_id && onViewSchematic ? (
        <Button
          label="Voir le schéma"
          icon="albums-outline"
          variant="ghost"
          size="sm"
          onPress={() => onViewSchematic(procedure.schematic_id as string)}
        />
      ) : null}

      {showIntention ? (
        <Input
          label="Intention pédagogique"
          value={block.intentionPedagogique}
          onChangeText={(v) => onPatch({ intentionPedagogique: v })}
          placeholder="Ce que ce bloc doit produire"
          multiline
          optional
        />
      ) : (
        <Button label="+ Intention pédagogique (optionnel)" variant="ghost" size="sm" onPress={() => setShowIntention(true)} />
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  title: { flex: 1 },
  durationRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.space.sm },
  durationField: { width: 110 },
  orderActions: { flexDirection: 'row', gap: t.space.xs },
}));
