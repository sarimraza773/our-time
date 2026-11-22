import { useMemo, useRef, type CSSProperties } from 'react';
import { DateTime } from 'luxon';
import { motion } from 'framer-motion';
import { eventText } from '../lib/eventColors';
import type { CalendarEvent, TimeSlot } from '../types';
import { convertTimezone, formatRange } from '../lib/calendar';
import { layoutTimelineEvents, timelineScale, type TimelineSpan } from '../lib/timelineLayout';

type Column = 'deena' | 'together' | 'sarim';
type PlacedEvent = ReturnType<typeof layoutTimelineEvents>[number];
const HOURS = Array.from({ length: 24 }, (_, hour) => DateTime.utc(2000, 1, 1, hour).toFormat('h a'));
const SHARED_CATEGORIES = new Set(['call', 'dateNight', 'sharedTime']);

const percent = (fraction: number) => `${fraction * 100}%`;
const blockPosition = ({ top, bottom }: TimelineSpan) => ({ top: percent(top), height: percent(bottom - top) });
const density = ({ top, bottom }: TimelineSpan) => {
  const minutes = (bottom - top) * 1440;
  return minutes < 14.5 ? 'tiny' : minutes < 29.5 ? 'compact' : 'regular';
};

function TimezoneTooltip({ event, zone }: { event: CalendarEvent; zone: string }) {
  const sarim = convertTimezone(event.startUtc, 'America/New_York');
  const deena = convertTimezone(event.startUtc, zone);
  return <span className="timezone-tooltip" role="tooltip">Sarim’s time: {sarim.toFormat('h:mm a')} {sarim.offsetNameShort}<br />Deena’s time: {deena.toFormat('h:mm a')} {deena.offsetNameShort}</span>;
}

function TimelineEvent({ placement, zone, onEdit, column }: { placement: PlacedEvent; zone: string; onEdit: (event: CalendarEvent) => void; column: Column }) {
  const { event, lane, laneCount, fill } = placement;
  const style = {
    ...blockPosition(placement),
    '--lane-start': percent(lane / laneCount),
    '--lane-end': percent((laneCount - lane - 1) / laneCount),
    '--event-fill': fill,
    '--event-text': eventText(fill),
  } as CSSProperties;
  const localStart = convertTimezone(event.startUtc, zone);
  const localEnd = convertTimezone(event.endUtc, zone);
  const samePeriod = (localStart.hour < 12) === (localEnd.hour < 12);
  const details = `${event.title}, ${formatRange(event, zone)}, ${event.ownerId === 'deena' ? 'Deena' : 'Sarim'}`;

  return (
    <motion.button type="button" className={`timeline-event ${column} category-${event.category}${fill ? ' tinted' : ''}`}
      data-density={density(placement)} style={style} onClick={() => onEdit(event)} whileTap={{ opacity: .8 }}
      title={details} aria-label={`Edit ${details}`}>
      <span className="timeline-copy">
        <strong>{event.category === 'study' && event.openToStudyTogether ? '☑ ' : ''}{event.title}</strong>
        <span className="event-owner">{event.ownerId === 'deena' ? 'Deena' : 'Sarim'}</span>
        <small>{localStart.toFormat(samePeriod ? 'h:mm' : 'h:mm a')}–{localEnd.toFormat('h:mm a')}</small>
      </span>
      {event.ownerId === 'sarim' && <TimezoneTooltip event={event} zone={zone} />}
    </motion.button>
  );
}

function TogetherBlock({ slot, span, zone, study = false }: { slot: TimeSlot; span: TimelineSpan; zone: string; study?: boolean }) {
  return (
    <motion.div className={`together-block ${study ? 'study-together' : ''}`} style={blockPosition(span)}
      data-density={density(span)}>
      <span className="timeline-copy">
        <strong>{study ? '✓ Study Together?' : '♥ Both free'}</strong>
        <small>{formatRange(slot, zone)}</small>
      </span>
    </motion.div>
  );
}

