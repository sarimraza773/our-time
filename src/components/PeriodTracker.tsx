import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DateTime } from 'luxon';
import type { PeriodRepository } from '../data/periodRepository';
import { usePeriodTracker } from '../hooks/usePeriodTracker';
import { addDays, cycleModel, cycleToday, dateOnly, daysBetween, DEFAULT_CYCLE, PHASES, prettyDate, type CycleSettings, type PeriodDraft, type PeriodEntry } from '../lib/period';
import './period.css';

type SettingsDraft = Omit<CycleSettings, 'user_id' | 'updated_at'>;
export function PeriodTracker({ repository, userId, onClose, today = cycleToday() }: {
  repository: PeriodRepository; userId: string; onClose: () => void; today?: string;
}) {
  const tracker = usePeriodTracker(repository, userId);
  const { snapshot, loading, saving, error, denied } = tracker;
  const model = useMemo(() => cycleModel(snapshot?.entries ?? [], snapshot?.settings ?? null, today), [snapshot, today]);
  const [month, setMonth] = useState(() => dateOnly(today).startOf('month'));
  const [selected, setSelected] = useState(today), [panel, setPanel] = useState<'log' | 'adjust' | 'settings' | null>(null);
  const [draft, setDraft] = useState<PeriodDraft | null>(null), [original, setOriginal] = useState<PeriodEntry>();
  const [settings, setSettings] = useState<SettingsDraft>(DEFAULT_CYCLE);
  const [lutealInput, setLutealInput] = useState('14');
  const [removing, setRemoving] = useState<PeriodEntry | 'all' | null>(null), [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const root = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null), closeRef = useRef(() => {});
  const canLeave = () => !saving && (!dirty || window.confirm('Discard unsaved tracker changes?'));
  closeRef.current = () => { if (canLeave()) onClose(); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key !== 'Tab') return;
      const focusRoot = root.current?.querySelector<HTMLElement>('.cycle-confirm') ?? root.current;
      const controls = [...(focusRoot?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? [])];
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, []);
  useEffect(() => { if (denied) { setDraft(null); setPanel(null); setRemoving(null); setDirty(false); } }, [denied]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    addEventListener('beforeunload', guard); return () => removeEventListener('beforeunload', guard);
  }, [dirty]);
  useEffect(() => { if (removing) root.current?.querySelector<HTMLElement>('.cycle-confirm button')?.focus(); }, [removing]);
  useEffect(() => { if (panel) root.current?.querySelector<HTMLElement>('.cycle-form')?.scrollIntoView?.({ block: 'nearest' }); }, [panel]);
  const beginLog = (entry?: PeriodEntry) => {
    if (!canLeave()) return;
    setOriginal(entry); setDraft(entry ? { id: entry.id, start_date: entry.start_date, end_date: entry.end_date, notes: entry.notes }
      : { id: crypto.randomUUID(), start_date: today, end_date: null, notes: '' });
    setDirty(false); setNotice(''); setPanel('log');
  };
  const beginSettings = (view: 'adjust' | 'settings') => {
    if (!canLeave()) return;
    const { cycle_length, period_duration, luteal_length, estimate_mode, expected_next_date, override_anchor, missed_prediction_on } = model.settings;
    setLutealInput(String(luteal_length));
    setSettings({ cycle_length, period_duration, luteal_length, estimate_mode,
      expected_next_date: model.overrideActive ? expected_next_date : null,
      override_anchor: model.overrideActive ? override_anchor : null,
      missed_prediction_on: model.overrideActive ? missed_prediction_on : null });
    setDirty(false); setNotice(''); setPanel(view);
  };
  const saved = () => { setPanel(null); setDraft(null); setDirty(false); setNotice('Saved to Deena’s tracker.'); };
  const savePeriod = async (e: FormEvent) => {
    e.preventDefault(); if (!draft || !snapshot) return;
    if (await tracker.mutate(() => repository.saveEntry(snapshot.ownerUserId, draft, snapshot.entries, original))) saved();
  };
  const saveSettings = async (e: FormEvent) => {
    e.preventDefault(); if (!snapshot) return;
    if (await tracker.mutate(() => repository.saveSettings(snapshot.ownerUserId, settings, snapshot.settings))) saved();
  };
  const changePeriod = (patch: Partial<PeriodDraft>) => { if (draft) { setDraft({ ...draft, ...patch }); setDirty(true); } };
  const changeSettings = (patch: Partial<SettingsDraft>) => { setSettings({ ...settings, ...patch }); setDirty(true); };
  const inspect = model.inspect(selected);
  const gridStart = month.startOf('week');
  const cells = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }).toISODate()!);
  const current = model.current;
  const currentName = current.phase ? PHASES[current.phase].label : 'Not enough information';
  return <div className="cycle-backdrop" onMouseDown={e => { if (e.currentTarget === e.target) closeRef.current(); }}>
    <section className="cycle-book" role="dialog" aria-modal="true" aria-labelledby="cycle-title" ref={root}>
      <header className="cycle-header"><div><p className="eyebrow">✿ A little space for yourself</p><h2 id="cycle-title">Period Tracker</h2><p>Deena’s cycle journal</p></div>
        <button ref={close} className="cycle-close" aria-label="Close Period Tracker" disabled={saving} onClick={() => closeRef.current()}>×</button></header>
      <p className="cycle-privacy">♧ Shared with Deena and Sarim. Both linked accounts can view and edit; nothing is added to your shared calendar.</p>
      {loading && <p role="status">Opening Deena’s journal…</p>}
      {error && <div className="cycle-error" role="alert"><p>{error}</p><button className="paper-button" disabled={saving} onClick={() => { void tracker.refresh(); }}>Retry / Refresh</button></div>}
      {snapshot && !denied && <>
        <div className="cycle-toolbar"><button className="paper-button primary" disabled={saving} onClick={() => beginLog()}>＋ Log Period</button><button className="paper-button" disabled={saving} onClick={() => beginSettings('adjust')}>Adjust Cycle / Override</button><button className="paper-button" disabled={saving} onClick={() => beginSettings('settings')}>Cycle settings</button></div>
        {notice && <p className="cycle-notice" role="status">{notice}</p>}
        {panel === 'log' && draft && <form className="cycle-form" onSubmit={savePeriod}><fieldset disabled={saving}>
          <h3>{original ? 'Edit period record' : 'Log Period'}</h3><p>Use the first day of bleeding as cycle day 1.</p>
          <div className="cycle-pair"><label>Period start date<input type="date" required min="1900-01-01" max={today} value={draft.start_date} onChange={e => changePeriod({ start_date: e.target.value })} /></label>
          <label>Period end date (optional)<input type="date" min={draft.start_date} max={today} value={draft.end_date ?? ''} onChange={e => changePeriod({ end_date: e.target.value || null })} /></label></div>
          <label>Notes (optional)<textarea maxLength={2000} value={draft.notes} onChange={e => changePeriod({ notes: e.target.value })} placeholder="Anything you’d like to remember…" /></label>
          {!draft.end_date && <p className="cycle-muted">This stays ongoing until you record an end. Close an earlier ongoing period before logging the next one.</p>}
          <div className="cycle-actions"><button type="button" className="paper-button" onClick={() => { if (canLeave()) { setPanel(null); setDirty(false); } }}>Cancel</button><button className="paper-button primary">Save period</button></div>
        </fieldset></form>}
        {(panel === 'settings' || panel === 'adjust') && <form className="cycle-form" onSubmit={saveSettings}><fieldset disabled={saving}>
          <h3>{panel === 'adjust' ? 'Adjust Cycle / Override' : 'Your cycle settings'}</h3>
          {panel === 'settings' ? <><p>Initial suggestions: 28-day cycle, 5-day period, 14-day luteal estimate. These are not personal measurements.</p>
            <div className="cycle-pair"><label>Typical cycle length (days)<input type="number" required min="10" max="120" value={settings.cycle_length} onChange={e => changeSettings({ cycle_length: Number(e.target.value) })} /></label>
            <label>Typical period duration (days)<input type="number" required min="1" max="30" value={settings.period_duration} onChange={e => changeSettings({ period_duration: Number(e.target.value) })} /></label>
            <label>Expected luteal length (optional, days)<input type="number" min="5" max="25" placeholder="14-day default" value={lutealInput} onChange={e => { setLutealInput(e.target.value); changeSettings({ luteal_length: e.target.value ? Number(e.target.value) : 14 }); }} /></label>
            <label>Estimate source<select value={settings.estimate_mode} onChange={e => changeSettings({ estimate_mode: e.target.value as 'history' | 'manual' })}><option value="history">Recorded history (3+ starts)</option><option value="manual">Manually configured length</option></select></label></div>
            <p className="cycle-muted">History uses the median of up to six cycle lengths. Variable cycles make forecasts less certain.</p></> : <>
            <p>A period arrived early? Log its actual start. Forecast changes below never alter recorded periods.</p><button type="button" className="paper-button" onClick={() => beginLog()}>Log an actual start</button>
            <label>Expected next-period date (manual prediction)<input type="date" disabled={!model.latest} min={model.latest ? addDays(model.latest.start_date, 1) : undefined} max="2199-12-31" value={settings.expected_next_date ?? ''} onChange={e => changeSettings({ expected_next_date: e.target.value || null, override_anchor: model.latest?.start_date ?? null })} /></label>
            <label className="cycle-check"><input type="checkbox" disabled={!model.next || model.next > today} checked={!!settings.missed_prediction_on} onChange={e => changeSettings({ missed_prediction_on: e.target.checked ? model.next : null, override_anchor: model.latest?.start_date ?? null })} />The expected period has not occurred</label>
            <p className="cycle-muted">A missed prediction is never saved as bleeding. Set a later date if you wish, or leave it uncertain until an actual start is logged.</p>
            {!model.latest && <p>Log a period before adjusting its forecast.</p>}
            <button type="button" className="paper-button" onClick={() => changeSettings({ expected_next_date: null, override_anchor: null, missed_prediction_on: null })}>Reset override</button>
          </>}
          <div className="cycle-actions"><button type="button" className="paper-button" onClick={() => { if (canLeave()) { setPanel(null); setDirty(false); } }}>Cancel</button><button className="paper-button primary">Save {panel === 'settings' ? 'settings' : 'adjustment'}</button></div>
        </fieldset></form>}
        <p className="cycle-uncertainty">{model.uncertainty}</p>
        {model.overdue && <p className="cycle-overdue">The forecast date has passed. No new period has been recorded. Log an actual start or adjust the prediction.</p>}
        <div className="cycle-cards"><article className={`cycle-card phase-${current.phase ?? 'unknown'}`}><p className="eyebrow">Current phase</p><h3>{currentName} {current.phase && <small>({current.recorded ? 'Recorded' : 'Estimated'})</small>}</h3>
          <p className="cycle-day">{current.cycleDay ? `Cycle day ${current.cycleDay}` : 'Your journal begins with a period'}</p>
          {current.phase && <><dl><div><dt>{current.recorded ? 'Recorded start' : 'Estimated phase start'}</dt><dd>{prettyDate(current.start)}</dd></div><div><dt>{current.recorded ? 'Recorded end' : 'Estimated phase end'}</dt><dd>{current.ongoing ? 'Ongoing — end not recorded' : prettyDate(current.end)}</dd></div></dl>
          <p>{current.phaseDay && `Day ${current.phaseDay} in this ${current.recorded ? 'recorded period' : 'estimated phase'}`}{current.end && ` · ${Math.max(0, daysBetween(today, current.end))} estimated days remaining`}</p><p>{PHASES[current.phase].explanation}</p></>}
        </article><article className="cycle-card next-period"><p className="eyebrow">Looking ahead · Estimated</p><h3>Next period expected</h3><p className="cycle-date">{prettyDate(model.next)}</p><p>Estimated end: {prettyDate(model.nextEnd)}</p>
          <p>{model.daysRemaining === null || !model.next ? 'Waiting for enough information' : model.daysRemaining < 0 ? `${-model.daysRemaining} days past the forecast` : model.daysRemaining === 0 ? 'Expected around today' : `About ${model.daysRemaining} days away`}</p>{model.ovulationWindow && <p>Estimated ovulation window: {prettyDate(model.ovulationWindow.start)} – {prettyDate(model.ovulationWindow.end)}. Unconfirmed.</p>}<p className="cycle-muted">{model.next ? model.source : 'No precise forecast yet'} · {model.overrideActive && 'Manually adjusted · '}Predictions are not guaranteed.</p>
        </article></div>
        <section className="cycle-rhythm"><h3>Your cycle at a glance</h3><p className="cycle-muted">A simplified estimated timeline. Follicular biology also includes menstruation.</p>
          {model.timeline.length > 0 ? <div className="cycle-progress" aria-label="Estimated cycle timeline">{model.timeline.map(d => <span key={d.date} className={`phase-${d.phase ?? 'unknown'}${d.date === today ? ' is-today' : ''}`} title={`${prettyDate(d.date)}: ${d.phase ? PHASES[d.phase].label : 'Uncertain'}${d.recorded ? ' (recorded)' : ' (estimated)'}`}>{d.date === today && <i>Today</i>}</span>)}</div> : <p className="cycle-muted">A phase timeline will appear when a usable forecast is available.</p>}
          <div className="cycle-legend">{Object.entries(PHASES).map(([key, phase]) => <span key={key}><i className={`phase-${key}`} />{phase.label}</span>)}</div>
        </section>
        <section className="cycle-calendar"><div className="cycle-month"><button className="paper-button" aria-label="Previous cycle month" disabled={month.year <= 1900 && month.month === 1} onClick={() => setMonth(month.minus({ months: 1 }))}>‹</button><h3>{month.toFormat('LLLL yyyy')}</h3><button className="paper-button" aria-label="Next cycle month" disabled={month.year >= 2199 && month.month === 12} onClick={() => setMonth(month.plus({ months: 1 }))}>›</button><button className="paper-button" onClick={() => { setSelected(today); setMonth(dateOnly(today).startOf('month')); }}>Today</button></div>
          <div className="cycle-week" aria-hidden="true">{['M','T','W','T','F','S','S'].map((d,i) => <span key={i}>{d}</span>)}</div><div className="cycle-dates">{cells.map(date => {
            const valid = date >= '1900-01-01' && date <= '2199-12-31';
            const info = valid ? model.inspect(date) : null;
            return <button key={date} disabled={!valid} type="button" aria-pressed={selected === date} aria-current={date === today ? 'date' : undefined}
              aria-label={`${date}${info?.recorded ? ', recorded period' : info?.phase ? `, ${PHASES[info.phase].label}, estimated` : ', phase unknown'}${info?.adjusted ? ', manually adjusted' : ''}`}
              className={`${info?.phase ? `phase-${info.phase}` : ''} ${info?.recorded ? 'recorded' : info?.phase ? 'predicted' : ''} ${DateTime.fromISO(date).month !== month.month ? 'outside' : ''}`}
              onClick={() => setSelected(date)}>{Number(date.slice(-2))}{info?.adjusted && <sup>✎</sup>}</button>;
          })}</div><p className="cycle-muted">Solid border: recorded bleeding · Dashed border: estimated phase · ✎ Manual forecast adjustment</p>
          <article className="cycle-inspection" aria-live="polite"><h4>{prettyDate(selected)}</h4><p>{inspect.recorded ? 'Recorded period' : inspect.phase ? `${PHASES[inspect.phase].label} (Estimated)` : 'Phase uncertain'}{inspect.cycleDay ? ` · Cycle day ${inspect.cycleDay}` : ''}</p><p>{selected > today ? 'Future / predicted' : 'Historical / today'}{inspect.adjusted ? ' · Manual forecast adjustment applies' : ''}{inspect.ongoing ? ' · Period ongoing' : ''}</p></article>
        </section>
        <section className="cycle-history"><h3>Recorded periods</h3>{!model.records.length && <p>No periods logged yet. Only your two linked accounts can access these dates.</p>}
          {[...model.records].reverse().map(entry => <article key={entry.id}><div><strong>{prettyDate(entry.start_date)} – {entry.end_date ? prettyDate(entry.end_date) : 'Ongoing'}</strong><p>{entry.end_date ? `${daysBetween(entry.start_date, entry.end_date) + 1} recorded days` : 'Add an end date when ready'} · Actual record</p>{entry.notes && <p className="cycle-notes">{entry.notes}</p>}</div><button className="paper-button" disabled={saving} onClick={() => beginLog(entry)}>{entry.end_date ? 'Edit' : 'Mark ended / Edit'}</button><button className="cycle-remove" disabled={saving} onClick={() => setRemoving(entry)}>Remove</button></article>)}
          {model.lengths.length > 0 && <p className="cycle-muted">Prior cycle lengths: {model.lengths.join(', ')} days (oldest first).</p>}
        </section>
        <footer className="cycle-footer"><p>Calendar dates cannot confirm ovulation or biological phases. This tracker is not a reliable method of contraception or a pregnancy diagnosis. <a href="https://www.nhs.uk/conditions/periods/fertility-in-the-menstrual-cycle/" target="_blank" rel="noreferrer">About cycle estimates</a></p>
          <button className="cycle-remove" disabled={saving} onClick={() => setRemoving('all')}>Delete all tracker data</button><button className="paper-button" disabled={saving} onClick={() => { void tracker.refresh(); }}>Refresh tracker</button></footer>
        {removing && <section className="cycle-confirm" role="alertdialog" aria-modal="true" aria-labelledby="cycle-delete-title"><h3 id="cycle-delete-title">{removing === 'all' ? 'Delete all tracker data?' : 'Remove this period record?'}</h3><p>{removing === 'all' ? 'All period records, notes, settings and overrides will be permanently deleted.' : 'This deletes only the selected actual record and recalculates estimates.'}</p><div className="cycle-actions"><button className="paper-button" disabled={saving} onClick={() => setRemoving(null)}>Keep data</button><button className="paper-button" disabled={saving} onClick={async () => {
          if (await tracker.mutate(() => removing === 'all' ? repository.deleteAll() : repository.deleteEntry(snapshot.ownerUserId, removing))) { setRemoving(null); setPanel(null); setDraft(null); setDirty(false); setNotice('Deleted from Deena’s tracker.'); }
        }}>Confirm deletion</button></div></section>}
        {saving && <p role="status">Saving to Deena’s tracker…</p>}
      </>}
    </section>
  </div>;
}
