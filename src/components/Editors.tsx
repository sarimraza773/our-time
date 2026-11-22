import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { DateTime } from 'luxon';
import type { CalendarEvent, EventCategory, EventColor, OwnerId, RecurringRule, RepeatFrequency } from '../types';
import { EVENT_COLORS, eventFill } from '../lib/eventColors';
import { DEFAULT_CUSTOM, RepeatFields, repeatSettings, WeekdayPicker, type RepeatChoice } from './RepeatFields';

const CATEGORIES: { value: EventCategory; label: string }[] = [
  ['class', 'Class'], ['study', 'Study'], ['sleep', 'Sleep'], ['friends', 'With Friends'], ['food', 'Food'],
  ['freeTime', 'Free Time'], ['personal', 'Personal / Other'], ['dateNight', 'Date Night'], ['call', 'Call'], ['sharedTime', 'Shared Time'],
].map(([value, label]) => ({ value: value as EventCategory, label }));
const ownerZone = (owner: OwnerId) => owner === 'deena' ? 'Asia/Kuala_Lumpur' : 'America/New_York';

function OwnerCategoryFields({ owner, category, onOwner, onCategory }: {
  owner: OwnerId; category: EventCategory; onOwner: (owner: OwnerId) => void; onCategory: (category: EventCategory) => void;
}) {
  return <div className="field-pair">
    <label>Owner<select value={owner} onChange={event => onOwner(event.target.value as OwnerId)}><option value="deena">Deena</option><option value="sarim">Sarim</option></select></label>
    <label>Category<select value={category} onChange={event => onCategory(event.target.value as EventCategory)}>{CATEGORIES.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
  </div>;
}

function ColorField({ color, onChange }: { color?: EventColor; onChange: (color?: EventColor) => void }) {
  return <fieldset className="event-palette"><legend>Event Color</legend>
    <div className="color-swatches"><button type="button" aria-pressed={!color} onClick={() => onChange()}>Automatic</button>
      {Object.entries(EVENT_COLORS).map(([value, item]) => <button key={value} type="button" title={item.label}
        aria-label={item.label} aria-pressed={color === value} style={{ background: item.fill }}
        onClick={() => onChange(value as EventColor)}>{color === value ? '✓' : ''}</button>)}
    </div>
    <label>Custom color<input type="color" value={eventFill(color) ?? '#f6c2d0'}
      onChange={event => onChange(event.target.value as EventColor)} /></label>
    <p className="repeat-hint">{color ? 'Your chosen color is saved for both of you.' : 'Automatic shades distinguish overlapping events.'}</p>
  </fieldset>;
}

const blankEvent = (day: DateTime, ownerId: OwnerId, zone: string): CalendarEvent => {
  // The selected planner date is also the starting date in the event's timezone.
  const start = DateTime.fromISO(`${day.toISODate()}T10:00`, { zone });
  const stamp = DateTime.utc().toISO()!;
  return { id: `event-${crypto.randomUUID()}`, ownerId, title: '', category: 'personal', startUtc: start.toUTC().toISO()!,
    endUtc: start.plus({ hours: 1 }).toUTC().toISO()!, timezone: zone, notes: '', isRecurring: false,
    openToStudyTogether: false, editable: true, createdAt: stamp, updatedAt: stamp };
};

function eventTiming(event: CalendarEvent) {
  const start = DateTime.fromISO(event.startUtc).setZone(event.timezone);
  const end = DateTime.fromISO(event.endUtc).setZone(event.timezone);
  const date = start.toISODate()!;
  const offset = DateTime.fromISO(end.toISODate()!, { zone: 'utc' }).diff(DateTime.fromISO(date, { zone: 'utc' }), 'days').days;
  return { date, startTime: start.toFormat('HH:mm'), endTime: end.toFormat('HH:mm'), offset };
}

function resolveTiming(event: CalendarEvent, timing: ReturnType<typeof eventTiming>) {
  const original = eventTiming(event);
  const { date, startTime, endTime, offset } = timing;
  const atTime = (time: string, days: number) => {
    const localDate = DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate();
    return DateTime.fromISO(`${localDate}T${time}`, { zone: event.timezone });
  };
  const start = date === original.date && startTime === original.startTime ? DateTime.fromISO(event.startUtc) : atTime(startTime, 0);
  let end = date === original.date && endTime === original.endTime && offset === original.offset ? DateTime.fromISO(event.endUtc) : atTime(endTime, offset);
  if (end <= start) end = atTime(endTime, offset + 1);
  return { start, end };
}

export function EventEditor({ event, day, ownerId, zone, pending = false, error = '', onSave, onSaveRule, onDelete, onClose, onEditSeries }: {
  event: CalendarEvent | null | undefined; day: DateTime; ownerId: OwnerId; zone: string; pending?: boolean; error?: string;
  onSave: (event: CalendarEvent) => void; onSaveRule: (rule: RecurringRule) => void; onDelete: (event: CalendarEvent) => void;
  onClose: () => void; onEditSeries?: () => void;
}) {
  const [draft, setDraft] = useState(() => event ?? blankEvent(day, ownerId, zone));
  const [timing, setTiming] = useState(() => eventTiming(draft));
  const [repeat, setRepeat] = useState<RepeatChoice>('none');
  const [custom, setCustom] = useState(DEFAULT_CUSTOM);
  const [timingError, setTimingError] = useState('');
  useEffect(() => {
    const initial = event ?? blankEvent(day, ownerId, zone);
    setDraft(initial);
    setTiming(eventTiming(initial));
    setRepeat('none');
    setCustom(DEFAULT_CUSTOM);
    setTimingError('');
  }, [event, day, ownerId, zone]);

  const changeZone = (timezone: string, owner = draft.ownerId) => {
    const { start, end } = resolveTiming(draft, timing);
    const next = { ...draft, ownerId: owner, timezone };
    if (start.isValid && end.isValid) {
      next.startUtc = start.toUTC().toISO()!;
      next.endUtc = end.toUTC().toISO()!;
      setTiming(eventTiming(next));
    }
    setDraft(next);
  };

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    const { start, end } = resolveTiming(draft, timing);
    if (!start.isValid || !end.isValid || end <= start) {
      setTimingError('Choose a valid date, start time, and end time.');
      return;
    }
    setTimingError('');
    if (!event && repeat !== 'none') {
      const { title, ownerId, category, timezone, notes, color, openToStudyTogether } = draft;
      onSaveRule({ id: `rule-${draft.id}`, title, ownerId, category, timezone, notes, color, openToStudyTogether,
        startTime: timing.startTime, endTime: timing.endTime, active: true, ...repeatSettings(repeat, custom, timing.date) });
      return;
    }
    onSave({ ...draft, startUtc: start.toUTC().toISO()!, endUtc: end.toUTC().toISO()!, updatedAt: DateTime.utc().toISO()! });
  };

  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <motion.form className="editor-card" role="dialog" aria-modal="true" aria-label="Event editor" initial={{ opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: .98 }} onSubmit={submit}>
      <fieldset className="editor-fields" disabled={pending}>
        <header><div><p className="eyebrow">{event?.isRecurring ? 'This occurrence' : event ? 'Edit this moment' : 'Add to the day'}</p>
          <h2>{event ? 'Event details' : 'New event'}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close event editor">×</button></header>
        <label>Title<input required value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="What’s happening?" autoFocus /></label>
        <OwnerCategoryFields owner={draft.ownerId} category={draft.category} onOwner={owner => changeZone(ownerZone(owner), owner)}
          onCategory={category => setDraft({ ...draft, category })} />
        <div className="field-pair">
          <label>Date<input type="date" required value={timing.date} onChange={event => setTiming({ ...timing, date: event.target.value })} /></label>
          <label>Timezone<select value={draft.timezone} onChange={event => changeZone(event.target.value)}><option value="Asia/Kuala_Lumpur">Kuala Lumpur</option><option value="America/New_York">Pennsylvania</option></select></label>
        </div>
        <div className="field-pair">
          <label>Start<input type="time" required value={timing.startTime} onChange={event => setTiming({ ...timing, startTime: event.target.value })} /></label>
          <label>End<input type="time" required value={timing.endTime}
            onChange={event => setTiming({ ...timing, endTime: event.target.value, offset: timing.offset > 1 ? timing.offset : 0 })} /></label>
        </div>
        <label className="check-label"><input type="checkbox" checked={!!event?.isRecurring || repeat !== 'none'}
          disabled={!!event} onChange={e => setRepeat(e.target.checked ? 'weekly' : 'none')} />Recurring event</label>
        {!event && repeat !== 'none' && <div className="recurrence-settings"><RepeatFields choice={repeat} onChoose={setRepeat} custom={custom} onCustom={setCustom} date={timing.date} /></div>}
        {event?.isRecurring && <p className="repeat-hint">Saving changes only this occurrence. Use Edit series for its repeat settings.</p>}
        <ColorField color={draft.color} onChange={color => setDraft({ ...draft, color })} />
        <label>Notes<textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="Optional little details…" /></label>
        {draft.category === 'study' && <label className="check-label"><input type="checkbox" checked={draft.openToStudyTogether}
          onChange={event => setDraft({ ...draft, openToStudyTogether: event.target.checked })} /><span>Open to study together</span></label>}
        {onEditSeries && <button type="button" className="edit-series" onClick={onEditSeries}>Edit series</button>}
        <div className="editor-actions">
          {event && <button type="button" className="danger" onClick={() => onDelete(event)}>{event.isRecurring ? 'Delete occurrence' : 'Delete'}</button>}
          <span /><button type="button" className="quiet" onClick={onClose}>Cancel</button>
          <motion.button className="primary" whileTap={{ scale: .96 }}>Save event ✦</motion.button>
        </div>
      </fieldset>
      {(timingError || error) && <p className="cloud-error" role="alert">{timingError || error}</p>}
      {pending && <p role="status">Saving to our calendar…</p>}
    </motion.form>
  </motion.div>;
}

