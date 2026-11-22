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
  // Decorative scene artwork keeps its original hover and press reactions.
  const filterId = `sticker-translucent-${useId().replace(/:/g, '')}`;
  // Fade white paper while keeping the colored artwork. Use the same filter
  // in every corner so transparency also works outside the calendar backdrop.
  return <>
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="sticker-filter-definitions">
      <defs><filter id={filterId} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1.063 -3.576 -0.361 0 5" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter></defs>
    </svg>
    <motion.img className={`sticker sticker-decorative ${className}`} whileHover={{ rotate:3, scale:1.07 }} whileTap={{ scale:.96 }}
      style={{ '--sticker-translucent-filter': `url(#${filterId})` } as CSSProperties} src={src} alt={alt} />
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
