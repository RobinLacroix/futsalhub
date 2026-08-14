/**
 * Édition du statut de disponibilité — feuille mobile.
 *
 * Jumelle web : `app/webapp/manager/performance/components/AvailabilityEditor.tsx`.
 * Les deux appellent la même RPC et suivent les mêmes règles ; c'est le rendu
 * qui diffère, pas le comportement. Devant une paire de surfaces jumelles, la
 * leçon des deux match recorders vaut : elles divergent sur la DONNÉE avant de
 * diverger sur l'affichage.
 *
 * ## Le champ « depuis » date aussi la fin de l'état précédent
 *
 * Un kiné qui saisit lundi une reprise datée du samedi produit un historique
 * juste ; s'il laisse la date du jour, le joueur apparaît en soins deux jours de
 * trop, tous les ans, sur tous les cumuls de la saison.
 *
 * ## `side` n'est jamais choisi séparément
 *
 * Les zones de `lib/painMap.ts` encodent déjà le côté (`hamstring_l`), et
 * `toPayload` remplit `pain_reports.side` depuis la définition de la zone. Deux
 * champs indépendants finiraient par se contredire, et c'est précisément la
 * table de correspondance en trop que ce module cherche à éviter.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parse, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, Text, Button, Field, Input, ChipGroup, type ChipOption } from '../ui';
import { setPlayerAvailability } from '../../lib/services/availability';
import {
  AVAILABILITY_META,
  AVAILABILITY_ORDER,
  type AvailabilityRow,
  type AvailabilityStatus,
} from '../../lib/availability';
import { FRONT_ZONES, BACK_ZONES, JOINT_ZONES } from '../../lib/painMap';

const ZONES = [...FRONT_ZONES, ...BACK_ZONES, ...JOINT_ZONES];

const STATUS_CHIPS: readonly ChipOption<string>[] = AVAILABILITY_ORDER.map((status) => ({
  value: status,
  label: AVAILABILITY_META[status].label,
}));

const ZONE_CHIPS: readonly ChipOption<string>[] = [
  { value: '', label: 'Aucune' },
  ...ZONES.map((z) => ({ value: z.id, label: z.label })),
];

const CONFIDENCE_CHIPS: readonly ChipOption<string>[] = [
  { value: 'estimee', label: 'Estimé' },
  { value: 'confirmee', label: 'Confirmé' },
];

const toIso = (d: Date) => format(d, 'yyyy-MM-dd');
const fromIso = (iso: string) => parse(iso, 'yyyy-MM-dd', new Date());
const display = (d: Date) => format(d, 'd MMMM yyyy', { locale: fr });

export interface AvailabilitySheetProps {
  visible: boolean;
  player: { id: string; first_name: string; last_name: string } | null;
  current: AvailabilityRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AvailabilitySheet({
  visible,
  player,
  current,
  onClose,
  onSaved,
}: AvailabilitySheetProps) {
  const { theme } = useTheme();

  const [status, setStatus] = useState<AvailabilityStatus>('disponible');
  const [since, setSince] = useState<Date>(new Date());
  const [expectedReturn, setExpectedReturn] = useState<Date | null>(null);
  const [confidence, setConfidence] = useState<'estimee' | 'confirmee'>('estimee');
  const [zone, setZone] = useState('');
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState<'since' | 'return' | null>(null);
  const [saving, setSaving] = useState(false);

  // La feuille est montée en permanence : sans cette remise à zéro, ouvrir un
  // deuxième joueur afficherait l'état du premier.
  useEffect(() => {
    if (!visible) return;
    setStatus(current?.status ?? 'disponible');
    setSince(new Date());
    setExpectedReturn(
      current?.expected_return_date && isValid(fromIso(current.expected_return_date))
        ? fromIso(current.expected_return_date)
        : null,
    );
    setConfidence(current?.return_confidence ?? 'estimee');
    setZone(current?.zone ?? '');
    setNote(current?.note ?? '');
    setPicker(null);
  }, [visible, current]);

  const isAvailable = status === 'disponible';

  // Repasser un joueur en « disponible » solde son indisponibilité : garder une
  // date de retour et une zone produirait une ligne qui se contredit.
  useEffect(() => {
    if (isAvailable) {
      setExpectedReturn(null);
      setZone('');
    }
  }, [isAvailable]);

  const meta = AVAILABILITY_META[status];

  const sideForZone = useMemo(
    () => (zone ? (ZONES.find((z) => z.id === zone)?.side ?? null) : null),
    [zone],
  );

  const handleSave = async () => {
    if (!player) return;
    setSaving(true);
    try {
      await setPlayerAvailability({
        playerId: player.id,
        status,
        since: toIso(since),
        expectedReturn: expectedReturn ? toIso(expectedReturn) : null,
        returnConfidence: expectedReturn ? confidence : null,
        zone: zone || null,
        side: sideForZone,
        note: note.trim() || null,
      });
      onSaved();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={player ? `${player.first_name} ${player.last_name}` : 'Disponibilité'}
      subtitle="Statut de disponibilité"
      maxHeight="90%"
    >
      <View style={{ gap: theme.space.lg }}>
        <Field label="Statut">
          <ChipGroup
            label="Statut de disponibilité"
            options={STATUS_CHIPS}
            value={status}
            onChange={(v) => setStatus(v as AvailabilityStatus)}
          />
          <Text variant="caption" tone="tertiary" style={{ marginTop: theme.space.xs }}>
            {meta.hint}
          </Text>
        </Field>

        <Field label="Depuis le" hint="Date aussi la fin de l'état précédent.">
          <Button
            label={display(since)}
            icon="calendar-outline"
            variant="secondary"
            onPress={() => setPicker('since')}
            block
          />
        </Field>

        {!isAvailable && (
          <>
            <Field label="Retour prévu" optional>
              <Button
                label={expectedReturn ? display(expectedReturn) : 'Non estimé'}
                icon="calendar-outline"
                variant="secondary"
                onPress={() => setPicker('return')}
                block
              />
              {expectedReturn && (
                <View style={{ marginTop: theme.space.sm, gap: theme.space.sm }}>
                  <ChipGroup
                    label="Fiabilité de la date de retour"
                    options={CONFIDENCE_CHIPS}
                    value={confidence}
                    onChange={(v) => setConfidence(v as 'estimee' | 'confirmee')}
                  />
                  <Button
                    label="Retirer la date"
                    variant="ghost"
                    size="sm"
                    onPress={() => setExpectedReturn(null)}
                  />
                </View>
              )}
            </Field>

            <Field
              label="Zone concernée"
              optional
              hint="Même référentiel que les déclarations de douleur : c'est ce qui permet de rapprocher un signal d'une blessure."
            >
              <ChipGroup
                label="Zone concernée"
                options={ZONE_CHIPS}
                value={zone}
                onChange={setZone}
              />
            </Field>
          </>
        )}

        <Input
          label="Note"
          optional
          value={note}
          onChangeText={setNote}
          placeholder="Protocole, consigne au staff, contexte…"
          multiline
        />

        <Text variant="caption" tone="tertiary">
          L&apos;état précédent est conservé dans l&apos;historique du joueur, il n&apos;est pas
          écrasé.
        </Text>

        <Button
          label={saving ? 'Enregistrement…' : 'Enregistrer'}
          onPress={handleSave}
          loading={saving}
          disabled={saving || !player}
          size="lg"
          block
        />
      </View>

      {picker && (
        <DateTimePicker
          value={(picker === 'since' ? since : expectedReturn) ?? new Date()}
          mode="date"
          display="spinner"
          // Un statut ne peut pas commencer demain, un retour ne peut pas être
          // dans le passé lointain : on borne ce qui a un sens, rien de plus.
          maximumDate={picker === 'since' ? new Date() : undefined}
          minimumDate={picker === 'return' ? since : undefined}
          themeVariant={theme.scheme}
          accentColor={theme.colors.accent.default}
          textColor={theme.colors.text.primary}
          onChange={(_e, d) => {
            const which = picker;
            setPicker(null);
            if (!d) return;
            if (which === 'since') setSince(d);
            else setExpectedReturn(d);
          }}
        />
      )}
    </Sheet>
  );
}
