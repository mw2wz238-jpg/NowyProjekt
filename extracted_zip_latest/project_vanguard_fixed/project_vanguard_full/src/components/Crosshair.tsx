import React from 'react';
import { CrosshairSettings } from '../settings';
import { CROSSHAIR_COLORS } from './crosshairColors';

interface CrosshairProps {
  settings: CrosshairSettings;
  preview?: boolean;
}

export const Crosshair: React.FC<CrosshairProps> = ({ settings, preview = false }) => {
  if (!settings.enabled) return null;
  const color = CROSSHAIR_COLORS[settings.color];
  const armSize = settings.size;
  const gap = settings.gap;
  const thickness = Math.max(1.5, armSize * 0.08);
  const commonStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: color,
    boxShadow: `0 0 5px ${color}`,
  };

  return (
    <div
      className={
        preview
          ? 'pointer-events-none relative z-10'
          : 'pointer-events-none absolute left-1/2 top-1/2 z-10'
      }
      style={{ width: 0, height: 0 }}
      role={preview ? 'img' : undefined}
      aria-label={preview ? 'Podgląd celownika' : undefined}
      aria-hidden={preview ? undefined : true}
    >
      <span
        style={{
          ...commonStyle,
          width: thickness,
          height: armSize,
          left: -thickness / 2,
          bottom: gap,
        }}
      />
      <span
        style={{
          ...commonStyle,
          width: thickness,
          height: armSize,
          left: -thickness / 2,
          top: gap,
        }}
      />
      <span
        style={{
          ...commonStyle,
          width: armSize,
          height: thickness,
          top: -thickness / 2,
          right: gap,
        }}
      />
      <span
        style={{
          ...commonStyle,
          width: armSize,
          height: thickness,
          top: -thickness / 2,
          left: gap,
        }}
      />
      {settings.showCenterDot && (
        <span
          style={{
            ...commonStyle,
            width: 3,
            height: 3,
            borderRadius: '50%',
            left: -1.5,
            top: -1.5,
          }}
        />
      )}
    </div>
  );
};
