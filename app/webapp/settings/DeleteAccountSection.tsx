'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { deleteOwnAccount } from '@/lib/services';

/**
 * Visible pour tout utilisateur connecté (joueur, coach, admin), pas seulement les admins de
 * club — contrairement à la "Zone dangereuse" club plus haut sur cette page. Suppression de
 * compte requise pour la conformité App Store / Play Store.
 */
export function DeleteAccountSection() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [input, setInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (input !== 'SUPPRIMER') return;
    setDeleting(true);
    setError(null);
    const result = await deleteOwnAccount();
    if (!result.ok) {
      setDeleting(false);
      if ('clubName' in result) {
        setError(
          `Vous êtes le seul administrateur de "${result.clubName}". Promouvez un autre membre administrateur, ou supprimez le club, avant de supprimer votre compte.`
        );
      } else {
        setError('Une erreur est survenue. Réessayez.');
      }
      return;
    }
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <div className="fm-card" style={{ borderColor: '#FECACA' }}>
      <div className="fm-card-header" style={{ background: '#FEF2F2' }}>
        <div className="fm-card-accent fm-card-accent-red" />
        <div className="fm-card-title" style={{ color: '#DC2626' }}>Mon compte</div>
      </div>
      <div className="fm-card-body">
        <p style={{ color: '#6B7280', fontSize: '0.8125rem', marginBottom: 16 }}>
          La suppression de votre compte est définitive et irréversible : votre identité de
          connexion et vos données personnelles sont effacées. Tapez <strong>SUPPRIMER</strong> pour
          confirmer.
        </p>
        {error && (
          <div className="fm-alert fm-alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        {show ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="SUPPRIMER"
              className="fm-input"
              style={{ maxWidth: 200, fontFamily: 'monospace', letterSpacing: '0.08em' }}
              disabled={deleting}
            />
            <button
              onClick={handleDelete}
              disabled={input !== 'SUPPRIMER' || deleting}
              className="fm-btn fm-btn-danger"
            >
              {deleting ? 'Suppression...' : 'Confirmer la suppression'}
            </button>
            <button
              onClick={() => { setShow(false); setInput(''); setError(null); }}
              className="fm-btn fm-btn-ghost"
              disabled={deleting}
            >
              Annuler
            </button>
          </div>
        ) : (
          <button onClick={() => setShow(true)} className="fm-btn fm-btn-outline-danger">
            Supprimer mon compte
          </button>
        )}
      </div>
    </div>
  );
}
