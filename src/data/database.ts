import type { EventCategory, EventColor, OwnerId, RecurrencePattern } from '../types';
import type { Memory, Contribution } from '../lib/photobooth';
import type { BookTitle, BookKey, DiaryEntry } from '../lib/journal';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type ProfileRow = { id: string; display_name: string; person_key: OwnerId; timezone: string; created_at: string };
export type CalendarRow = { id: string; name: string; created_at: string; local_import_completed_at: string | null };
export type EventContent = {
  owner_user_id: string; owner_person_key: OwnerId; title: string; category: EventCategory;
  start_utc: string; end_utc: string; timezone: string; notes: string; open_to_study_together: boolean;
  color?: EventColor | null;
};
export type EventWrite = EventContent & { id: string; calendar_id: string };
export type EventRow = EventWrite & { created_at: string; updated_at: string };
export type RuleWrite = {
  id: string; calendar_id: string; owner_user_id: string; owner_person_key: OwnerId;
  title: string; category: EventCategory; timezone: string; local_start_time: string; local_end_time: string;
  pattern: RecurrencePattern; weekdays: number[]; enabled: boolean; notes: string; open_to_study_together: boolean;
  start_date?: string | null; end_date?: string | null; repeat_interval?: number; color?: EventColor | null;
};
export type RuleRow = RuleWrite & { created_at: string; updated_at: string };
export type ExceptionWrite = {
  calendar_id: string; recurring_rule_id: string; occurrence_key: string;
  exception_type: 'deleted' | 'override'; replacement_event: EventContent | null;
};
export type ExceptionRow = ExceptionWrite & { id: string; created_at: string; updated_at: string };
export type Snapshot = {
  calendar: CalendarRow; profiles: ProfileRow[]; events: EventRow[]; rules: RuleRow[]; exceptions: ExceptionRow[];
};
type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };
export type Database = {
  public: {
    Tables: {
      bookshelf_titles: Table<BookTitle, { calendar_id: string; book_key: BookKey; title: string }>;
      diary_entries: Table<Omit<DiaryEntry, 'formatting'> & { formatting: Json }, { id: string; calendar_id: string; title: string; content: string; formatting: Json }>;
      photo_memories: Table<Omit<Memory, 'stickers'> & { stickers: Json }, never>;
      photo_contributions: Table<Contribution, never>;
      profiles: Table<ProfileRow, never>;
      shared_calendars: Table<CalendarRow, never>;
      calendar_members: Table<{ calendar_id: string; user_id: string; role: 'editor' }, never>;
      calendar_events: Table<EventRow, EventWrite>;
      recurring_rules: Table<RuleRow, RuleWrite>;
      recurring_exceptions: Table<ExceptionRow, ExceptionWrite>;
    };
    Views: Record<string, never>;
    Functions: {
      load_shared_journal: { Args: { p_calendar_id: string }; Returns: Json };
      load_photo_memories: { Args: { p_calendar_id: string }; Returns: Json };
      save_photo_contribution: { Args: { p_memory: Json; p_paths: string[] }; Returns: undefined };
      load_shared_calendar: { Args: Record<string, never>; Returns: Json };
      import_local_calendar: { Args: { p_calendar_id: string; p_events: Json; p_rules: Json; p_exceptions: Json }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
