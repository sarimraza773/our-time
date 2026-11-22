import type { EventColor, PresetEventColor } from '../types';

export const EVENT_COLORS: Record<PresetEventColor, { label: string; fill: string }> = {
  blush: { label: 'Blush pink', fill: '#f6c2d0' },
  rose: { label: 'Rose pink', fill: '#e9a6bd' },
  peony: { label: 'Lavender pink', fill: '#f9dbe5' },
  mauve: { label: 'Mauve pink', fill: '#dfbed7' },
  shell: { label: 'Peach pink', fill: '#f8cdca' },
  berry: { label: 'Dusty pink', fill: '#dba1b1' },
};

export const PINK_SHADES = Object.values(EVENT_COLORS).map(({ fill }) => fill);

export function eventFill(color?: EventColor): string | undefined {
  if (!color) return undefined;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : EVENT_COLORS[color as PresetEventColor]?.fill;
}
/** Choose the higher WCAG contrast against the exact saved custom fill. */
export function eventText(fill?: string) {
  if (!fill) return '#3d2d26';
  const channels = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}
