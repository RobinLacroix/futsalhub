'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
  useEffect(() => {
    console.log('Supabase:', supabase);
  }, []);

  return (
    <main>
      <h1 className="text-2xl font-bold">Hello FutsalHub!</h1>
    </main>
  );
}