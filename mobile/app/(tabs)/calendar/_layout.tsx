import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useIsTablet } from '../../hooks/useIsTablet';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
  View,
  Pressable,
} from 'react-native';

function HeaderAddButton() {
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const addTraining = () => {
    closeMenu();
    router.push('/(tabs)/calendar/new');
  };
  const addMatch = () => {
    closeMenu();
    router.push('/(tabs)/calendar/new-match');
  };

  return (
    <>
      <TouchableOpacity
        style={styles.addButton}
        onPress={openMenu}
        activeOpacity={0.8}
      >
        <Text style={styles.addButtonText}>+</Text>
      </TouchableOpacity>
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <View style={styles.menuBox}>
            <TouchableOpacity style={styles.menuItem} onPress={addTraining} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>Entraînement</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={addMatch} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>Match</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function CalendarLayout() {
  const isTablet = useIsTablet();
  return (
    <Stack
      screenOptions={{
        headerShown: !isTablet,
        headerStyle: { backgroundColor: '#3b82f6' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Calendrier',
          headerRight: () => <HeaderAddButton />,
        }}
      />
      <Stack.Screen name="new" options={{ title: 'Nouvel entraînement' }} />
      <Stack.Screen name="new-match" options={{ title: 'Nouveau match' }} />
      <Stack.Screen name="training/[trainingId]" options={{ title: 'Entraînement' }} />
      <Stack.Screen name="training/edit/[trainingId]" options={{ title: "Modifier l'entraînement" }} />
      <Stack.Screen name="matchDetail/[matchId]" options={{ title: 'Match' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addButtonText: { color: '#fff', fontSize: 22, fontWeight: '600', lineHeight: 24 },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 200,
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuItemText: { fontSize: 16, color: '#111' },
});
