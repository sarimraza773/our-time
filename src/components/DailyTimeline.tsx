import { DateTime } from 'luxon';
import { motion } from 'framer-motion';
import type { CalendarEvent, TimeSlot } from '../types';
import { convertTimezone, formatRange } from '../lib/calendar';

const START_HOUR = 6;
const END_HOUR = 25;
const HOUR_HEIGHT = 52;

function position(startUtc: string, endUtc: string, day: DateTime, zone: string) {
  const base = day.setZone(zone).startOf('day').plus({ hours:START_HOUR });
  const endBound = day.setZone(zone).startOf('day').plus({ hours:END_HOUR });
  const rawStart = convertTimezone(startUtc,zone);
  const rawEnd = convertTimezone(endUtc,zone);
  if (rawEnd <= base || rawStart >= endBound) return { top:0, height:0 };
  const start = DateTime.max(rawStart,base);
  const end = DateTime.min(rawEnd,endBound);
  return { top:start.diff(base,'minutes').minutes / 60 * HOUR_HEIGHT, height:Math.max(28,end.diff(start,'minutes').minutes / 60 * HOUR_HEIGHT) };
}

function TimezoneTooltip({ event, zone }: { event: CalendarEvent; zone: string }) {
  const sarim = convertTimezone(event.startUtc,'America/New_York');
  const deena = convertTimezone(event.startUtc,zone);
  return <span className="timezone-tooltip" role="tooltip">Sarim’s time: {sarim.toFormat('h:mm a')} {sarim.offsetNameShort}<br />Deena’s time: {deena.toFormat('h:mm a')} {deena.offsetNameShort}</span>;
}

export function TimelineEvent({ event, day, zone, onEdit, column }: { event: CalendarEvent; day:DateTime; zone:string; onEdit:(event:CalendarEvent)=>void; column:'deena'|'sarim' }) {
  const style = position(event.startUtc,event.endUtc,day,zone);
  const localStart = convertTimezone(event.startUtc,zone);
  const localEnd = convertTimezone(event.endUtc,zone);
  return (
    <motion.button layout className={`timeline-event ${column} category-${event.category}`} style={style} onClick={() => onEdit(event)} whileHover={{ y:-2, scale:1.01 }} whileTap={{ scale:.98 }} aria-label={`Edit ${event.title}, ${localStart.toFormat('h:mm a')} to ${localEnd.toFormat('h:mm a')}`}>
      <strong>{event.category === 'study' && event.openToStudyTogether ? '☑ ' : ''}{event.title}</strong>
      <small>{localStart.toFormat('h:mm')}–{localEnd.toFormat('h:mm a')}</small>
      {event.ownerId === 'sarim' && <TimezoneTooltip event={event} zone={zone} />}
    </motion.button>
  );
}

function TogetherBlock({ slot, day, zone, study = false }: { slot:TimeSlot; day:DateTime; zone:string; study?:boolean }) {
  const style = position(slot.startUtc,slot.endUtc,day,zone);
  return (
    <motion.div className={`together-block ${study ? 'study-together' : ''}`} style={style} whileHover={{ scale:1.015, y:-1 }}>
      <strong>{study ? '✓ Study Together?' : '♥ Both free'}</strong>
      <small>{formatRange(slot,zone)}</small>
    </motion.div>
  );
}

export function DailyTimeline({ day, nowUtc, events, mutualSlots, studySlots, zone, onEdit, onAdd }: { day:DateTime; nowUtc:DateTime; events:CalendarEvent[]; mutualSlots:TimeSlot[]; studySlots:TimeSlot[]; zone:string; onEdit:(event:CalendarEvent)=>void; onAdd:()=>void }) {
  const base = day.startOf('day').plus({hours:START_HOUR});
  const localNow = nowUtc.setZone(zone);
  const showNow = day.setZone(zone).hasSame(localNow,'day') && localNow >= base && localNow < day.startOf('day').plus({hours:END_HOUR});
  const nowTop = localNow.diff(base,'minutes').minutes / 60 * HOUR_HEIGHT;
  const visible = events.filter((e) => {
    const p = position(e.startUtc,e.endUtc,day,zone);
    return p.height > 0 && p.top < (END_HOUR-START_HOUR)*HOUR_HEIGHT;
  });
  const pairedIds = new Set<string>();
  for (const a of visible.filter((e)=>e.ownerId==='deena' && ['call','dateNight','sharedTime'].includes(e.category))) {
    const match = visible.find((b)=>b.ownerId==='sarim' && b.title===a.title && b.startUtc===a.startUtc && b.endUtc===a.endUtc);
    if (match) { pairedIds.add(a.id); pairedIds.add(match.id); }
  }
  return (
    <section className="timeline" aria-label="Daily schedule">
      <div className="timeline-head"><span>Time <small>MYT</small></span><span>Deena</span><span>Together</span><span>Sarim</span></div>
      <div className="timeline-scroll">
        <div className="timeline-canvas" style={{ height:(END_HOUR-START_HOUR)*HOUR_HEIGHT }}>
          <div className="hour-labels">{Array.from({length:END_HOUR-START_HOUR+1},(_,i)=>base.plus({hours:i})).map((hour)=><span key={hour.toISO()}>{hour.toFormat('h a')}</span>)}</div>
          {showNow&&<div className="now-line" style={{top:nowTop}} aria-hidden="true"><i /><span>Now</span></div>}
          <div className="timeline-column deena-col">
            {visible.filter((e)=>e.ownerId==='deena'&&!pairedIds.has(e.id)).map((event)=><TimelineEvent key={event.id} event={event} day={day} zone={zone} column="deena" onEdit={onEdit} />)}
          </div>
          <div className="timeline-column together-col">
            {mutualSlots.filter((slot)=>DateTime.fromISO(slot.endUtc)>DateTime.fromISO(slot.startUtc)).slice(0,6).map((slot)=><TogetherBlock key={`${slot.startUtc}-mutual`} slot={slot} day={day} zone={zone} />)}
            {studySlots.map((slot)=><TogetherBlock key={`${slot.startUtc}-study`} slot={slot} day={day} zone={zone} study />)}
            {visible.filter((e)=>pairedIds.has(e.id)&&e.ownerId==='deena').map((event)=><TogetherBlock key={event.id} slot={event} day={day} zone={zone} />)}
          </div>
          <div className="timeline-column sarim-col">
            {visible.filter((e)=>e.ownerId==='sarim'&&!pairedIds.has(e.id)).map((event)=><TimelineEvent key={event.id} event={event} day={day} zone={zone} column="sarim" onEdit={onEdit} />)}
          </div>
        </div>
      </div>
      <button className="floating-add" onClick={onAdd}>＋ New event</button>
    </section>
  );
}
