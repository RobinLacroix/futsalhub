'use client';

import type { SchematicElement, ZoneElement, LineElement } from '@/types/schematics';

interface DimensionLabelsProps {
  element: SchematicElement;
  scale: number;
}

export function DimensionLabels({ element, scale }: DimensionLabelsProps) {
  if (element.type === 'rectangle') {
    const rect = element as ZoneElement;
    const centerX = (rect.x + rect.width / 2) * scale;
    const centerY = (rect.y + rect.height / 2) * scale;
    const rotation = rect.rotation || 0;
    
    // Pour les rotations de 90° ou 270°, échanger largeur et hauteur visuellement
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const isRotated90or270 = normalizedRotation === 90 || normalizedRotation === 270;
    const displayWidth = isRotated90or270 ? rect.height : rect.width;
    const displayHeight = isRotated90or270 ? rect.width : rect.height;

    return (
      <g transform={`translate(${centerX}, ${centerY}) rotate(${rotation}) translate(${-centerX}, ${-centerY})`}>
        {/* Label pour la largeur (toujours horizontal par rapport à l'élément) */}
        <text
          x={centerX}
          y={(rect.y - 0.5) * scale}
          fill="#3B82F6"
          fontSize={12}
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {displayWidth.toFixed(1)}m
        </text>
        {/* Label pour la hauteur (toujours vertical par rapport à l'élément) */}
        <text
          x={(rect.x + rect.width + 1) * scale}
          y={centerY}
          fill="#3B82F6"
          fontSize={12}
          textAnchor="start"
          dominantBaseline="middle"
          fontWeight="bold"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {displayHeight.toFixed(1)}m
        </text>
      </g>
    );
  }

  if (element.type === 'circle') {
    const circle = element as ZoneElement;
    const centerX = (circle.x + circle.width / 2) * scale;
    const centerY = (circle.y + circle.height / 2) * scale;
    const radius = circle.width / 2;
    const rotation = circle.rotation || 0;

    return (
      <g transform={`translate(${centerX}, ${centerY}) rotate(${rotation}) translate(${-centerX}, ${-centerY})`}>
        {/* Label pour le rayon */}
        <text
          x={centerX}
          y={(circle.y - 0.5) * scale}
          fill="#3B82F6"
          fontSize={12}
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          r: {radius.toFixed(1)}m
        </text>
        {/* Label pour le diamètre */}
        <text
          x={centerX}
          y={(circle.y + circle.height + 0.5) * scale}
          fill="#3B82F6"
          fontSize={12}
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          ⌀: {circle.width.toFixed(1)}m
        </text>
      </g>
    );
  }

  if (element.type === 'triangle') {
    const triangle = element as ZoneElement;
    const points = triangle.points || [
      { x: triangle.x, y: triangle.y + triangle.height },
      { x: triangle.x + triangle.width / 2, y: triangle.y },
      { x: triangle.x + triangle.width, y: triangle.y + triangle.height }
    ];
    // Calculer le centre du triangle pour la rotation
    const centerX = ((points[0].x + points[1].x + points[2].x) / 3) * scale;
    const centerY = ((points[0].y + points[1].y + points[2].y) / 3) * scale;
    const rotation = triangle.rotation || 0;
    
    // Pour les rotations de 90° ou 270°, échanger largeur et hauteur visuellement
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const isRotated90or270 = normalizedRotation === 90 || normalizedRotation === 270;
    const displayWidth = isRotated90or270 ? triangle.height : triangle.width;
    const displayHeight = isRotated90or270 ? triangle.width : triangle.height;

    return (
      <g transform={`translate(${centerX}, ${centerY}) rotate(${rotation}) translate(${-centerX}, ${-centerY})`}>
        {/* Label pour la largeur (toujours horizontal par rapport à l'élément) */}
        <text
          x={(triangle.x + triangle.width / 2) * scale}
          y={(triangle.y - 0.5) * scale}
          fill="#3B82F6"
          fontSize={12}
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {displayWidth.toFixed(1)}m
        </text>
        {/* Label pour la hauteur (toujours vertical par rapport à l'élément) */}
        <text
          x={(triangle.x + triangle.width + 1.5) * scale}
          y={(triangle.y + triangle.height / 2) * scale}
          fill="#3B82F6"
          fontSize={12}
          textAnchor="start"
          dominantBaseline="middle"
          fontWeight="bold"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {displayHeight.toFixed(1)}m
        </text>
      </g>
    );
  }

  if (element.type === 'line' || element.type === 'arrow') {
    const line = element as LineElement;
    let centerX: number;
    let centerY: number;
    let length: number;
    
    if (line.isCurved && line.controlPoint) {
      // Pour une ligne courbe, calculer approximativement la longueur de la courbe
      // Approximation : longueur de la courbe quadratique
      const p0 = { x: line.x, y: line.y };
      const p1 = line.controlPoint;
      const p2 = { x: line.endX, y: line.endY };
      
      // Approximation de la longueur d'une courbe quadratique
      const dx1 = p1.x - p0.x;
      const dy1 = p1.y - p0.y;
      const dx2 = p2.x - p1.x;
      const dy2 = p2.y - p1.y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      length = (len1 + len2) / 2; // Approximation simple
      
      // Centre approximatif de la courbe
      centerX = ((p0.x + p1.x + p2.x) / 3) * scale;
      centerY = ((p0.y + p1.y + p2.y) / 3) * scale;
    } else {
      centerX = ((line.x + line.endX) / 2) * scale;
      centerY = ((line.y + line.endY) / 2) * scale;
      length = Math.sqrt(
        Math.pow(line.endX - line.x, 2) + Math.pow(line.endY - line.y, 2)
      );
    }

    return (
      <g>
        {/* Label pour la longueur */}
        <text
          x={centerX}
          y={centerY - 10}
          fill="#3B82F6"
          fontSize={12}
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {length.toFixed(1)}m
        </text>
      </g>
    );
  }

  return null;
}

