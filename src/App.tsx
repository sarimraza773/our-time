import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { AnimatePresence } from 'framer-motion';
import type { CalendarEvent, OwnerId, RecurringRule } from './types';
import { DEENA_TIMEZONE } from './data/people';
import { calculateMutualFreeSlots, calculateStudyTogetherSlots, dayWindow } from './lib/calendar';
import { resolveEventsForRange } from './lib/schedule';
import { getCurrentScheduleStatus } from './lib/status';
import { answerCalendarQuestion } from './lib/bot';
import { useCurrentTime } from './hooks/useCurrentTime';
import { useAuth } from './hooks/useAuth';
import { useSharedCalendar } from './hooks/useSharedCalendar';
import { cloudConfigurationError } from './lib/supabase';
import { LoginPage, OpeningCalendar, PaperPage } from './components/LoginPage';
import { CalendarScene } from './components/CalendarScene';
import { EventEditor, RecurringScheduleEditor } from './components/Editors';
import type { BotMessage } from './components/CalendarBot';
import { Photobooth } from './components/Photobooth';
import { createMemoryRepository } from './data/memoryRepository';
import { supabase } from './lib/supabase';
import { createJournalRepository } from './data/journalRepository';
import { useSharedJournal } from './hooks/useSharedJournal';
import { Bookshelf } from './components/Bookshelf';
import { SharedDiary } from './components/SharedDiary';

export default function App() {
  const auth = useAuth();
  if (cloudConfigurationError) return <PaperPage><p className="login-intro">Our shared calendar needs a home.</p><p className="setup-message">{cloudConfigurationError}</p></PaperPage>;
  if (auth.loading) return <OpeningCalendar />;
  if (!auth.session) return <LoginPage onSignIn={auth.signIn} pending={auth.pending} error={auth.error} />;
  return <SharedPlanner key={auth.session.user.id} authenticatedUserId={auth.session.user.id} onSignOut={auth.signOut} authError={auth.error} />;
}

