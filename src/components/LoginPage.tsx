import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { publicAsset } from '../lib/assets';

export function PaperPage({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return <main className="login-page"><img className="login-botanicals" src={publicAsset('assets/botanical-frame.png')} alt="" />
    <motion.section className="login-card" initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="login-ribbon" aria-hidden="true">୨୧</div><p className="eyebrow">A little place for two</p><h1>Our Time</h1>{children}
    </motion.section></main>;
}
export function OpeningCalendar({ message = 'Opening our calendar…' }: { message?: string }) {
  return <PaperPage><div className="opening-flower" aria-hidden="true">✿</div><p role="status">{message}</p></PaperPage>;
}
export function LoginPage({ onSignIn, pending, error }: { onSignIn: (email: string, password: string) => Promise<void>; pending: boolean; error: string }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  return <PaperPage><p className="login-intro">Two cities, one shared rhythm.</p>
    <form className="login-form" onSubmit={async e => { e.preventDefault(); if (!pending) { await onSignIn(email, password); setPassword(''); } }}>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={pending} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={pending} /></label>
      {error && <p className="cloud-error" role="alert">{error}</p>}
      <button className="paper-button primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign In'}</button>
    </form><p className="login-note">A private calendar for Deena &amp; Sarim</p></PaperPage>;
}
