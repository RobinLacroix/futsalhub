import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

console.log('=== SUPABASE CLIENT INITIALIZATION ===');
console.log('Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'SET' : 'NOT SET');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'SET' : 'NOT SET');
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Anon Key:', supabaseAnonKey?.substring(0, 20) + '...');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ MISSING SUPABASE ENVIRONMENT VARIABLES');
  console.error('This will cause the app to fail on Vercel');
} else {
  console.log('✅ Supabase environment variables are set');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log('Supabase client created:', supabase);
console.log('=== END SUPABASE CLIENT INITIALIZATION ===');