import { DateTime } from 'luxon';
import type { OwnerId } from '../types';
import { calculateFreeSlots, calculateMutualFreeSlots, calculateStudyTogetherSlots, convertTimezone, formatRange, getEventsForDay } from './calendar';
import { resolveEventsForRange, type ScheduleSource } from './schedule';
import { getCurrentScheduleStatus, getNextFreeInstant, OWNER_DETAILS } from './status';

export interface BotCalendarContext extends ScheduleSource {
  timezone: string;
  currentUserId: OwnerId;
  now?: DateTime;
}

function requestedDay(message: string, now: DateTime) {
  const lower = message.toLowerCase();
  if (lower.includes('tomorrow')) return now.plus({ days: 1 }).startOf('day');
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const index = weekdays.findIndex((weekday) => lower.includes(weekday));
  if (index >= 0) {
    let days = (index + 1 - now.weekday + 7) % 7;
    if (days === 0 && !lower.includes('today')) days = 7;
    return now.plus({ days }).startOf('day');
  }
  return now.startOf('day');
}

function requestedTime(message: string, day: DateTime, now: DateTime) {
  if (/right now|currently|doing now/.test(message.toLowerCase())) return now;
  const match = message.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toLowerCase() === 'pm') hour += 12;
  return day.set({ hour, minute: Number(match[2] ?? 0), second: 0, millisecond: 0 });
}

const whoName = (id: OwnerId) => OWNER_DETAILS[id].name;

function targetOwner(lower: string, currentUserId: OwnerId): OwnerId {
  if (lower.includes('sarim')) return 'sarim';
  if (lower.includes('deena')) return 'deena';
  return currentUserId;
}

function eventsForDay(ctx: BotCalendarContext, day: DateTime) {
  const localStart = day.setZone(ctx.timezone).startOf('day');
  const resolved = resolveEventsForRange({
    ...ctx,
    rangeStart: localStart.toUTC(),
    rangeEnd: localStart.plus({ days: 1, hours: 2 }).toUTC(),
  });
  return getEventsForDay(resolved, day, ctx.timezone);
}

function zonedTime(isoUtc: string, zone: string) {
  const value = convertTimezone(isoUtc, zone);
  return `${value.toFormat('h:mm a')} ${value.offsetNameShort ?? ''}`.trim();
}

function statusAnswer(ownerId: OwnerId, instant: DateTime, ctx: BotCalendarContext) {
  const status = getCurrentScheduleStatus({ ...ctx, ownerId, nowUtc: instant.toUTC() });
  const name = whoName(ownerId);
  if (!status.currentEvent) {
    if (!status.nextEvent) return `${name} is free. Nothing else is scheduled soon.`;
    const nextLocal = convertTimezone(status.nextEvent.startUtc, OWNER_DETAILS[ownerId].timezone);
    return `${name} is free. Next is ${status.nextEvent.title} at ${nextLocal.toFormat('h:mm a')} ${nextLocal.offsetNameShort ?? ''}.`;
  }
  const endOwner = zonedTime(status.currentEvent.endUtc, OWNER_DETAILS[ownerId].timezone);
  const viewerEnd = zonedTime(status.currentEvent.endUtc, ctx.timezone);
  const overlap = status.activeEvents.length > 1 ? ` There ${status.activeEvents.length === 2 ? 'is' : 'are'} ${status.activeEvents.length - 1} other overlapping commitment${status.activeEvents.length > 2 ? 's' : ''}.` : '';
  const timeDetail = OWNER_DETAILS[ownerId].timezone === ctx.timezone
    ? `${endOwner} ${OWNER_DETAILS[ownerId].location} time`
    : `${endOwner} in ${OWNER_DETAILS[ownerId].location} — ${viewerEnd} in Kuala Lumpur`;
  return status.state === 'sleeping'
    ? `${name} is likely asleep until ${timeDetail}.${overlap}`
    : `${name} is in ${status.currentEvent.title} until ${timeDetail}.${overlap}${ownerId === 'sarim' ? ' 💙' : ' 🌸'}`;
}

function nextCommitmentAnswer(ownerId: OwnerId, nowUtc: DateTime, ctx: BotCalendarContext) {
  const status = getCurrentScheduleStatus({ ...ctx, ownerId, nowUtc });
  if (!status.nextEvent) return `${whoName(ownerId)} has nothing else scheduled soon.`;
  const local = convertTimezone(status.nextEvent.startUtc, OWNER_DETAILS[ownerId].timezone);
  const viewer = convertTimezone(status.nextEvent.startUtc, ctx.timezone);
  const secondZone = OWNER_DETAILS[ownerId].timezone === ctx.timezone ? '' : ` — ${viewer.toFormat('h:mm a')} ${viewer.offsetNameShort ?? ''} in Kuala Lumpur`;
  return `${whoName(ownerId)} has ${status.nextEvent.title} next at ${local.toFormat('h:mm a')} ${local.offsetNameShort ?? ''} in ${OWNER_DETAILS[ownerId].location}${secondZone}.`;
}

