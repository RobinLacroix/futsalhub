'use client';

import type { SchematicElement } from '@/types/schematics';

interface SequenceTrajectoriesProps {
  previous: SchematicElement[];
  current: SchematicElement[];
  scale: number;
  svgWidth?: number;
  svgHeight?: number;
  fieldType?: 'futsal' | 'blank';
}

// Dimensions des terrains
const FUTSAL_LENGTH_M = 40;
const FUTSAL_WIDTH_M = 20;
const BLANK_LENGTH_M = 20;
const BLANK_WIDTH_M = 20;

export function SequenceTrajectories({
  previous,
  current,
  scale,
  svgWidth = 1000,
  svgHeight = 600,
  fieldType = 'futsal'
}: SequenceTrajectoriesProps) {
  const FIELD_LENGTH_M = fieldType === 'futsal' ? FUTSAL_LENGTH_M : BLANK_LENGTH_M;
  const FIELD_WIDTH_M = fieldType === 'futsal' ? FUTSAL_WIDTH_M : BLANK_WIDTH_M;
  const fieldLength = FIELD_LENGTH_M * scale;
  const fieldWidth = FIELD_WIDTH_M * scale;
  const offsetX = (svgWidth - fieldLength) / 2;
  const offsetY = (svgHeight - fieldWidth) / 2;

  const currentById = new Map<string, SchematicElement>();
  current.forEach(el => currentById.set(el.id, el));

  const getCenter = (el: SchematicElement): { x: number; y: number } | null => {
    switch (el.type) {
      case 'rectangle':
      case 'circle': {
        const zone: any = el;
        return {
          x: zone.x + (zone.width || 0) / 2,
          y: zone.y + (zone.height || 0) / 2
        };
      }
      case 'line':
      case 'arrow': {
        const line: any = el;
        return {
          x: (line.x + line.endX) / 2,
          y: (line.y + line.endY) / 2
        };
      }
      case 'player':
      case 'ball':
      case 'goal':
      case 'cone':
      case 'ladder':
        return { x: el.x, y: el.y };
      default:
        return null;
    }
  };

  // Rayon approximatif de l'élément (en mètres) pour couper la ligne à la bordure
  const getRadius = (el: SchematicElement): number => {
    switch (el.type) {
      case 'player':
      case 'goal':
      case 'cone':
      case 'ladder':
        return (el as any).size || 0.5;
      case 'ball':
        return ((el as any).size || 1) / 2;
      case 'rectangle':
      case 'circle': {
        const zone: any = el;
        const w = zone.width || 0;
        const h = zone.height || 0;
        // Rayon ~ demi-diagonale
        return Math.sqrt((w / 2) * (w / 2) + (h / 2) * (h / 2));
      }
      case 'line':
      case 'arrow':
        // Pour les lignes, garder le trait complet
        return 0;
      default:
        return 0;
    }
  };

  const paths: { x1: number; y1: number; x2: number; y2: number }[] = [];

  previous.forEach(prevEl => {
    const currEl = currentById.get(prevEl.id);
    if (!currEl) return;

    const c1 = getCenter(prevEl);
    const c2 = getCenter(currEl);
    if (!c1 || !c2) return;

    let dx = c2.x - c1.x;
    let dy = c2.y - c1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    // Normaliser
    dx /= dist;
    dy /= dist;

    const r1 = getRadius(prevEl);
    const r2 = getRadius(currEl);

    // Décaler le début et la fin pour que le trait commence/finisse à la bordure visuelle
    const startX = c1.x + dx * r1;
    const startY = c1.y + dy * r1;
    const endX = c2.x - dx * r2;
    const endY = c2.y - dy * r2;

    // Si après ajustement il n'y a plus de longueur, ne rien tracer
    const adjDx = endX - startX;
    const adjDy = endY - startY;
    const adjDist = Math.sqrt(adjDx * adjDx + adjDy * adjDy);
    if (adjDist <= 0.01) return;

    paths.push({
      x1: startX * scale + offsetX,
      y1: startY * scale + offsetY,
      x2: endX * scale + offsetX,
      y2: endY * scale + offsetY
    });
  });

  if (paths.length === 0) return null;

  return (
    <g>
      {paths.map((p, idx) => (
        <line
          key={idx}
          x1={p.x1}
          y1={p.y1}
          x2={p.x2}
          y2={p.y2}
          stroke="#F97316"
          strokeWidth={2}
          strokeDasharray="4,4"
          pointerEvents="none"
        />
      ))}
    </g>
  );
}