function SharedPlanner({ authenticatedUserId, onSignOut, authError }: { authenticatedUserId: string; onSignOut: () => Promise<void>; authError: string }) {
  const cloud = useSharedCalendar(authenticatedUserId);
  const [photobooth, setPhotobooth] = useState(false);
  const [diary, setDiary] = useState(false);
  const closeDiary = useCallback(() => setDiary(false), []);
  const journalRepository = useMemo(() => supabase ? createJournalRepository(supabase) : null, []);
  const journal = useSharedJournal(journalRepository, cloud.snapshot?.calendar.id);
  const closePhotobooth = useCallback(() => setPhotobooth(false), []);
  const memoryRepository = useMemo(() => supabase ? createMemoryRepository(supabase) : null, []);
  // Visual perspective is independent from the authenticated UUID and profile.
  const selectedPerspective: OwnerId = 'deena';
  const person = cloud.snapshot?.profiles.find(p => p.id === authenticatedUserId)?.person_key ?? 'deena';
  const nowUtc = useCurrentTime();
  const today = nowUtc.setZone(DEENA_TIMEZONE).startOf('day');
  const [day, setDay] = useState<DateTime>(today);
  const [eventEditor, setEventEditor] = useState<{ open: boolean; event?: CalendarEvent }>({ open: false });
  const [ruleEditor, setRuleEditor] = useState<{ open: boolean; rule?: RecurringRule }>({ open: false });
  const [fullscreen, setFullscreen] = useState(false);
  const [drawer, setDrawer] = useState<'schedule' | 'bot' | null>(null);
  const [toast, setToast] = useState('');
  const [questions, setQuestions] = useState<{ id: string; text: string }[]>([]);
  const scheduleSource = cloud.source;
  const { rules } = scheduleSource;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement)?.matches?.('input,textarea,select,[contenteditable=true]');
      if (event.key === 'Escape' && !cloud.saving) { setFullscreen(false); setDrawer(null); setEventEditor({ open: false }); setRuleEditor({ open: false }); cloud.cancelImport(); }
      if (event.key.toLowerCase() === 'f' && !typing && !photobooth && !diary) { event.preventDefault(); setFullscreen(value => !value); }
    };
    addEventListener('keydown', listener); return () => removeEventListener('keydown', listener);
  }, [cloud.saving, photobooth, diary]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);

  const dayEvents = useMemo(() => {
    const { start, end } = dayWindow(day, DEENA_TIMEZONE);
    return resolveEventsForRange({ ...scheduleSource, rangeStart: start, rangeEnd: end });
  }, [scheduleSource, day]);
  const mutualSlots = useMemo(() => calculateMutualFreeSlots(dayEvents, day, DEENA_TIMEZONE, 45), [dayEvents, day]);
  const studySlots = useMemo(() => calculateStudyTogetherSlots(dayEvents), [dayEvents]);
  const deenaStatus = useMemo(() => getCurrentScheduleStatus({ ...scheduleSource, ownerId: 'deena', nowUtc }), [scheduleSource, nowUtc]);
  const sarimStatus = useMemo(() => getCurrentScheduleStatus({ ...scheduleSource, ownerId: 'sarim', nowUtc }), [scheduleSource, nowUtc]);
  const botMessages = useMemo<BotMessage[]>(() => [
    { id: 'welcome', role: 'bot', text: 'Hi! 🌸 I can find shared time, compare timezones, or check what Sarim is doing. Answers follow your latest shared schedule.' },
    ...questions.flatMap(question => [
      { id: `u-${question.id}`, role: 'user' as const, text: question.text },
      { id: `b-${question.id}`, role: 'bot' as const, text: answerCalendarQuestion(question.text, { ...scheduleSource, timezone: DEENA_TIMEZONE, currentUserId: person, now: nowUtc }) },
    ]),
  ], [questions, scheduleSource, person, nowUtc]);

  const saveEvent = async (event: CalendarEvent) => {
    if (await cloud.saveEvent(event, !!eventEditor.event)) { setEventEditor({ open: false }); setToast('Event saved to our calendar ✦'); }
  };
  const deleteEvent = async (event: CalendarEvent) => {
    if (await cloud.deleteEvent(event)) { setEventEditor({ open: false }); setToast('Event gently removed'); }
  };
  const saveRule = async (rule: RecurringRule) => {
    if (await cloud.saveRule(rule, !!ruleEditor.rule)) { setRuleEditor({ open: false }); setToast('Recurring rhythm saved ✦'); }
  };
  const createRuleFromEvent = async (rule: RecurringRule) => {
    if (await cloud.saveRule(rule, false)) { setEventEditor({ open: false }); setToast('Recurring rhythm saved ✦'); }
  };
  const eventSeries = rules.find(rule => rule.id === eventEditor.event?.recurringRuleId);
  if (cloud.loading) return <OpeningCalendar />;
  if (!cloud.snapshot) return <PaperPage><p className="cloud-error" role="alert">{cloud.error || 'The shared calendar is not available yet.'}</p>
    {authError && <p role="alert">{authError}</p>}<button className="paper-button" onClick={cloud.retry}>Retry</button> <button className="paper-button" onClick={onSignOut}>Sign Out</button></PaperPage>;

  return <>
    <div inert={photobooth || diary}>
    <CalendarScene bookshelf={<Bookshelf books={journal.books} loading={journal.loading} saving={journal.saving} error={journal.loadError || journal.saveError} onSave={journal.saveBook} onOpen={() => setDiary(true)} onRefresh={journal.refresh} />} perspective={selectedPerspective} authenticatedPerson={person} day={day} today={today} nowUtc={nowUtc} deenaStatus={deenaStatus} sarimStatus={sarimStatus} events={dayEvents} rules={rules} mutualSlots={mutualSlots} studySlots={studySlots} botMessages={botMessages} isFullscreen={fullscreen} drawer={drawer} toast={toast}
      onSelectDay={setDay} onToday={() => { setDay(DateTime.now().setZone(DEENA_TIMEZONE).startOf('day')); setToast('Back to today 🌸'); }}
      onEditEvent={event => { cloud.clearError(); setEventEditor({ open: true, event }); }} onAddEvent={() => { cloud.clearError(); setEventEditor({ open: true }); }}
      onToggleRule={id => { const rule = rules.find(r => r.id === id); if (rule) void cloud.saveRule({ ...rule, active: !rule.active }, true); }}
      onEditRule={rule => { cloud.clearError(); setRuleEditor({ open: true, rule }); }} onDeleteRule={id => { void cloud.deleteRule(id); }} onAddRule={() => { cloud.clearError(); setRuleEditor({ open: true }); }}
      onAskBot={text => setQuestions(current => [...current, { id: crypto.randomUUID(), text }])} onToggleFullscreen={() => setFullscreen(value => !value)} onDrawer={setDrawer}
      onRefresh={cloud.retry} onSarim={() => setToast('Sarim’s perspective is coming next 💙')} onSignOut={onSignOut} />
    <button className="paper-button photobooth-entry" onClick={() => setPhotobooth(true)}>▣ Photobooth &amp; Memories</button>
    <aside className={`sync-note ${cloud.error || authError ? 'has-error' : ''}`} aria-live="polite">
      <span>✿ {cloud.connection}</span><small>Signed in as {person === 'deena' ? 'Deena' : 'Sarim'}</small>
      {(cloud.error || authError) && <><p role="alert">{authError || cloud.error}</p><button onClick={cloud.retry}>Retry connection</button></>}
      {cloud.localError && <p>{cloud.localError}</p>}
    </aside>
    {cloud.offerImport && <div className="modal-backdrop"><section className="editor-card import-card" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <p className="eyebrow">A familiar little calendar</p><h2 id="import-title">We found the calendar saved on this device.</h2><p>Import it into your shared calendar?</p><p className="login-note">Your original device copy will stay untouched.</p>
      {cloud.error && <p className="cloud-error" role="alert">{cloud.error}</p>}
      <div className="import-actions"><button className="paper-button primary" disabled={cloud.saving} onClick={() => { void cloud.importLocal(); }}>{cloud.saving ? 'Importing…' : 'Import'}</button><button className="paper-button" disabled={cloud.saving} onClick={cloud.startFresh}>Start Fresh</button><button className="paper-button" disabled={cloud.saving} onClick={cloud.cancelImport}>Cancel</button></div>
    </section></div>}
    <AnimatePresence>{eventEditor.open && <EventEditor event={eventEditor.event} day={day} ownerId={person} zone={person === 'deena' ? DEENA_TIMEZONE : 'America/New_York'}
      pending={cloud.saving} error={cloud.error} onSave={saveEvent} onSaveRule={createRuleFromEvent} onDelete={deleteEvent}
      onEditSeries={eventSeries ? () => { cloud.clearError(); setEventEditor({ open: false }); setRuleEditor({ open: true, rule: eventSeries }); } : undefined}
      onClose={() => { if (!cloud.saving) setEventEditor({ open: false }); }} />}</AnimatePresence>
    <AnimatePresence>{ruleEditor.open && <RecurringScheduleEditor rule={ruleEditor.rule} ownerId={person} pending={cloud.saving} error={cloud.error} onSave={saveRule} onClose={() => { if (!cloud.saving) setRuleEditor({ open: false }); }} />}</AnimatePresence>
    </div>
    {photobooth && memoryRepository && <Photobooth repository={memoryRepository} calendarId={cloud.snapshot.calendar.id} userId={authenticatedUserId} person={person} onClose={closePhotobooth} />}
    {diary && <SharedDiary journal={journal} profiles={cloud.snapshot.profiles} onClose={closeDiary} />}
  </>;
}
