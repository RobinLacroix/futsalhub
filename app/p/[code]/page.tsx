// Page de consultation publique d'un procédé (sans authentification)
// Server Component — pas de 'use client'

import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

// ─── Supabase (anon key, lecture seule) ───────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface TrainingProcedure {
  id: string;
  title: string;
  objectives: string;
  instructions: string;
  variants?: string | null;
  corrections?: string | null;
  bloc?: string | null;
  principe?: string | null;
  phase?: string | null;
  rapport_numerique?: string | null;
  share_code?: string | null;
  min_players?: number | null;
  field_dimensions?: string | null;
  duration_minutes?: number | null;
  schematic_id?: string | null;
}

const BLOCS = [
  { value: 'Échauffement',      color: '#ea580c', bg: '#FFF7ED' },
  { value: 'Problématisation',  color: '#2563eb', bg: '#EFF6FF' },
  { value: 'Situation isolée',  color: '#16a34a', bg: '#F0FDF4' },
  { value: 'Analytique',        color: '#6b7280', bg: '#F9FAFB' },
  { value: 'Jeu orienté',       color: '#7c3aed', bg: '#F5F3FF' },
  { value: 'Match libre',       color: '#d97706', bg: '#FFFBEB' },
];

function getBlocStyle(bloc?: string | null) {
  const found = BLOCS.find((b) => b.value === bloc);
  if (!found) return null;
  return found;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function PublicProcedurePage({
  params,
}: {
  params: { code: string };
}) {
  const { code } = params;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('training_procedures')
    .select('*')
    .eq('share_code', code)
    .is('archived_at', null)
    .single();

  if (error || !data) {
    return (
      <div
        style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
          <h1 style={{ color: '#1A2332', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Lien invalide ou expiré
          </h1>
          <p style={{ color: '#697585', fontSize: '0.875rem' }}>
            Ce procédé n&apos;existe pas ou son lien de partage a été révoqué.
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              marginTop: '1.5rem',
              padding: '0.5rem 1.25rem',
              backgroundColor: '#3B82F6',
              color: '#fff',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Retour à FutsalHub
          </a>
        </div>
      </div>
    );
  }

  const procedure = data as TrainingProcedure;
  const blocStyle = getBlocStyle(procedure.bloc);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F8FAFC',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #DDE1EA',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ color: '#3B82F6', fontWeight: 800, fontSize: '1.125rem', letterSpacing: '-0.02em' }}>
            FutsalHub
          </span>
        </a>
        {blocStyle && (
          <span
            style={{
              backgroundColor: blocStyle.bg,
              color: blocStyle.color,
              border: `1px solid ${blocStyle.color}33`,
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {procedure.bloc}
          </span>
        )}
      </header>

      {/* Main */}
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem 1rem 4rem' }}>
        {/* Title block */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1
            style={{
              color: '#1A2332',
              fontSize: 'clamp(1.5rem, 4vw, 2rem)',
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: '0.75rem',
            }}
          >
            {procedure.title}
          </h1>

          {/* Sub-badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            {procedure.principe && (
              <span
                style={{
                  backgroundColor: '#F1F5F9',
                  color: '#697585',
                  border: '1px solid #DDE1EA',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                }}
              >
                {procedure.principe}
              </span>
            )}
            {procedure.phase && (
              <span
                style={{
                  backgroundColor: '#EFF6FF',
                  color: '#3B82F6',
                  border: '1px solid #BFDBFE',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Phase {procedure.phase}
              </span>
            )}
            {procedure.rapport_numerique && (
              <span
                style={{
                  backgroundColor: '#F9FAFB',
                  color: '#697585',
                  border: '1px solid #DDE1EA',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                }}
              >
                {procedure.rapport_numerique}
              </span>
            )}
            {procedure.duration_minutes && (
              <span
                style={{
                  backgroundColor: '#F9FAFB',
                  color: '#697585',
                  border: '1px solid #DDE1EA',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                }}
              >
                {procedure.duration_minutes} min
              </span>
            )}
            {procedure.min_players && (
              <span
                style={{
                  backgroundColor: '#F9FAFB',
                  color: '#697585',
                  border: '1px solid #DDE1EA',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                }}
              >
                {procedure.min_players} joueurs min.
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <hr style={{ borderColor: '#DDE1EA', marginBottom: '1.5rem' }} />

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Objectifs */}
          <section>
            <h2
              style={{
                color: '#697585',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '0.5rem',
              }}
            >
              Objectifs
            </h2>
            <p style={{ color: '#1A2332', fontSize: '0.9375rem', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
              {procedure.objectives}
            </p>
          </section>

          {/* Consignes */}
          <section>
            <h2
              style={{
                color: '#697585',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '0.5rem',
              }}
            >
              Consignes &amp; Règles
            </h2>
            <p style={{ color: '#1A2332', fontSize: '0.9375rem', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
              {procedure.instructions}
            </p>
          </section>

          {/* Variantes */}
          {procedure.variants && (
            <section>
              <h2
                style={{
                  color: '#697585',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.5rem',
                }}
              >
                Variantes
              </h2>
              <p style={{ color: '#1A2332', fontSize: '0.9375rem', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                {procedure.variants}
              </p>
            </section>
          )}

          {/* Correctifs */}
          {procedure.corrections && (
            <section>
              <h2
                style={{
                  color: '#697585',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.5rem',
                }}
              >
                Correctifs / Comportements attendus
              </h2>
              <p style={{ color: '#1A2332', fontSize: '0.9375rem', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                {procedure.corrections}
              </p>
            </section>
          )}

          {/* Infos pratiques */}
          {(procedure.field_dimensions || procedure.duration_minutes || procedure.min_players) && (
            <section>
              <h2
                style={{
                  color: '#697585',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.75rem',
                }}
              >
                Informations pratiques
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                {procedure.field_dimensions && (
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #DDE1EA',
                      borderRadius: '0.75rem',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    <div style={{ color: '#697585', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Terrain
                    </div>
                    <div style={{ color: '#1A2332', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
                      {procedure.field_dimensions}
                    </div>
                  </div>
                )}
                {procedure.duration_minutes && (
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #DDE1EA',
                      borderRadius: '0.75rem',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    <div style={{ color: '#697585', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Durée
                    </div>
                    <div style={{ color: '#1A2332', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
                      {procedure.duration_minutes} min
                    </div>
                  </div>
                )}
                {procedure.min_players && (
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #DDE1EA',
                      borderRadius: '0.75rem',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    <div style={{ color: '#697585', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Joueurs min.
                    </div>
                    <div style={{ color: '#1A2332', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
                      {procedure.min_players}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid #DDE1EA',
          backgroundColor: '#FFFFFF',
          padding: '1.25rem 1.5rem',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#697585', fontSize: '0.8125rem' }}>
          Créé avec{' '}
          <a
            href="/"
            style={{ color: '#3B82F6', fontWeight: 600, textDecoration: 'none' }}
          >
            FutsalHub
          </a>{' '}
          — la plateforme des coachs de futsal
        </p>
      </footer>
    </div>
  );
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: {
  params: { code: string };
}) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('training_procedures')
    .select('title, objectives, bloc')
    .eq('share_code', params.code)
    .single();

  if (!data) {
    return { title: 'Procédé introuvable — FutsalHub' };
  }

  return {
    title: `${data.title} — FutsalHub`,
    description: data.objectives?.slice(0, 160) ?? 'Fiche de procédé d\'entraînement de futsal.',
    openGraph: {
      title: data.title,
      description: data.objectives?.slice(0, 160),
      siteName: 'FutsalHub',
    },
  };
}
