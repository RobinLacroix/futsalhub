'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Club, ClubMember } from '@/types';

interface ClubWithMembers extends Club {
  members?: (ClubMember & { email?: string })[];
  teams?: { id: string; name: string; category: string; level: string; color: string }[];
}

export function useUserClub() {
  const [club, setClub] = useState<ClubWithMembers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClub = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: clubId, error: rpcError } = await supabase.rpc('get_user_club_id');
      if (rpcError) throw rpcError;
      if (!clubId) {
        setClub(null);
        return;
      }
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .single();
      if (clubError) throw clubError;
      setClub(clubData as ClubWithMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setClub(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClub();
  }, []);

  return { club, loading, error, refetch: fetchClub };
}
