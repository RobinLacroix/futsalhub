import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { useIsTablet } from '../../../hooks/useIsTablet';
import { Screen, Text, HeaderBackButton, BackLink } from '../../../components/ui';
import { DrillPlayer } from '../../../components/tactics/DrillPlayer';
import { getSchematicById, type SchematicRecord } from '../../../lib/services/schematicsService';

/** Aperçu plein écran d'un schéma — lecture seule, même limite que la bibliothèque (cf index.tsx). */
export default function SchematicDetailScreen() {
  const { schematicId } = useLocalSearchParams<{ schematicId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { theme } = useTheme();
  const isTablet = useIsTablet();
  const s = useStyles();

  const [record, setRecord] = useState<SchematicRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSchematicById(schematicId)
      .then((row) => {
        if (!cancelled) setRecord(row);
      })
      .catch((err) => Alert.alert('Erreur', err instanceof Error ? err.message : 'Chargement du schéma impossible'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schematicId]);

  useEffect(() => {
    navigation.setOptions({
      title: record?.name || 'Schéma',
      headerLeft: () => <HeaderBackButton onPress={() => router.back()} />,
    });
  }, [navigation, record, router]);

  if (loading || !record) {
    return (
      <Screen scroll={false}>
        {isTablet && <BackLink onPress={() => router.back()} />}
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.accent.default} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {isTablet && <BackLink onPress={() => router.back()} />}
      <DrillPlayer drill={record.data} />
      <Text variant="title" style={s.title}>
        {record.name || 'Sans titre'}
      </Text>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: t.space.lg },
}));
