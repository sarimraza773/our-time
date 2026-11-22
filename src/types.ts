export type OwnerId = 'deena' | 'sarim';

export type EventCategory =
  | 'class'
  | 'study'
  | 'sleep'
  | 'friends'
  | 'food'
  | 'freeTime'
  | 'personal'
  | 'dateNight'
  | 'call'
  | 'sharedTime';

export interface User {
  id: OwnerId;
  name: string;
  location: string;
  school: string;
  timezone: string;
  color: string;
}

export type RepeatFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurrencePattern = RepeatFrequency | 'weekdays' | 'custom';
export type EventColor = 'blush' | 'rose' | 'peony' | 'mauve' | 'shell' | 'berry';

export interface RecurringRule {
  id: string;
  ownerId: OwnerId;
  title: string;
  category: EventCategory;
  timezone: string;
  startTime: string;
  endTime: string;
  pattern: RecurrencePattern;
  weekdays: number[];
  startDate?: string;
  endDate?: string;
  interval?: number;
  color?: EventColor;
  active: boolean;
  notes: string;
  openToStudyTogether: boolean;
}

export interface CalendarEvent {
  id: string;
  ownerId: OwnerId;
  title: string;
  category: EventCategory;
  startUtc: string;
  endUtc: string;
  timezone: string;
  notes: string;
  color?: EventColor;
  isRecurring: boolean;
  recurrenceRule?: string;
  recurringRuleId?: string;
  openToStudyTogether: boolean;
  editable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TimeSlot {
  startUtc: string;
  endUtc: string;
  kind?: 'mutual' | 'study';
}

export interface StudyAvailability extends TimeSlot {
  ownerId: OwnerId;
  openToStudyTogether: boolean;
}
