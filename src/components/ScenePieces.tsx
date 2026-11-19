import { motion } from 'framer-motion';
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
  return <motion.img className={`sticker sticker-decorative ${className}`} src={src} alt={alt} />;
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
