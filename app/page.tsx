'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
  useEffect(() => {
    console.log('Supabase:', supabase);
  }, []);

  return (
    <main>
      <a href="/signup" className="text-2xl font-bold">Hello FutsalHub!</a>
    </main>
  );
}