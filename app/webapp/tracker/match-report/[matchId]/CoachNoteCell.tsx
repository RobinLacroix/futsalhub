'use client'

import { useState } from 'react'

// Volet C : note staff /10 (subjective, coach), staff-only. Grille de tap, pas de 0.5.
// Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md

const ROW_1 = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const ROW_2 = [5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

function noteColor(note: number): string {
  if (note >= 8) return '#059669'
  if (note >= 6.5) return '#34D399'
  if (note >= 4.5) return '#6B7280'
  if (note >= 3) return '#F97316'
  return '#EF4444'
}

function formatNote(n: number) {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)
}

interface CoachNoteCellProps {
  value: number | null
  onChange: (note: number | null) => void
  disabled?: boolean
}

export function CoachNoteCell({ value, onChange, disabled }: CoachNoteCellProps) {
  const [open, setOpen] = useState(false)

  function pick(n: number) {
    onChange(n)
    setOpen(false)
  }

  return (
    <div className="relative inline-block print:hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="inline-flex items-center justify-center min-w-[2.4rem] px-2 py-0.5 rounded-md text-xs font-bold tabular-nums border border-dashed disabled:opacity-40"
        style={
          value !== null
            ? { backgroundColor: noteColor(value), color: '#fff', borderColor: 'transparent' }
            : { color: '#9CA3AF', borderColor: '#D1D5DB' }
        }
      >
        {value !== null ? value.toFixed(1) : '—'}
      </button>

      {open && (
        <>
          {/* Zone de fermeture au clic extérieur */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-xl p-2 w-[260px]">
            <div className="grid grid-cols-10 gap-1">
              {ROW_1.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pick(n)}
                  className="h-6 rounded text-[9px] font-bold flex items-center justify-center hover:opacity-80"
                  style={
                    value === n
                      ? { backgroundColor: noteColor(n), color: '#fff' }
                      : { color: '#374151', backgroundColor: '#F3F4F6' }
                  }
                >
                  {formatNote(n)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-10 gap-1 mt-1">
              {ROW_2.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pick(n)}
                  className="h-6 rounded text-[9px] font-bold flex items-center justify-center hover:opacity-80"
                  style={
                    value === n
                      ? { backgroundColor: noteColor(n), color: '#fff' }
                      : { color: '#374151', backgroundColor: '#F3F4F6' }
                  }
                >
                  {formatNote(n)}
                </button>
              ))}
            </div>
            {value !== null && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false) }}
                className="mt-2 w-full text-[10px] text-gray-400 hover:text-red-500 text-center"
              >
                Effacer
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