function placeEvents(events: CalendarEvent[], clip: ReturnType<typeof timelineScale>['clip']) {
  const visible = events.flatMap(event => {
    const span = clip(event);
    return span ? [{ event, ...span }] : [];
  });
  const pairedIds = new Set<string>();
  for (const { event } of visible) {
    if (event.ownerId !== 'deena' || !SHARED_CATEGORIES.has(event.category)) continue;
    const partner = visible.find(({ event: other }) => other.ownerId === 'sarim' && !pairedIds.has(other.id)
      && other.title === event.title && other.startUtc === event.startUtc && other.endUtc === event.endUtc);
    if (partner) {
      pairedIds.add(event.id);
      pairedIds.add(partner.event.id);
    }
  }

  const columns: Record<Column, typeof visible> = { deena: [], together: [], sarim: [] };
  for (const item of visible) columns[pairedIds.has(item.event.id) ? 'together' : item.event.ownerId].push(item);
  return {
    deena: layoutTimelineEvents(columns.deena),
    together: layoutTimelineEvents(columns.together),
    sarim: layoutTimelineEvents(columns.sarim),
  };
}

export function DailyTimeline({ day, nowUtc, events, mutualSlots, studySlots, zone, onEdit, onAdd }: {
  day: DateTime; nowUtc: DateTime; events: CalendarEvent[]; mutualSlots: TimeSlot[]; studySlots: TimeSlot[];
  zone: string; onEdit: (event: CalendarEvent) => void; onAdd: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const jump = (hour: number) => {
    const node = scroll.current;
    const canvas = node?.querySelector<HTMLElement>('.timeline-canvas');
    if (node && canvas) node.scrollTop = canvas.offsetTop + canvas.offsetHeight * hour / 24;
  };
  const scale = useMemo(() => timelineScale(day, zone), [day, zone]);
  const columns = useMemo(() => placeEvents(events, scale.clip), [events, scale]);
  const lanes = Math.max(1, ...Object.values(columns).flatMap(items => items.map(item => item.laneCount)));
  const now = scale.fraction(nowUtc);
  const renderEvents = (column: Column) => columns[column].map(placement =>
    <TimelineEvent key={placement.event.id} placement={placement} zone={zone} column={column} onEdit={onEdit} />);
  const renderSlots = (slots: TimeSlot[], study = false) => slots.flatMap(slot => {
    const span = scale.clip(slot);
    return span ? [<TogetherBlock key={`${slot.startUtc}-${study}`} slot={slot} span={span} zone={zone} study={study} />] : [];
  });

  return (
    <section className="timeline" aria-label="Daily schedule">
      <nav className="timeline-jumps" aria-label="Jump to time"><span>All 24 hours</span><button onClick={() => jump(0)}>Midnight</button><button onClick={() => jump(6)}>6 AM</button><button onClick={() => jump(12)}>Noon</button><button onClick={() => jump(23)}>11 PM</button></nav>
      <div ref={scroll} tabIndex={0} aria-label="Scrollable 24-hour schedule" className={`timeline-scroll${lanes >= 3 ? ' has-overlaps' : ''}`}>
        <div className="timeline-grid" style={{ '--lane-count': lanes } as CSSProperties}>
          <div className="timeline-head"><span>Time <small>MYT</small></span><span>Deena</span><span>Together</span><span>Sarim</span></div>
          <div className="timeline-canvas">
            <div className="hour-labels">{HOURS.map(hour => <span key={hour}>{hour}</span>)}</div>
            {now >= 0 && now < 1 && <div className="now-line" style={{ top: percent(now) }} aria-hidden="true"><i /><span>Now</span></div>}
            <div className="timeline-column deena-col">{renderEvents('deena')}</div>
            <div className="timeline-column together-col">
              {renderSlots(mutualSlots)}
              {renderSlots(studySlots, true)}
              {renderEvents('together')}
            </div>
            <div className="timeline-column sarim-col">{renderEvents('sarim')}</div>
          </div>
        </div>
      </div>
      <button className="floating-add" onClick={onAdd}>＋ New event</button>
    </section>
  );
}
