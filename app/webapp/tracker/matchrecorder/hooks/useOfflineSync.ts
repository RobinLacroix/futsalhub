import { useEffect, useState } from 'react';
import type { MatchData, LocalMatchEvent, LocalMatchSnapshot } from '../types';
import { insertMatchEvent } from '../data';

/**
 * Gère la persistance locale (localStorage) des événements de match et leur
 * synchronisation vers Supabase quand la connexion est disponible.
 *
 * - Charge les données locales au montage (purge > 7 jours).
 * - Sauvegarde un snapshot complet à chaque événement.
 * - Synchronise automatiquement les événements non synchronisés au retour en ligne.
 */
export function useOfflineSync(matchData: MatchData, isOnline: boolean) {
  const [localEvents, setLocalEvents] = useState<LocalMatchEvent[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);

  const saveToLocalStorage = (event?: LocalMatchEvent) => {
    try {
      if (!matchData.selectedMatch) return;

      // Ajouter le nouvel événement s'il existe
      const updatedEvents = [...localEvents];
      if (event) {
        updatedEvents.push(event);
        setLocalEvents(updatedEvents);
      }

      // Créer un snapshot complet
      const snapshot: LocalMatchSnapshot = {
        match_id: matchData.selectedMatch.id,
        timestamp: new Date().toISOString(),
        matchData: matchData,
        events: updatedEvents,
        lastSavedAt: new Date().toISOString()
      };

      // Sauvegarder dans localStorage
      localStorage.setItem('matchRecorder_localData', JSON.stringify(snapshot));
      console.log('💾 Données sauvegardées localement:', {
        matchId: snapshot.match_id,
        eventsCount: snapshot.events.length,
        timestamp: snapshot.lastSavedAt
      });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde locale:', error);
    }
  };

  const syncLocalData = async () => {
    if (!matchData.selectedMatch || localEvents.length === 0) {
      console.log('Aucune donnée à synchroniser');
      return;
    }

    // Filtrer les événements non synchronisés
    const unsyncedEvents = localEvents.filter(event => !event.synced);

    if (unsyncedEvents.length === 0) {
      console.log('Tous les événements sont déjà synchronisés');
      return;
    }

    setIsSyncing(true);
    console.log(`🔄 Synchronisation de ${unsyncedEvents.length} événements...`);

    try {
      // Tenter de sauvegarder chaque événement non synchronisé
      for (const event of unsyncedEvents) {
        const { error } = await insertMatchEvent({
          match_id: event.match_id,
          event_type: event.event_type,
          match_time_seconds: event.match_time_seconds,
          half: event.half,
          player_id: event.player_id,
          players_on_field: event.players_on_field ?? []
        });

        if (!error) {
          // Marquer comme synchronisé dans la liste locale
          const updatedEvents = localEvents.map(e =>
            e.id === event.id ? { ...e, synced: true } : e
          );
          setLocalEvents(updatedEvents);

          // Mettre à jour localStorage
          const snapshot: LocalMatchSnapshot = {
            match_id: matchData.selectedMatch.id,
            timestamp: new Date().toISOString(),
            matchData: matchData,
            events: updatedEvents,
            lastSavedAt: new Date().toISOString()
          };
          localStorage.setItem('matchRecorder_localData', JSON.stringify(snapshot));
          console.log(`✅ Événement ${event.id} synchronisé`);
        } else {
          break; // Arrêter si erreur
        }
      }

      // Nettoyer les événements synchronisés après un délai
      const allSynced = localEvents.every(e => e.synced);
      if (allSynced) {
        console.log('✅ Tous les événements sont synchronisés');
        setTimeout(() => {
          localStorage.removeItem('matchRecorder_localData');
          setLocalEvents([]);
        }, 5000);
      }

      setLastSyncTime(new Date().toISOString());
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Charger les données locales sauvegardées au démarrage
  useEffect(() => {
    const loadLocalData = () => {
      try {
        const savedData = localStorage.getItem('matchRecorder_localData');
        if (savedData) {
          const parsedData = JSON.parse(savedData) as LocalMatchSnapshot;
          console.log('📦 Données locales trouvées:', parsedData);

          // Vérifier si les données sont récentes (moins de 7 jours)
          const savedDate = new Date(parsedData.lastSavedAt);
          const daysSinceSave = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSinceSave < 7) {
            setLocalEvents(parsedData.events || []);
            console.log(`📦 ${parsedData.events.length} événements locaux chargés`);
          } else {
            console.log('🗑️ Données locales trop anciennes, suppression...');
            localStorage.removeItem('matchRecorder_localData');
          }
        }
      } catch (error) {
        console.error('Erreur lors du chargement des données locales:', error);
      }
    };

    loadLocalData();
  }, []);

  // Synchroniser automatiquement quand on revient en ligne avec des données non synchronisées
  useEffect(() => {
    if (isOnline && localEvents.length > 0 && !localEvents.every(e => e.synced) && !isSyncing && matchData.selectedMatch) {
      console.log('Auto-synchronisation des données locales...');
      syncLocalData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, localEvents.length, matchData.selectedMatch, isSyncing]);

  return { localEvents, isSyncing, saveToLocalStorage, syncLocalData };
}
