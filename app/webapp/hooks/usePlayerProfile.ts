'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { playersService } from '@/lib/services/playersService';
import type { Player } from '@/types';

export function usePlayerProfile() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) {
        if (!cancelled) {
          setPlayer(null);
          setLoading(false);
        }
        return;
      }
      try {
        const p = await playersService.getPlayerByUserId(user.id);
        if (!cancelled) {
          setPlayer(p ?? null);
        }
      } catch {
        if (!cancelled) setPlayer(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { player, loading };
}
