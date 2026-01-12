'use client';

import { useState, useEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';

interface SessionPart {
  id: string;
  type: 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu';
  duration: number; // en minutes
  procedureId?: string | null;
}

interface DurationSliderProps {
  totalDuration: number; // durée totale en minutes
  parts: SessionPart[];
  onPartsChange: (parts: SessionPart[]) => void;
  colors: {
    Echauffement: string;
    Exercice: string;
    Situation: string;
    Jeu: string;
  };
}

export function DurationSlider({ totalDuration, parts, onPartsChange, colors }: DurationSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [startX, setStartX] = useState(0);
  const [startDurations, setStartDurations] = useState<number[]>([]);

  // Calculer les positions des poignées en pourcentage (aux frontières entre segments)
  const calculatePositions = () => {
    let cumulative = 0;
    const positions: number[] = [];
    
    // Les poignées sont positionnées à la fin de chaque segment (sauf le dernier)
    parts.forEach((part, index) => {
      cumulative += part.duration;
      if (index < parts.length - 1) {
        positions.push((cumulative / totalDuration) * 100);
      }
    });
    
    return positions;
  };

  const positions = calculatePositions();

  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    setDraggingIndex(index);
    setStartX(e.clientX);
    setStartDurations(parts.map(p => p.duration));
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (draggingIndex === null || !sliderRef.current) return;

    const sliderRect = sliderRef.current.getBoundingClientRect();
    const sliderWidth = sliderRect.width;
    const deltaX = e.clientX - startX;
    const deltaPercent = (deltaX / sliderWidth) * 100;
    const deltaMinutes = (deltaPercent / 100) * totalDuration;

    const newDurations = [...startDurations];
    
    if (draggingIndex === 0) {
      // Première poignée : ajuste la durée de la première partie
      const newDuration = Math.max(5, Math.min(startDurations[0] + deltaMinutes, totalDuration - 10));
      newDurations[0] = newDuration;
      newDurations[1] = totalDuration - newDuration - newDurations.slice(2).reduce((a, b) => a + b, 0);
    } else if (draggingIndex === parts.length - 2) {
      // Dernière poignée : ajuste la durée de la dernière partie
      const newDuration = Math.max(5, Math.min(startDurations[parts.length - 1] + deltaMinutes, totalDuration - 10));
      newDurations[parts.length - 1] = newDuration;
      newDurations[parts.length - 2] = totalDuration - newDuration - newDurations.slice(0, parts.length - 2).reduce((a, b) => a + b, 0);
    } else {
      // Poignée intermédiaire : ajuste les deux parties adjacentes
      const leftPart = draggingIndex;
      const rightPart = draggingIndex + 1;
      const totalAdjacent = startDurations[leftPart] + startDurations[rightPart];
      
      const newLeftDuration = Math.max(5, Math.min(startDurations[leftPart] + deltaMinutes, totalAdjacent - 5));
      const newRightDuration = totalAdjacent - newLeftDuration;
      
      newDurations[leftPart] = newLeftDuration;
      newDurations[rightPart] = newRightDuration;
    }

    // Vérifier que la somme est correcte
    const sum = newDurations.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - totalDuration) > 0.1) {
      const diff = totalDuration - sum;
      newDurations[newDurations.length - 1] += diff;
    }

    const updatedParts = parts.map((part, index) => ({
      ...part,
      duration: Math.round(newDurations[index] * 10) / 10
    }));

    onPartsChange(updatedParts);
  };

  const handleMouseUp = () => {
    setDraggingIndex(null);
  };

  useEffect(() => {
    if (draggingIndex !== null) {
      const handleMove = (e: MouseEvent) => handleMouseMove(e);
      const handleUp = () => handleMouseUp();
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      return () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };
    }
  }, [draggingIndex, startX, startDurations, parts, totalDuration]);

  return (
    <div className="w-full">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Ajustez ici la durée de chaque partie de la séance
        </h3>
        <div
          ref={sliderRef}
          className="relative h-12 bg-gray-200 rounded-lg overflow-hidden cursor-pointer"
          style={{ position: 'relative' }}
        >
          {parts.map((part, index) => {
            // Calculer la position de début en additionnant les durées des segments précédents
            const startTime = parts.slice(0, index).reduce((sum, p) => sum + p.duration, 0);
            const leftPercent = (startTime / totalDuration) * 100;
            const width = (part.duration / totalDuration) * 100;

            return (
              <div
                key={part.id}
                className="absolute h-full flex items-center justify-center"
                style={{
                  left: `${leftPercent}%`,
                  width: `${width}%`,
                  backgroundColor: colors[part.type],
                  opacity: 0.7
                }}
              >
                <span className="text-xs font-medium text-white px-2">
                  {part.type} (~{Math.round(part.duration)}mn)
                </span>
              </div>
            );
          })}

          {/* Poignées de drag */}
          {positions.slice(1).map((position, index) => (
            <div
              key={`handle-${index}`}
              className="absolute top-0 bottom-0 w-2 cursor-ew-resize z-10 flex items-center justify-center"
              style={{
                left: `${position}%`,
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0, 0, 0, 0.3)'
              }}
              onMouseDown={(e) => handleMouseDown(index, e)}
            >
              <GripVertical className="h-6 w-6 text-white" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
