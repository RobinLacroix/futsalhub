import * as Network from 'expo-network';

/** Réseau considéré indisponible pour parler à Supabase. */
export async function isDeviceOffline(): Promise<boolean> {
  try {
    const s = await Network.getNetworkStateAsync();
    if (s.isConnected === false) return true;
    if (s.isInternetReachable === false) return true;
    return false;
  } catch {
    return false;
  }
}

/** Erreur probable de connectivité (on peut mettre en file d’attente et réessayer). */
export function shouldTreatAsOfflineError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /network|fetch|Failed to fetch|timeout|ECONNREFUSED|ENOTFOUND|internet|offline|connexion|connection/i.test(msg);
}
