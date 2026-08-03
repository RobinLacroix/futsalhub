/**
 * Galerie de design — écran de vérification visuelle (P0-2)
 *
 * Rend toutes les primitives d'un coup, dans le thème courant. Sert à valider
 * en un coup d'œil qu'un changement de token n'a rien cassé ailleurs, et à
 * comparer sombre / clair sans naviguer dans l'app.
 *
 * Route non listée dans la navigation : accessible via le lien profond
 * `futsalhub://design-gallery`, ou en tapant l'URL en dev.
 *
 * À retirer avant la soumission App Store, ou à laisser derrière un flag debug.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Section,
  Card,
  Button,
  IconButton,
  Stat,
  Badge,
  EmptyState,
  Sheet,
  Skeleton,
  SkeletonList,
  SkeletonStats,
  Text,
  ThemeSwitcher,
} from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { dataColor } from '../lib/design/tokens';

export default function DesignGallery() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const t = theme.colors;

  return (
    <Screen edgeTop>
      <View style={{ gap: theme.space.sm, marginTop: theme.space.lg }}>
        <Text variant="display">Design system</Text>
        <Text variant="callout" tone="tertiary">
          Thème {isDark ? 'sombre' : 'clair'} · Archivo + police système
        </Text>
      </View>

      <Section title="Apparence">
        <ThemeSwitcher />
      </Section>

      <Section title="Typographie" subtitle="7 niveaux, contre 22 tailles avant">
        <Card padding="lg" style={{ gap: theme.space.md }}>
          <Text variant="hero" numeric>
            12,4
          </Text>
          <Text variant="display">Display 30</Text>
          <Text variant="title">Title 20</Text>
          <Text variant="headline">Headline 17</Text>
          <Text variant="body">Body 15, la taille de lecture par défaut.</Text>
          <Text variant="callout" tone="secondary">
            Callout 13, texte secondaire et métadonnées.
          </Text>
          <Text variant="caption" tone="tertiary">
            Caption 12, plancher de lisibilité. Rien en dessous.
          </Text>
          <Text variant="tableCell" numeric>
            Cellule 13 tabulaire : 1111 · 0000 · 8888
          </Text>
        </Card>
      </Section>

      <Section title="Rampe de données" subtitle="Rouge / neutre / teal, lisible en deutéranopie">
        <Card padding="lg">
          <View style={{ flexDirection: 'row', gap: theme.space.lg }}>
            {[2.1, 5.0, 8.4].map((v) => (
              <Stat
                key={v}
                size="compact"
                value={v.toFixed(1)}
                label="Note data"
                valueColor={dataColor(theme, v, 5, 3)}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Stat" subtitle="Le chiffre est le héros, pas le libellé">
        <View style={{ gap: theme.space.md }}>
          <Card padding="lg">
            <Stat
              size="hero"
              value="2,8"
              unit="/match"
              label="Buts marqués par match"
              delta={0.7}
              deltaLabel="vs saison passée"
            />
          </Card>
          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <Card padding="lg" style={{ flex: 1 }}>
              <Stat
                value="4"
                label="Buts"
                delta={1.8}
                deltaLabel="vs moyenne"
                density={0.82}
                valueColor={dataColor(theme, 4, 2.2, 2)}
              />
            </Card>
            <Card padding="lg" style={{ flex: 1 }}>
              <Stat
                value="11"
                label="Pertes de balle"
                delta={-2.4}
                deltaLabel="vs moyenne"
                density={0.28}
                valueColor={dataColor(theme, -2.4, 0, 3)}
              />
            </Card>
          </View>
        </View>
      </Section>

      <Section title="Boutons">
        <Card padding="lg" style={{ gap: theme.space.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            <Button label="Primaire" onPress={() => {}} />
            <Button label="Secondaire" onPress={() => {}} variant="secondary" />
            <Button label="Ghost" onPress={() => {}} variant="ghost" />
            <Button label="Supprimer" onPress={() => {}} variant="destructive" icon="trash-outline" />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, alignItems: 'center' }}>
            <Button label="Small" onPress={() => {}} size="sm" />
            <Button label="Medium" onPress={() => {}} size="md" />
            <Button label="Large" onPress={() => {}} size="lg" />
            <Button label="Désactivé" onPress={() => {}} disabled />
          </View>
          <Button
            label={loading ? 'Chargement' : 'Tester le loading'}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1400);
            }}
            loading={loading}
            icon="download-outline"
            block
          />
          <View style={{ flexDirection: 'row', gap: theme.space.md, alignItems: 'center' }}>
            <IconButton icon="settings-outline" label="Paramètres" onPress={() => {}} />
            <IconButton icon="notifications-outline" label="Notifications" onPress={() => {}} variant="surface" badge={3} />
            <IconButton icon="add" label="Ajouter" onPress={() => {}} variant="accent" />
            <IconButton icon="trash-outline" label="Supprimer" onPress={() => {}} variant="destructive" />
          </View>
        </Card>
      </Section>

      <Section title="Badges">
        <Card padding="lg" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          <Badge label="Convoqué" tone="positive" icon="checkmark" />
          <Badge label="Blessé" tone="negative" icon="medkit-outline" />
          <Badge label="Douleur signalée" tone="warning" />
          <Badge label="Parti" tone="neutral" />
          <Badge label="Capitaine" tone="accent" solid />
          <Badge label="V" tone="positive" solid size="sm" />
          <Badge label="N" tone="neutral" solid size="sm" />
          <Badge label="D" tone="negative" solid size="sm" />
        </Card>
      </Section>

      <Section title="Cartes">
        <View style={{ gap: theme.space.md }}>
          <Card variant="flat" padding="lg">
            <Text variant="headline">Flat</Text>
            <Text variant="callout" tone="tertiary">Liseré seul, aucune ombre.</Text>
          </Card>
          <Card variant="raised" padding="lg">
            <Text variant="headline">Raised</Text>
            <Text variant="callout" tone="tertiary">Niveau par défaut du contenu.</Text>
          </Card>
          <Card variant="accent" padding="lg">
            <Text variant="headline" tone="accent">Accent</Text>
            <Text variant="callout" tone="secondary">Mise en avant, appel à l'action.</Text>
          </Card>
          <Card variant="raised" padding="lg" onPress={() => setSheetOpen(true)} accessibilityLabel="Ouvrir la feuille de démonstration">
            <Text variant="headline">Tactile</Text>
            <Text variant="callout" tone="tertiary">Tape ici : état pressé + haptique + feuille.</Text>
          </Card>
        </View>
      </Section>

      <Section title="Chargement" subtitle="Squelettes, plus de spinner plein écran">
        <Card variant="flat" padding="none">
          <SkeletonStats count={4} columns={2} />
          <SkeletonList rows={2} />
          <View style={{ padding: theme.space.lg, gap: theme.space.sm }}>
            <Skeleton width="70%" height={16} />
            <Skeleton width={48} circle />
          </View>
        </Card>
      </Section>

      <Section title="État vide">
        <Card variant="flat" padding="none">
          <EmptyState
            icon="stats-chart-outline"
            title="Aucun match analysé"
            description="Enregistre un match pour voir apparaître les statistiques de ton effectif."
            action={{ label: 'Enregistrer un match', onPress: () => {} }}
            secondaryAction={{ label: 'Importer un effectif', onPress: () => {} }}
          />
        </Card>
      </Section>

      <Section title="Palette" subtitle="Toutes les valeurs tiennent 4,5:1">
        <Card padding="lg" style={{ gap: theme.space.sm }}>
          {(
            [
              ['accent', t.accent.default],
              ['positive', t.positive.default],
              ['negative', t.negative.default],
              ['warning', t.warning.default],
              ['neutralData', t.neutralData],
              ['text.secondary', t.text.secondary],
              ['text.tertiary', t.text.tertiary],
            ] as const
          ).map(([name, hex]) => (
            <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: theme.radius.sm,
                  backgroundColor: hex,
                  borderWidth: 1,
                  borderColor: t.border.subtle,
                }}
              />
              <Text variant="callout" style={{ flex: 1 }}>{name}</Text>
              <Text variant="caption" tone="tertiary" numeric>{hex}</Text>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Séries de graphique">
        <Card padding="lg" style={{ flexDirection: 'row', gap: theme.space.sm }}>
          {t.chartSeries.map((hex, i) => (
            <View
              key={hex}
              style={{
                flex: 1,
                height: 48,
                borderRadius: theme.radius.sm,
                backgroundColor: hex,
                opacity: 1 - i * 0.04,
              }}
            />
          ))}
        </Card>
      </Section>

      <Section>
        <Button label="Retour" onPress={() => router.back()} variant="secondary" block icon="arrow-back" />
      </Section>

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Feuille de démonstration"
        subtitle="Glisse vers le bas ou tape le voile pour fermer"
      >
        <Text variant="body">
          Remplace les modales roulées à la main : poignée fonctionnelle, geste de
          fermeture, voile tapable, safe area respectée.
        </Text>
        <Button label="Action principale" onPress={() => setSheetOpen(false)} block />
        <Button label="Annuler" onPress={() => setSheetOpen(false)} variant="ghost" block />
      </Sheet>
    </Screen>
  );
}
