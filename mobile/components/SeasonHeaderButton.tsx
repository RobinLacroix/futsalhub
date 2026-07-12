import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';

/**
 * Sélecteur de saison compact pour les headers (fond bleu).
 * Affiche la saison active et ouvre un picker. À placer dans headerRight.
 */
export function SeasonHeaderButton({ variant = 'header' }: { variant?: 'header' | 'light' }) {
  const { activeSeason, clubSeason, availableSeasons, changeActiveSeason } = useActiveSeason();
  const [open, setOpen] = useState(false);
  const isPast = activeSeason !== clubSeason;
  const onPress = () => availableSeasons.length > 1 && setOpen(true);

  return (
    <>
      {variant === 'light' ? (
        <TouchableOpacity style={styles.lightBtn} onPress={onPress} activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={20} color={isPast ? '#d97706' : '#475569'} />
          <Text style={styles.lightText}>Saison {activeSeason}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.pill, isPast && styles.pillPast]}
          onPress={onPress}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={12} color={isPast ? '#fde68a' : '#fff'} />
          <Text style={styles.pillText}>{activeSeason}</Text>
          {availableSeasons.length > 1 && (
            <Ionicons name="chevron-down" size={11} color="rgba(255,255,255,0.85)" />
          )}
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.box}>
            <Text style={styles.title}>Choisir une saison</Text>
            {availableSeasons.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => { changeActiveSeason(s); setOpen(false); }}
                style={[styles.row, s === activeSeason && styles.rowActive]}
              >
                <Text style={[styles.rowText, s === activeSeason && { color: '#3b82f6', fontWeight: '700' }]}>{s}</Text>
                {s === clubSeason && <Text style={styles.activeTag}>ACTIVE</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginRight: 10,
  },
  pillPast: { backgroundColor: 'rgba(251,191,36,0.30)' },
  pillText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  lightBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, gap: 6 },
  lightText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  box: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 320 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 8 },
  rowActive: { backgroundColor: '#eff6ff' },
  rowText: { fontSize: 14, color: '#0f172a', fontWeight: '500' },
  activeTag: { fontSize: 9, fontWeight: '700', color: '#3b82f6', letterSpacing: 0.5 },
});
