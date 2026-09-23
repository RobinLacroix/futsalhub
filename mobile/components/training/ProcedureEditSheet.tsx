import { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { makeStyles } from '../../contexts/ThemeContext';
import { Sheet, Field, Input, ChipGroup, Text, Button, IconButton } from '../ui';
import { BLOCS, FORMATS, PHASES_DE_JEU, INTENSITES } from '../../lib/tactics/procedureTaxonomy';
import {
  updateProcedure,
  type TrainingProcedureRecord,
  type MecanismeInducteur,
} from '../../lib/services/trainingProceduresService';

const BLOC_OPTIONS = [{ value: '', label: 'Aucun' }, ...BLOCS.map((v) => ({ value: v, label: v }))] as const;
const FORMAT_OPTIONS = FORMATS.map((v) => ({ value: v, label: v }));
const PHASE_OPTIONS = PHASES_DE_JEU.map((v) => ({ value: v, label: v }));
const INTENSITE_OPTIONS = [{ value: '', label: 'Aucune' }, ...INTENSITES.map((v) => ({ value: v, label: v }))] as const;

/**
 * Édition des champs d'une fiche procédé, depuis mobile — mêmes champs que le
 * formulaire web (app/webapp/library/page.tsx, ProcedureDrawer), à la demande
 * explicite de Robin après le premier test de la bibliothèque mobile
 * ("un bouton modifier [les champs]"). Ne touche JAMAIS au schéma dessiné
 * (schematic_id absent de ProcedureUpdateInput) — le dessin reste une tâche
 * web, cf DrillPlayer en lecture seule.
 */
export function ProcedureEditSheet({
  visible,
  onClose,
  procedure,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  procedure: TrainingProcedureRecord;
  onSaved: (p: TrainingProcedureRecord) => void;
}) {
  const s = useStyles();
  const [title, setTitle] = useState(procedure.title);
  const [bloc, setBloc] = useState(procedure.bloc || '');
  const [type, setType] = useState(procedure.type);
  const [phase, setPhase] = useState(procedure.theme);
  const [intensite, setIntensite] = useState(procedure.intensite || '');
  const [principes, setPrincipes] = useState<string[]>(procedure.principes ?? []);
  const [principeDraft, setPrincipeDraft] = useState('');
  const [rapportNumerique, setRapportNumerique] = useState(procedure.rapport_numerique || '');
  const [description, setDescription] = useState(procedure.instructions || '');
  const [objectives, setObjectives] = useState(procedure.objectives);
  const [mecanismes, setMecanismes] = useState<MecanismeInducteur[]>(procedure.mecanismes ?? []);
  const [scoring, setScoring] = useState<string[]>(procedure.scoring ?? []);
  const [comportements, setComportements] = useState<string[]>(procedure.comportements ?? []);
  const [variablesPlus, setVariablesPlus] = useState<string[]>(procedure.variables_plus ?? []);
  const [variablesMoins, setVariablesMoins] = useState<string[]>(procedure.variables_moins ?? []);
  const [durationMinutes, setDurationMinutes] = useState(procedure.duration_minutes?.toString() || '');
  const [minPlayers, setMinPlayers] = useState(procedure.min_players?.toString() || '');
  const [fieldDimensions, setFieldDimensions] = useState(procedure.field_dimensions || '');
  const [saving, setSaving] = useState(false);

  const addPrincipe = () => {
    const v = principeDraft.trim();
    if (v && !principes.includes(v)) setPrincipes([...principes, v]);
    setPrincipeDraft('');
  };

  const handleSave = async () => {
    const hasMeca = mecanismes.some((m) => m.regle.trim());
    if (!title.trim() || !objectives.trim() || !hasMeca) {
      Alert.alert('Champs manquants', 'Renseigne le titre, les objectifs et au moins une règle avec mécanisme inducteur.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProcedure(procedure.id, {
        title: title.trim(),
        bloc: bloc || null,
        type,
        theme: phase,
        intensite: (intensite || null) as TrainingProcedureRecord['intensite'],
        principes,
        rapport_numerique: rapportNumerique.trim() || null,
        instructions: description.trim(),
        objectives: objectives.trim(),
        mecanismes: mecanismes.filter((m) => m.regle.trim() || m.induit.trim()).map((m) => ({ regle: m.regle.trim(), induit: m.induit.trim() })),
        scoring: scoring.filter((v) => v.trim()),
        comportements: comportements.filter((v) => v.trim()),
        variables_plus: variablesPlus.filter((v) => v.trim()),
        variables_moins: variablesMoins.filter((v) => v.trim()),
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        min_players: minPlayers ? Number(minPlayers) : null,
        field_dimensions: fieldDimensions.trim() || null,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Modifier le procédé" maxHeight="92%">
      <Input label="Titre" value={title} onChangeText={setTitle} placeholder="Nom du procédé" />

      <Field label="Bloc">
        <ChipGroup label="Bloc" options={BLOC_OPTIONS} value={bloc} onChange={setBloc} />
      </Field>
      <Field label="Format">
        <ChipGroup label="Format" options={FORMAT_OPTIONS} value={type} onChange={setType} />
      </Field>
      <Field label="Phase de jeu">
        <ChipGroup label="Phase de jeu" options={PHASE_OPTIONS} value={phase} onChange={setPhase} />
      </Field>
      <Field label="Niveau d'intensité">
        <ChipGroup label="Niveau d'intensité" options={INTENSITE_OPTIONS} value={intensite} onChange={setIntensite} />
      </Field>

      <Field label="Principes associés">
        <View style={s.tagRow}>
          {principes.map((p) => (
            <Pressable key={p} onPress={() => setPrincipes(principes.filter((x) => x !== p))} style={s.tag}>
              <Text variant="caption" tone="accent">
                {p} ✕
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.addRow}>
          <Input
            label="Ajouter un principe"
            value={principeDraft}
            onChangeText={setPrincipeDraft}
            onSubmitEditing={addPrincipe}
            placeholder="Déséquilibre collectif, Pressing…"
            containerStyle={s.flex}
          />
          <IconButton icon="add" label="Ajouter" onPress={addPrincipe} variant="accent" />
        </View>
      </Field>

      <Input label="Rapport numérique" value={rapportNumerique} onChangeText={setRapportNumerique} placeholder="3v2, 4v3+GK…" />

      <Input label="Description" value={description} onChangeText={setDescription} placeholder="Présentation libre, contexte, intro…" multiline numberOfLines={3} inputStyle={s.textarea} />

      <Input label="Objectifs" value={objectives} onChangeText={setObjectives} placeholder="Décrire les objectifs principaux" multiline numberOfLines={3} inputStyle={s.textarea} />

      <MecanismesField label="Règles avec mécanisme inducteur" values={mecanismes} onChange={setMecanismes} />
      <StringListField label="Scoring" values={scoring} onChange={setScoring} placeholder="Ex : Home : conserve 4 passes = 1 pt" />
      <StringListField label="Comportements attendus" values={comportements} onChange={setComportements} placeholder="Ex : Ressortir par appuis-soutiens" />
      <StringListField label="Variables +" values={variablesPlus} onChange={setVariablesPlus} placeholder="Ex : Retirer un soutien" />
      <StringListField label="Variables -" values={variablesMoins} onChange={setVariablesMoins} placeholder="Ex : Ajouter un appui neutre" />

      <View style={s.row}>
        <Input label="Durée (min)" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" containerStyle={s.flex} />
        <Input label="Joueurs min." value={minPlayers} onChangeText={setMinPlayers} keyboardType="number-pad" containerStyle={s.flex} />
      </View>
      <Input label="Dimension du terrain" value={fieldDimensions} onChangeText={setFieldDimensions} placeholder="20m x 15m" />

      <View style={s.footer}>
        <Button label="Annuler" variant="secondary" onPress={onClose} disabled={saving} style={s.flex} />
        <Button label="Enregistrer" onPress={handleSave} loading={saving} style={s.flex} />
      </View>
    </Sheet>
  );
}

function StringListField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const s = useStyles();
  return (
    <Field label={label}>
      <View style={{ gap: 8 }}>
        {values.map((v, i) => (
          <View key={i} style={s.addRow}>
            <Input
              label={`${label} ${i + 1}`}
              value={v}
              onChangeText={(next) => {
                const copy = [...values];
                copy[i] = next;
                onChange(copy);
              }}
              placeholder={placeholder}
              containerStyle={s.flex}
            />
            <IconButton icon="trash-outline" label="Supprimer" onPress={() => onChange(values.filter((_, idx) => idx !== i))} variant="destructive" />
          </View>
        ))}
      </View>
      <Button label="Ajouter" variant="ghost" size="sm" icon="add" onPress={() => onChange([...values, ''])} />
    </Field>
  );
}

function MecanismesField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: MecanismeInducteur[];
  onChange: (v: MecanismeInducteur[]) => void;
}) {
  const s = useStyles();
  return (
    <Field label={label}>
      <View style={{ gap: 8 }}>
        {values.map((m, i) => (
          <View key={i} style={s.mecaRow}>
            <Input
              label={`Règle ${i + 1}`}
              value={m.regle}
              onChangeText={(next) => {
                const copy = [...values];
                copy[i] = { ...copy[i], regle: next };
                onChange(copy);
              }}
              placeholder="règle"
            />
            <View style={s.addRow}>
              <Input
                label={`Induit ${i + 1}`}
                value={m.induit}
                onChangeText={(next) => {
                  const copy = [...values];
                  copy[i] = { ...copy[i], induit: next };
                  onChange(copy);
                }}
                placeholder="ce que ça induit"
                containerStyle={s.flex}
              />
              <IconButton icon="trash-outline" label="Supprimer" onPress={() => onChange(values.filter((_, idx) => idx !== i))} variant="destructive" />
            </View>
          </View>
        ))}
      </View>
      <Button label="Ajouter un mécanisme" variant="ghost" size="sm" icon="add" onPress={() => onChange([...values, { regle: '', induit: '' }])} />
    </Field>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: t.space.md },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space.sm },
  mecaRow: { gap: t.space.xs, borderLeftWidth: 2, borderLeftColor: t.colors.border.subtle, paddingLeft: t.space.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs, marginBottom: t.space.sm },
  tag: {
    backgroundColor: t.colors.accent.subtle,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.space.md,
    paddingVertical: 6,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top', paddingTop: t.space.sm },
  footer: { flexDirection: 'row', gap: t.space.md, marginTop: t.space.lg },
}));
