'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlayerPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/webapp/player/calendar');
  }, [router]);

  return (
    <div className="p-6 flex items-center justify-center min-h-[40vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
    </div>
  );
}
