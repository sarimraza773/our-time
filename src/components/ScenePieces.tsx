import { motion } from 'framer-motion';
import { useId, type CSSProperties } from 'react';
import type { OwnerId } from '../types';
import { publicAsset } from '../lib/assets';

export function PerspectiveSelector({ perspective, authenticatedPerson, onSarim, onSignOut }: { perspective: 'deena'; authenticatedPerson: OwnerId; onSarim: () => void; onSignOut: () => void }) {
  return (
    <aside className="perspective-card" data-perspective={perspective} aria-label="Perspective selector">
      <button className="perspective-button active" aria-pressed="true">DEENA</button>
      <button className="perspective-button sarim" aria-pressed="false" onClick={onSarim}>SARIM</button>
      <span>Viewing as <b>Deena</b> · signed in as {authenticatedPerson === 'deena' ? 'Deena' : 'Sarim'}</span>
      <button className="sign-out" onClick={onSignOut}>Sign out</button>
    </aside>
  );
}

export function Sticker({ src, alt, className }: { src: string; alt: string; className: string }) {
  // Scene artwork is decorative. Photobooth sticker buttons/drag handles use
  // their own components and remain interactive.
  const filterId = `sticker-paper-${useId().replace(/:/g, '')}`;
  const paperTint = className.split(' ').some(name => name === 'sticker-sammy' || name === 'sticker-rupert');
  // Multiply the entire rendered card by the fixed paper color in its own
  // filter. Backdrop blending changes color wherever the card crosses a border.
  return <>
    {paperTint && <svg aria-hidden="true" focusable="false" width="0" height="0" className="sticker-filter-definitions">
      <defs><filter id={filterId} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0.960784314 0 0 0 0  0 0.905882353 0 0 0  0 0 0.811764706 0 0  0 0 0 1 0" />
      </filter></defs>
    </svg>}
    <motion.img className={`sticker sticker-decorative ${className}${paperTint ? ' sticker-paper-tint' : ''}`}
      style={paperTint ? { '--sticker-paper-filter': `url(#${filterId})` } as CSSProperties : undefined} src={src} alt={alt} />
  </>;
}

export function BotanicalDecoration() {
  return (
    <>
      <img className="botanical-frame" src={publicAsset('assets/botanical-frame.png')} alt="" />
      <div className="petals" aria-hidden="true"><i /><i /><i /></div>
      <div className="sunlight" aria-hidden="true" />
    </>
  );
}
