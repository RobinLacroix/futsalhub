/**
 * Nouvelle campagne de tests — feuille mobile, depuis l'onglet Tests physiques.
 *
 * Jusqu'ici une campagne mobile ne naissait que d'une séance (bouton « Tests
 * physiques » sur `calendar/training/[trainingId].tsx`). Cette feuille ouvre
 * la seconde porte, déjà présente côté web (`tests/page.tsx`) : une campagne
 * autonome, hors créneau — reprise du samedi matin, feuille papier rejouée.
 *
 * Équipe implicite : celle déjà active sur la page Performance. Pas de
 * sélecteur ici contrairement au web, qui lui n'est pas team-scopé par
 * défaut — dupliquer ce choix ferait un champ de plus pour une valeur déjà
 * connue du contexte.
 */

import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, Text, Button, Field, Input } from '../ui';
import { createSession } from '../../lib/services/physicalTests';
import type { PhysicalTestSession } from '../../lib/physicalTests';

const toIso = (d: Date) => format(d, 'yyyy-MM-dd');
const display = (d: Date) => format(d, 'd MMMM yyyy', { locale: fr });

export interface CreateTestSessionSheetProps {
  visible: boolean;
  clubId: string;
  teamId: string;
  clubSeason: string;
  onClose: () => void;
  onCreated: (session: PhysicalTestSession) => void;
}

export function CreateTestSessionSheet({
  visible,
  clubId,
  teamId,
  clubSeason,
  onClose,
  onCreated,
}: CreateTestSessionSheetProps) {
  const { theme } = useTheme();

  const [date, setDate] = useState(new Date());
  const [label, setLabel] = useState('');
  const [conditions, setConditions] = useState('');
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDate(new Date());
    setLabel('');
    setConditions('');
    setPicker(false);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const created = await createSession({
        clubId,
        teamId,
        trainingId: null,
        date: toIso(date),
        label: label.trim() || null,
        // Taggée sur la saison active du club, pas une saison consultée —
        // même règle que le web.
        season: clubSeason,
        conditions: conditions.trim() || null,
      });
      reset();
      onCreated(created);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Nouvelle campagne"
      subtitle="Tests physiques"
    >
      <View style={{ gap: theme.space.lg }}>
        <Field label="Date">
          <Button
            label={display(date)}
            icon="calendar-outline"
            variant="secondary"
            onPress={() => setPicker((v) => !v)}
            block
          />
          {picker && (
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              themeVariant={theme.scheme}
              accentColor={theme.colors.accent.default}
              textColor={theme.colors.text.primary}
              style={{ marginTop: theme.space.sm }}
              onChange={(_e, d) => {
                setPicker(false);
                if (d) setDate(d);
              }}
            />
          )}
        </Field>

        <Input
          label="Intitulé"
          optional
          value={label}
          onChangeText={setLabel}
          placeholder="Tests de reprise"
        />

        <Input
          label="Conditions"
          optional
          value={conditions}
          onChangeText={setConditions}
          placeholder="Parquet, 21 °C"
          hint="Deux campagnes dans des conditions différentes ne se comparent pas à l'identique."
        />

        <Button
          label={saving ? 'Création…' : 'Créer et saisir'}
          onPress={handleCreate}
          loading={saving}
          disabled={saving}
          size="lg"
          block
        />
      </View>
    </Sheet>
  );
}
