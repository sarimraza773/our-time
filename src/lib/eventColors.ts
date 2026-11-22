import type { EventColor } from '../types';

export const EVENT_COLORS: Record<EventColor, { label: string; fill: string }> = {
  blush: { label: 'Blush', fill: '#f6c2d0' },
  rose: { label: 'Rose', fill: '#e9a6bd' },
  peony: { label: 'Peony', fill: '#f9dbe5' },
  mauve: { label: 'Mauve', fill: '#dfbed7' },
  shell: { label: 'Shell', fill: '#f8cdca' },
  berry: { label: 'Berry', fill: '#dba1b1' },
};

export const PINK_SHADES = Object.values(EVENT_COLORS).map(({ fill }) => fill);
