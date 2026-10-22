import { GraphicsQuality } from '../settings';

export interface GraphicsProfile {
  quality: Exclude<GraphicsQuality, 'auto'>;
  resolutionScale: number;
  maxPixelRatio: number;
  shadowMapSize: number;
  shadowsEnabled: boolean;
}

const GRAPHICS_PROFILES: Record<Exclude<GraphicsQuality, 'auto'>, GraphicsProfile> = {
  low: {
    quality: 'low',
    resolutionScale: 0.65,
    maxPixelRatio: 1,
    shadowMapSize: 0,
    shadowsEnabled: false,
  },
  medium: {
    quality: 'medium',
    resolutionScale: 0.82,
    maxPixelRatio: 1.5,
    shadowMapSize: 1024,
    shadowsEnabled: true,
  },
  high: {
    quality: 'high',
    resolutionScale: 1,
    maxPixelRatio: 2,
    shadowMapSize: 2048,
    shadowsEnabled: true,
  },
};

export const resolveGraphicsProfile = (
  requested: GraphicsQuality,
  isSoftwareGl: boolean,
  isTouchDevice: boolean
): GraphicsProfile => {
  const quality =
    requested === 'auto'
      ? isSoftwareGl
        ? 'low'
        : isTouchDevice
          ? 'medium'
          : 'high'
      : requested;
  const profile = GRAPHICS_PROFILES[quality];
  return isSoftwareGl
    ? { ...profile, shadowsEnabled: false, shadowMapSize: 0, maxPixelRatio: 1 }
    : profile;
};

export const getRendererPixelRatio = (
  devicePixelRatio: number,
  profile: GraphicsProfile
): number => {
  const safeDevicePixelRatio = Number.isFinite(devicePixelRatio)
    ? Math.max(1, devicePixelRatio)
    : 1;
  return Math.max(
    0.5,
    Math.min(safeDevicePixelRatio * profile.resolutionScale, profile.maxPixelRatio)
  );
};
