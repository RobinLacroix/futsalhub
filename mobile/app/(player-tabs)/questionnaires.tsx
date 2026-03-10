import { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getMyPendingFeedbackTokens, type MyPendingFeedbackRow } from '../../lib/services/playerConvocations';

export default function PlayerQuestionnairesScreen() {
  const [items, setItems] = useState<MyPendingFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getMyPendingFeedbackTokens();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openQuestionnaire = useCallback(async (row: MyPendingFeedbackRow) => {
    const base = (process.env.EXPO_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
    let url: string;
    if (row.url.startsWith('http')) {
      url = row.url;
    } else {
      const path = row.url.startsWith('/') ? row.url : `/${row.url}`;
      url = base ? `${base}${path}` : '';
    }
    if (!url || !url.startsWith('http')) {
      Alert.alert(
        'Configuration',
        'L’URL du site (EXPO_PUBLIC_SITE_URL) n’est pas définie. Ajoutez-la dans mobile/.env pour ouvrir les questionnaires.'
      );
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Erreur', 'Impossible d’ouvrir le questionnaire. Vérifiez que l’URL du site est correcte dans .env.');
    }
  }, []);

  if (loading && items.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.training_id + item.token}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#16a34a']} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucun questionnaire en attente</Text>
          </View>
        }
        renderItem={({ item }) => {
          let dateLabel = '';
          try {
            dateLabel = format(parseISO(item.training_date), "EEEE d MMMM yyyy", { locale: fr });
          } catch {
            dateLabel = item.training_date;
          }
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => openQuestionnaire(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.theme}>{item.theme || 'Séance'}</Text>
              <Text style={styles.date}>{dateLabel}</Text>
              <Text style={styles.cta}>Remplir le questionnaire →</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBox: { backgroundColor: '#fef2f2', padding: 12, margin: 16 },
  errorText: { color: '#dc2626', fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 32 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#6b7280' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
  },
  theme: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  date: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  cta: { fontSize: 14, color: '#16a34a', fontWeight: '600' },
});