export function answerCalendarQuestion(message: string, ctx: BotCalendarContext): string {
  const lower = message.trim().toLowerCase();
  const nowUtc = (ctx.now ?? DateTime.utc()).toUTC();
  const now = nowUtc.setZone(ctx.timezone);
  const day = requestedDay(message, now);
  const events = eventsForDay(ctx, day);
  const target = targetOwner(lower, ctx.currentUserId);
  const targetName = whoName(target);
  const time = requestedTime(message, day, now);
  const isNowQuestion = /right now|currently|doing now/.test(lower)
    || (/^is\s+(sarim|deena|i)\s+free/.test(lower) && !/tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d/.test(lower));

  if ((lower.includes('study together') || (lower.includes('study') && lower.includes('both'))) && isNowQuestion) {
    const deena = getCurrentScheduleStatus({ ...ctx, ownerId: 'deena', nowUtc });
    const sarim = getCurrentScheduleStatus({ ...ctx, ownerId: 'sarim', nowUtc });
    const canStudy = deena.currentEvent?.category === 'study' && deena.currentEvent.openToStudyTogether
      && sarim.currentEvent?.category === 'study' && sarim.currentEvent.openToStudyTogether;
    return canStudy ? 'Yes — you both have opted-in study time right now. 📚' : 'Not right now — you do not both have overlapping opted-in study time.';
  }

  if ((lower.includes('both free') || lower.includes('we both')) && isNowQuestion) {
    const deena = getCurrentScheduleStatus({ ...ctx, ownerId: 'deena', nowUtc });
    const sarim = getCurrentScheduleStatus({ ...ctx, ownerId: 'sarim', nowUtc });
    return deena.state === 'free' && sarim.state === 'free'
      ? 'Yes — you’re both free right now. ♥'
      : `Not right now. ${statusAnswer('deena', now, ctx)} ${statusAnswer('sarim', now, ctx)}`;
  }

  if ((lower.includes('what are we doing') || lower.includes('what are both')) && isNowQuestion) {
    return `${statusAnswer('deena', now, ctx)} ${statusAnswer('sarim', now, ctx)}`;
  }

  if (isNowQuestion && (lower.includes('doing') || lower.includes('what is') || lower.includes('free'))) {
    const answer = statusAnswer(target, now, ctx);
    if (lower.includes('free')) return answer.includes(' is free') ? `Yes — ${answer}` : `No — ${answer}`;
    return answer;
  }

  if ((lower.includes('have next') || lower.includes('what do i have next') || lower.includes('what is next')) && !time) {
    return nextCommitmentAnswer(target, nowUtc, ctx);
  }

  if ((lower.includes('free next') || lower.includes('free again')) && !time) {
    const freeAt = getNextFreeInstant({ ...ctx, ownerId: target, nowUtc });
    if (!freeAt) return `${targetName} does not have a clear free opening in the next 48 hours.`;
    if (freeAt <= nowUtc) return `${targetName} is free right now.`;
    const ownerLocal = freeAt.setZone(OWNER_DETAILS[target].timezone);
    const viewerLocal = freeAt.setZone(ctx.timezone);
    const viewerCopy = OWNER_DETAILS[target].timezone === ctx.timezone ? '' : `, which is ${viewerLocal.toFormat('h:mm a')} ${viewerLocal.offsetNameShort ?? ''} in Kuala Lumpur`;
    return `${targetName} is free after ${ownerLocal.toFormat('h:mm a')} ${ownerLocal.offsetNameShort ?? ''} in ${OWNER_DETAILS[target].location}${viewerCopy}.`;
  }

  if ((lower.includes('doing') || lower.includes('what is')) && time) return statusAnswer(target, time, ctx);

  if (lower.includes('study together') || (lower.includes('study') && lower.includes('both'))) {
    const slots = calculateStudyTogetherSlots(events);
    if (slots.length) return `Yes — your study windows overlap ${day.hasSame(now, 'day') ? 'today' : day.toFormat('cccc')} from ${formatRange(slots[0], ctx.timezone)}. I’ll keep it cozy and quiet 📚`;
    return `I can’t find an overlapping open study block ${day.hasSame(now, 'day') ? 'today' : day.toFormat('cccc')}. Try another day and I’ll check again.`;
  }

  if (lower.includes('both free') || lower.includes('we both') || lower.includes('shared free') || lower.includes('date night')) {
    const slots = calculateMutualFreeSlots(events, day, ctx.timezone, 45)
      .filter((slot) => !lower.includes('tonight') || convertTimezone(slot.startUtc, ctx.timezone).hour >= 18)
      .filter((slot) => !lower.includes('date night') || convertTimezone(slot.startUtc, ctx.timezone).hour >= 18);
    if (slots.length) {
      const lead = lower.includes('date night') ? 'My best date-night window is' : 'You’re both free';
      return `${lead} ${day.hasSame(now, 'day') ? 'today' : day.toFormat('cccc')} from ${formatRange(slots[0], ctx.timezone)} 💗💙`;
    }
    return `No roomy overlap showed up ${day.hasSame(now, 'day') ? 'today' : day.toFormat('cccc')}, but I can check another day.`;
  }

  if (lower.includes('free')) {
    const slots = calculateFreeSlots(events, target, day, ctx.timezone, 30);
    if (slots.length) return `${targetName} is free ${day.hasSame(now, 'day') ? 'today' : day.toFormat('cccc')} from ${formatRange(slots[0], ctx.timezone)}${slots[1] ? `, then ${formatRange(slots[1], ctx.timezone)}` : ''}.`;
    return `${targetName} doesn’t have a clear free window in the visible day range.`;
  }

  if (lower.includes('class')) {
    const classes = events.filter((event) => event.ownerId === target && event.category === 'class').sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    if (!classes.length) return `${targetName} has no classes on ${day.toFormat('cccc')}.`;
    return `${targetName} has ${classes.map((event) => `${event.title} at ${convertTimezone(event.startUtc, ctx.timezone).toFormat('h:mm a')}`).join(' and ')} your time.`;
  }

  if (lower.includes('sleep')) {
    const sleep = events.find((event) => event.ownerId === target && event.category === 'sleep');
    if (sleep) return `${targetName}’s sleep window starts around ${zonedTime(sleep.startUtc, OWNER_DETAILS[target].timezone)} in ${OWNER_DETAILS[target].location}.`;
  }

  return 'I can check what either of you is doing now, what comes next, when you’re both free, or whether you can study together. Try “What is Sarim doing right now?” 🌸';
}
