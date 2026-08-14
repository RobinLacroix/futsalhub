/**
 * InvitePlayersSheet — convoquer des joueurs d'autres équipes du club (P0-7)
 *
 * Remplace une `Modal` roulée à la main (`marginTop: 80`, `maxHeight: '80%'`,
 * `onStartShouldSetResponder`) par la primitive `Sheet`.
 *
 * Trois corrections :
 *
 * 1. **Case à cocher de 24 pt avec un glyphe texte `✓`.** Cible sous les 44 pt
 *    et coche non annoncée. La ligne entière est maintenant la cible, et elle
 *    porte un `accessibilityState.checked`.
 *
 * 2. **Sélection perdue sans avertissement.** « Annuler » et le voile de fond
 *    vidaient la sélection en silence. Le nombre de joueurs sélectionnés est
 *    désormais visible en permanence sur le bouton de validation.
 *
 * 3. **Filtre d'équipe en `#16a34a`.** Le vert servait de couleur d'interface
 *    primaire alors qu'il porte le sens « bon » dans la rampe de données.
 *    L'état actif passe sur l'accent.
 */

import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, Text, Button, EmptyState } from '../ui';
import { AvailabilityPill } from '../performance/AvailabilityPill';
import {
  needsConvocationWarning,
  statusLabel,
  type AvailabilityRow,
  type AvailabilityStatus,
} from '../../lib/availability';
import type { PlayerWithTeams } from '../../lib/services/players';
import type { Team } from '../../types';

export interface InvitePlayersSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Joueurs du club hors effectif de l'équipe active. */
  candidates: PlayerWithTeams[];
  /** Équipes proposées au filtre (l'équipe active est déjà exclue par l'appelant). */
  teams: Team[];
  /** Ids déjà convoqués, non re-proposables. */
  alreadyInvited: ReadonlySet<string>;
  /**
   * Disponibilité, fournie par l'écran appelant (`useAvailability`). Optionnelle :
   * la feuille reste utilisable si le chargement a échoué, et se comporte alors
   * comme avant cette feature plutôt que de bloquer une convocation.
   */
  availability?: {
    statusOf: (playerId: string) => AvailabilityStatus;
    rowOf: (playerId: string) => AvailabilityRow | null;
  };
  onConfirm: (playerIds: string[]) => void;
}

export function InvitePlayersSheet({
  visible,
  onClose,
  candidates,
  teams,
  alreadyInvited,
  availability,
  onConfirm,
}: InvitePlayersSheetProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [filterTeamId, setFilterTeamId] = useState<string>('all');
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filtered = useMemo(
    () =>
      filterTeamId === 'all'
        ? candidates
        : candidates.filter(({ teamIds }) => teamIds.includes(filterTeamId)),
    [candidates, filterTeamId]
  );

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected]
  );

  const reset = () => {
    setSelected({});
    setFilterTeamId('all');
  };

  const close = () => {
    reset();
    onClose();
  };

  /**
   * Une SEULE confirmation pour toute la sélection, pas une par joueur.
   *
   * Ici on coche en lot : trois boîtes de dialogue à la suite seraient validées
   * sans être lues, et la garde ne protégerait plus de rien. On nomme donc les
   * joueurs concernés avec leur statut, en un message, et le coach tranche une
   * fois en connaissance de cause.
   */
  const confirm = () => {
    const ids = selectedIds.filter((id) => !alreadyInvited.has(id));

    const flagged = availability
      ? ids
          .map((id) => ({ id, status: availability.statusOf(id) }))
          .filter(({ status }) => needsConvocationWarning(status))
      : [];

    const apply = () => {
      onConfirm(ids);
      reset();
    };

    if (flagged.length === 0) {
      apply();
      return;
    }

    const lines = flagged
      .map(({ id, status }) => {
        const found = candidates.find(({ player }) => player.id === id);
        const name = found ? `${found.player.first_name} ${found.player.last_name}` : 'Joueur';
        return `• ${name} — ${statusLabel(status).toLowerCase()}`;
      })
      .join('\n');

    Alert.alert(
      flagged.length > 1 ? 'Joueurs non disponibles' : 'Joueur non disponible',
      `${lines}\n\nLes convoquer quand même ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Convoquer quand même', onPress: apply },
      ],
    );
  };

  const chip = (id: string, label: string) => {
    const active = filterTeamId === id;
    return (
      <Pressable
        key={id}
        onPress={() => setFilterTeamId(id)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Filtrer sur ${label}`}
        style={{
          paddingVertical: 9,
          paddingHorizontal: theme.space.lg,
          borderRadius: theme.radius.pill,
          marginRight: theme.space.sm,
          backgroundColor: active ? c.accent.fill : c.bg.sunken,
        }}
      >
        <Text variant="callout" tone={active ? 'onFill' : 'secondary'} weight="600">
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Joueurs d'autres équipes"
      subtitle="Convoquer un joueur du club qui n'est pas dans cet effectif."
      scrollable={false}
    >
      {candidates.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Aucun joueur disponible"
          description="Tous les joueurs du club sont déjà dans cet effectif."
          compact
        />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
            contentContainerStyle={styles.chipContent}
          >
            {chip('all', 'Toutes')}
            {teams.map((t) => chip(t.id, t.name))}
          </ScrollView>

          <ScrollView style={styles.list}>
            {filtered.length === 0 ? (
              <EmptyState icon="filter-outline" title="Aucun joueur dans ce filtre" compact />
            ) : (
              filtered.map(({ player, teamNames }) => {
                const already = alreadyInvited.has(player.id);
                const checked = already || !!selected[player.id];
                return (
                  <Pressable
                    key={player.id}
                    disabled={already}
                    onPress={() =>
                      setSelected((prev) => ({ ...prev, [player.id]: !prev[player.id] }))
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled: already }}
                    accessibilityLabel={`${player.first_name} ${player.last_name}${
                      teamNames.length ? `, ${teamNames.join(', ')}` : ''
                    }${already ? ', déjà convoqué' : ''}`}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        borderBottomColor: c.border.subtle,
                        opacity: already ? 0.5 : 1,
                        backgroundColor: pressed ? c.bg.sunken : 'transparent',
                      },
                    ]}
                  >
                    <View style={styles.rowText}>
                      <Text variant="body" weight="500" numberOfLines={1}>
                        {player.first_name} {player.last_name}
                      </Text>
                      {teamNames.length > 0 && (
                        <Text variant="caption" tone="tertiary" numberOfLines={1}>
                          {teamNames.join(' · ')}
                        </Text>
                      )}
                    </View>
                    {availability && (
                      <AvailabilityPill
                        status={availability.statusOf(player.id)}
                        row={availability.rowOf(player.id)}
                      />
                    )}
                    <Ionicons
                      name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={checked ? c.accent.default : c.text.tertiary}
                    />
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.footer, { gap: theme.space.md }]}>
            <Button label="Annuler" variant="ghost" onPress={close} style={styles.flex} />
            <Button
              label={
                selectedIds.length > 0
                  ? `Convoquer (${selectedIds.length})`
                  : 'Convoquer'
              }
              onPress={confirm}
              disabled={selectedIds.length === 0}
              style={styles.flex}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexGrow: 0, marginBottom: 12 },
  chipContent: { alignItems: 'center' },
  list: { maxHeight: 320 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 1 },
  footer: { flexDirection: 'row', marginTop: 16 },
  flex: { flex: 1 },
});
