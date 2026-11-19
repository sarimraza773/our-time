import { AnimatePresence, motion } from 'framer-motion';
import { DateTime } from 'luxon';
import type { CurrentScheduleStatus } from '../lib/status';
import { OWNER_DETAILS } from '../lib/status';

function eventEnd(status: CurrentScheduleStatus) {
  if (!status.currentEvent) return '';
  return DateTime.fromISO(status.currentEvent.endUtc, { setZone: true })
    .setZone(OWNER_DETAILS[status.ownerId].timezone)
    .toFormat('h:mm a');
}

function nextCopy(status: CurrentScheduleStatus) {
  if (!status.nextEvent) return 'Nothing scheduled soon';
  const next = DateTime.fromISO(status.nextEvent.startUtc, { setZone: true }).setZone(OWNER_DETAILS[status.ownerId].timezone);
  const day = next.hasSame(status.localTime, 'day') ? '' : next.hasSame(status.localTime.plus({ days: 1 }), 'day') ? 'tomorrow ' : `${next.toFormat('ccc')} `;
  return `Next: ${status.nextEvent.title} ${day}at ${next.toFormat('h:mm a')}`;
}

function StatusCard({ status }: { status: CurrentScheduleStatus }) {
  const details = OWNER_DETAILS[status.ownerId];
  const headline = status.state === 'sleeping' ? 'Likely asleep' : status.currentEvent?.title ?? 'Free';
  const secondary = status.currentEvent ? `until ${eventEnd(status)}` : nextCopy(status);
  const statusKey = `${status.state}-${status.currentEvent?.id ?? 'free'}-${status.nextEvent?.id ?? 'none'}`;
  const minuteKey = status.localTime.toFormat('yyyy-LL-dd-HH-mm');

  return (
    <motion.article className={`live-card ${status.ownerId}`} whileHover={{ y: -2 }}>
      <div className="live-card-heading"><span className="live-dot" aria-hidden="true" /><b>{details.name.toUpperCase()}</b></div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.time key={minuteKey} className="live-clock" dateTime={status.localTime.toISO()!} aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {status.localTime.toFormat('h:mm a')} <small>· {details.location}</small>
        </motion.time>
      </AnimatePresence>
      <div className="sr-only">Local time {status.localTime.toFormat('h:mm a')}, {details.location}</div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={statusKey} className="live-activity" aria-live="polite" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}>
          <strong>{headline}</strong>
          {status.activeEvents.length > 1 && <span>+{status.activeEvents.length - 1} other commitment{status.activeEvents.length > 2 ? 's' : ''}</span>}
          <small>{secondary}</small>
        </motion.div>
      </AnimatePresence>
    </motion.article>
  );
}

export function LiveStatus({ deena, sarim }: { deena: CurrentScheduleStatus; sarim: CurrentScheduleStatus }) {
  const studyingTogether = deena.currentEvent?.category === 'study' && deena.currentEvent.openToStudyTogether
    && sarim.currentEvent?.category === 'study' && sarim.currentEvent.openToStudyTogether;
  const bothFree = deena.state === 'free' && sarim.state === 'free';

  return (
    <section className="live-status" aria-labelledby="right-now-title">
      <h2 id="right-now-title">Right now</h2>
      <div className="live-card-grid"><StatusCard status={deena} /><StatusCard status={sarim} /></div>
      <AnimatePresence mode="wait">
        {(studyingTogether || bothFree) && (
          <motion.p key={studyingTogether ? 'study' : 'free'} className="shared-now" initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} aria-live="polite">
            {studyingTogether ? '📚 You could study together right now' : '♥ You’re both free right now'}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
