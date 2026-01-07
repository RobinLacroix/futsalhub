'use client';

import type { SchematicElement, ZoneElement, LineElement, Position } from '@/types/schematics';

interface ResizeHandlesProps {
  element: SchematicElement;
  scale: number;
  onHandleMouseDown: (handleType: string, e: React.MouseEvent) => void;
}

export function ResizeHandles({ element, scale, onHandleMouseDown }: ResizeHandlesProps) {
  const handleSize = 8;
  const handleStyle = {
    fill: '#3B82F6',
    stroke: '#ffffff',
    strokeWidth: 2,
    cursor: 'pointer',
  };

  const renderHandle = (x: number, y: number, cursor: string, handleType: string) => (
    <circle
      key={handleType}
      cx={x * scale}
      cy={y * scale}
      r={handleSize / 2}
      {...handleStyle}
      style={{ ...handleStyle.style, cursor }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onHandleMouseDown(handleType, e);
      }}
    />
  );

  if (element.type === 'rectangle') {
    const rect = element as ZoneElement;
    const x = rect.x;
    const y = rect.y;
    const width = rect.width;
    const height = rect.height;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const rotation = rect.rotation || 0;

    return (
      <g transform={`translate(${centerX * scale}, ${centerY * scale}) rotate(${rotation}) translate(${-centerX * scale}, ${-centerY * scale})`}>
        {/* Coins */}
        {renderHandle(x, y, 'nwse-resize', 'nw')}
        {renderHandle(x + width, y, 'nesw-resize', 'ne')}
        {renderHandle(x + width, y + height, 'nwse-resize', 'se')}
        {renderHandle(x, y + height, 'nesw-resize', 'sw')}
        {/* Milieux */}
        {renderHandle(centerX, y, 'ns-resize', 'n')}
        {renderHandle(x + width, centerY, 'ew-resize', 'e')}
        {renderHandle(centerX, y + height, 'ns-resize', 's')}
        {renderHandle(x, centerY, 'ew-resize', 'w')}
      </g>
    );
  }

  if (element.type === 'circle') {
    const circle = element as ZoneElement;
    const centerX = circle.x + circle.width / 2;
    const centerY = circle.y + circle.height / 2;
    const radius = circle.width / 2;
    const rotation = circle.rotation || 0;

    return (
      <g transform={`translate(${centerX * scale}, ${centerY * scale}) rotate(${rotation}) translate(${-centerX * scale}, ${-centerY * scale})`}>
        {renderHandle(centerX, centerY - radius, 'ns-resize', 'n')}
        {renderHandle(centerX + radius, centerY, 'ew-resize', 'e')}
        {renderHandle(centerX, centerY + radius, 'ns-resize', 's')}
        {renderHandle(centerX - radius, centerY, 'ew-resize', 'w')}
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
    const centerX = (points[0].x + points[1].x + points[2].x) / 3;
    const centerY = (points[0].y + points[1].y + points[2].y) / 3;
    const rotation = triangle.rotation || 0;

    return (
      <g transform={`translate(${centerX * scale}, ${centerY * scale}) rotate(${rotation}) translate(${-centerX * scale}, ${-centerY * scale})`}>
        {points.map((point, index) => 
          renderHandle(point.x, point.y, 'move', `vertex-${index}`)
        )}
      </g>
    );
  }

  if (element.type === 'line' || element.type === 'arrow') {
    const line = element as LineElement;
    // Calculer le point au milieu de la ligne
    const midX = (line.x + line.endX) / 2;
    const midY = (line.y + line.endY) / 2;
    // Si la ligne est courbe, utiliser le point de contrôle, sinon utiliser le milieu
    const controlX = line.controlPoint ? line.controlPoint.x : midX;
    const controlY = line.controlPoint ? line.controlPoint.y : midY;
    
    return (
      <g>
        {renderHandle(line.x, line.y, 'move', 'start')}
        {renderHandle(line.endX, line.endY, 'move', 'end')}
        {/* Point de contrôle au milieu pour courber */}
        <circle
          cx={controlX * scale}
          cy={controlY * scale}
          r={handleSize / 2}
          fill="#FFC107"
          stroke="#ffffff"
          strokeWidth={2}
          style={{ cursor: 'move' }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onHandleMouseDown('control', e);
          }}
        />
      </g>
    );
  }

  return null;
}

