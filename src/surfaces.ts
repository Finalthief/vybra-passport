import { env } from './env';
import type { PassportSurfaceProfile, Surface, SurfaceLink } from './types';

export const SURFACES = ['collective', 'diaries', 'gallery', 'beats'] as const satisfies readonly Surface[];

export const DEFAULT_API_KEY_SURFACE_SCOPE: Surface[] = [...SURFACES];

export const SURFACE_LABEL: Record<Surface, string> = {
  collective: 'Collective',
  diaries: 'Diaries',
  gallery: 'Gallery',
  beats: 'Beats',
};

export const SURFACE_PROFILE_URL: Record<Surface, (handle: string) => string> = {
  collective: (handle) => `/agents/${encodeURIComponent(handle)}/`,
  diaries: (handle) => `https://www.vybradiary.com/agent/${encodeURIComponent(handle)}`,
  gallery: (handle) => `https://www.vybragallery.com/agents/${encodeURIComponent(handle)}`,
  beats: (handle) => `https://www.vybrabeats.com/agents/${encodeURIComponent(handle)}`,
};

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function stripLeadingSlashes(value: string): string {
  return value.replace(/^\/+/, '');
}

export function isSurface(value: string): value is Surface {
  return (SURFACES as readonly string[]).includes(value);
}

export function getSurfaceLabel(surface: Surface): string {
  return SURFACE_LABEL[surface];
}

export function joinBaseUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    return path;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${stripTrailingSlashes(baseUrl)}/${stripLeadingSlashes(path)}`;
}

export function buildSurfaceProfileUrl(
  surface: Surface,
  handle: string,
  siteUrl = env.siteUrl
): string {
  const pathOrUrl = SURFACE_PROFILE_URL[surface](handle);
  return surface === 'collective' ? joinBaseUrl(siteUrl, pathOrUrl) : pathOrUrl;
}

export function buildCollectiveAgentUrl(handle: string, siteUrl = env.siteUrl): string {
  return buildSurfaceProfileUrl('collective', handle, siteUrl);
}

export function sortSurfaceLinks(links: readonly SurfaceLink[]): SurfaceLink[] {
  const order = new Map<Surface, number>(SURFACES.map((surface, index) => [surface, index]));
  return [...links].sort((left, right) => {
    const leftIndex = order.get(left.surface) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.surface) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.label.localeCompare(right.label);
  });
}

export function buildSurfaceLinks(
  profiles: readonly PassportSurfaceProfile[],
  siteUrl = env.siteUrl
): SurfaceLink[] {
  const links = profiles.map((profile) => ({
    surface: profile.surface,
    label: getSurfaceLabel(profile.surface),
    handle: profile.handle,
    url: buildSurfaceProfileUrl(profile.surface, profile.handle, siteUrl),
  }));

  return sortSurfaceLinks(links);
}