const blankRule = (ownerId: OwnerId): RecurringRule => ({ id: `rule-${crypto.randomUUID()}`, ownerId, title: '', category: 'study',
  timezone: ownerZone(ownerId), startTime: '09:00', endTime: '10:00', pattern: 'weekdays', weekdays: [], active: true, notes: '', openToStudyTogether: false });

export function RecurringScheduleEditor({ rule, ownerId, pending = false, error = '', onSave, onClose }: {
  rule: RecurringRule | null | undefined; ownerId: OwnerId; pending?: boolean; error?: string; onSave: (rule: RecurringRule) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => rule ?? blankRule(ownerId));
  const [choice, setChoice] = useState<Exclude<RepeatChoice, 'none'>>('weekly');
  const [custom, setCustom] = useState(DEFAULT_CUSTOM);
  useEffect(() => {
    setDraft(rule ?? blankRule(ownerId));
    if (rule?.startDate) {
      const frequency = rule.pattern as RepeatFrequency;
      setChoice(rule.endDate || (rule.interval ?? 1) !== 1 || (frequency === 'weekly' && rule.weekdays.length) ? 'custom' : frequency);
      setCustom({ frequency, interval: rule.interval ?? 1, weekdays: rule.weekdays, endDate: rule.endDate ?? '' });
    }
  }, [rule, ownerId]);

  return <div className="modal-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <motion.form className="editor-card rule-editor" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={event => {
      event.preventDefault();
      onSave(rule?.startDate ? { ...draft, ...repeatSettings(choice, custom, draft.startDate!) } : draft);
    }}>
      <fieldset className="editor-fields" disabled={pending}>
        <header><div><p className="eyebrow">A rhythm that repeats</p><h2>{rule ? 'Edit schedule' : 'New recurring schedule'}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close schedule editor">×</button></header>
        <label>Title<input required value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Psychology Lecture" autoFocus /></label>
        <OwnerCategoryFields owner={draft.ownerId} category={draft.category} onOwner={owner => setDraft({ ...draft, ownerId: owner, timezone: ownerZone(owner) })}
          onCategory={category => setDraft({ ...draft, category })} />
        {rule?.startDate ? <>
          <label>Start date<input type="date" required value={draft.startDate ?? ''} onChange={event => setDraft({ ...draft, startDate: event.target.value })} /></label>
          <RepeatFields choice={choice} onChoose={value => { if (value !== 'none') setChoice(value); }} custom={custom} onCustom={setCustom} date={draft.startDate ?? ''} />
        </> : <>
          <label>Repeats<select value={draft.pattern} onChange={event => setDraft({ ...draft, pattern: event.target.value as RecurringRule['pattern'] })}>
            <option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="custom">Custom days</option>
          </select></label>
          {(draft.pattern === 'custom' || draft.pattern === 'weekly') && <WeekdayPicker days={draft.weekdays} onChange={weekdays => setDraft({ ...draft, weekdays })} />}
        </>}
        <div className="field-pair">
          <label>Start<input type="time" required value={draft.startTime} onChange={event => setDraft({ ...draft, startTime: event.target.value })} /></label>
          <label>End<input type="time" required value={draft.endTime} onChange={event => setDraft({ ...draft, endTime: event.target.value })} /></label>
        </div>
        {rule?.startDate && <label>Timezone<select value={draft.timezone} onChange={event => setDraft({ ...draft, timezone: event.target.value })}>
          <option value="Asia/Kuala_Lumpur">Kuala Lumpur</option><option value="America/New_York">Pennsylvania</option></select></label>}
        <ColorField color={draft.color} onChange={color => setDraft({ ...draft, color })} />
        <label>Notes<textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
        {draft.category === 'study' && <label className="check-label"><input type="checkbox" checked={draft.openToStudyTogether}
          onChange={event => setDraft({ ...draft, openToStudyTogether: event.target.checked })} /><span>Open to study together</span></label>}
        <div className="editor-actions"><span /><button type="button" className="quiet" onClick={onClose}>Cancel</button><button className="primary">Save schedule</button></div>
      </fieldset>
      {error && <p className="cloud-error" role="alert">{error}</p>}
      {pending && <p role="status">Saving to our calendar…</p>}
    </motion.form>
  </div>;
}
