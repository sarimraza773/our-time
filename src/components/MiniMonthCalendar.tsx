import { DateTime } from 'luxon';

export function MiniMonthCalendar({ selected, today, onSelect }: { selected: DateTime; today: DateTime; onSelect: (day: DateTime) => void }) {
  const monthStart = selected.startOf('month');
  const offset = monthStart.weekday % 7;
  const cells = Array.from({ length: 42 }, (_, index) => monthStart.minus({ days:offset }).plus({ days:index }));
  return (
    <div className="mini-month" aria-label={`${selected.toFormat('LLLL yyyy')} calendar`}>
      <div className="mini-month-title">
        <button aria-label="Previous month" onClick={() => onSelect(selected.minus({ months:1 }))}>‹</button>
        <strong>{selected.toFormat('LLLL yyyy')}</strong>
        <button aria-label="Next month" onClick={() => onSelect(selected.plus({ months:1 }))}>›</button>
      </div>
      <div className="mini-grid mini-week"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div className="mini-grid mini-dates">
        {cells.map((day) => (
          <button key={day.toISODate()} className={`${day.month !== selected.month ? 'outside' : ''} ${day.hasSame(today,'day') ? 'today' : ''} ${day.hasSame(selected,'day') ? 'selected' : ''}`} onClick={() => onSelect(day)} aria-label={day.toFormat('cccc, LLLL d')} aria-current={day.hasSame(today,'day') ? 'date' : undefined}>{day.day}</button>
        ))}
      </div>
    </div>
  );
}
