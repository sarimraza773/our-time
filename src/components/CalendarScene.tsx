import { motion } from 'framer-motion';
import { DateTime } from 'luxon';
import type { CalendarEvent, OwnerId, RecurringRule, TimeSlot } from '../types';
import { BotanicalDecoration, PerspectiveSelector, Sticker } from './ScenePieces';
import { MiniMonthCalendar } from './MiniMonthCalendar';
import { DailyTimeline } from './DailyTimeline';
import { RecurringSchedulePanel } from './RecurringSchedulePanel';
import { CalendarBot, type BotMessage } from './CalendarBot';
import { LiveStatus } from './LiveStatus';
import type { CurrentScheduleStatus } from '../lib/status';
import type { ReactNode } from 'react';
import { publicAsset } from '../lib/assets';

interface CalendarSceneProps {
  bookshelf?: ReactNode;
  perspective: 'deena'; authenticatedPerson: OwnerId; day: DateTime; today: DateTime; nowUtc: DateTime; deenaStatus: CurrentScheduleStatus; sarimStatus: CurrentScheduleStatus; events: CalendarEvent[]; rules: RecurringRule[];
  mutualSlots: TimeSlot[]; studySlots: TimeSlot[]; botMessages: BotMessage[]; isFullscreen: boolean;
  drawer: 'schedule'|'bot'|null; toast: string; onSelectDay:(day:DateTime)=>void; onToday:()=>void;
  onEditEvent:(event:CalendarEvent)=>void; onAddEvent:()=>void; onToggleRule:(id:string)=>void;
  onEditRule:(rule:RecurringRule)=>void; onDeleteRule:(id:string)=>void; onAddRule:()=>void;
  onAskBot:(text:string)=>void; onToggleFullscreen:()=>void; onDrawer:(drawer:'schedule'|'bot'|null)=>void;
  onRefresh:()=>void; onSarim:()=>void; onSignOut:()=>void;
}

export function HangingCalendar(props: CalendarSceneProps) {
  const {day,today,events,rules,mutualSlots,studySlots,botMessages,isFullscreen,drawer,toast}=props;
  return (
    <motion.section layoutId="calendar-paper" className={`calendar-wrap ${isFullscreen?'fullscreen':''}`} transition={{layout:{duration:.78,ease:[.2,.8,.2,1]}}} onDoubleClick={(e)=>{if((e.target as HTMLElement).closest('button,input,select,textarea'))return;props.onToggleFullscreen()}}>
      <div className="hanging-cord" aria-hidden="true" />
      <div className="ribbon" aria-hidden="true"><span /><i /><b /></div>
      <div className="calendar-mascot" aria-hidden="true">
        <Sticker className="sticker-rupert" src={publicAsset('assets/sticker-rupert.jpeg')} alt="Blue sleepy character sticker" />
      </div>
      <div className="calendar-paper">
        <Sticker className="sticker-sammy" src={publicAsset('assets/sticker-sammy.jpeg')} alt="Relax candle character sticker" />
        <header className="calendar-header">
          <div className="today-copy"><p className="eyebrow">Deena’s daily planner</p><h1>{day.hasSame(today,'day')?'Today':day.toFormat('cccc')} <span>♥</span></h1><p>“One step today, closer to the life we’re building.”</p></div>
          <MiniMonthCalendar selected={day} today={today} onSelect={props.onSelectDay} />
        </header>
        <div className="date-row">
          <button aria-label="Previous day" onClick={()=>props.onSelectDay(day.minus({days:1}))}>‹</button>
          <motion.h2 key={day.toISODate()} initial={{opacity:0,x:14}} animate={{opacity:1,x:0}}>{day.toFormat('cccc, LLLL d, yyyy')}</motion.h2>
          <button aria-label="Next day" onClick={()=>props.onSelectDay(day.plus({days:1}))}>›</button>
          <button className="today-button" onClick={props.onToday}>Today</button>
          <button className="compact-fullscreen" onClick={props.onToggleFullscreen}>{isFullscreen?'↙ Exit':'⛶ Focus'}</button>
        </div>
        <div className="planner-grid">
          <DailyTimeline day={day} nowUtc={props.nowUtc} events={events} mutualSlots={mutualSlots} studySlots={studySlots} zone="Asia/Kuala_Lumpur" onEdit={props.onEditEvent} onAdd={props.onAddEvent} />
          <aside className="right-rail"><RecurringSchedulePanel rules={rules} onToggle={props.onToggleRule} onEdit={props.onEditRule} onDelete={props.onDeleteRule} onAdd={props.onAddRule} onRefresh={props.onRefresh} /><CalendarBot messages={botMessages} onAsk={props.onAskBot} mobileOpen={false} onClose={()=>{}} /></aside>
        </div>
        <Sticker className="sticker-chadwick" src={publicAsset('assets/sticker-chadwick.jpeg')} alt="Soft pastel resting character sticker" />
        <Sticker className="sticker-carlisle" src={publicAsset('assets/sticker-carlisle.jpeg')} alt="Blue cracked-head character sticker" />
      </div>
      {toast&&<motion.div className="toast" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}>{toast}</motion.div>}
      {drawer==='schedule'&&<div className="mobile-sheet"><RecurringSchedulePanel rules={rules} onToggle={props.onToggleRule} onEdit={props.onEditRule} onDelete={props.onDeleteRule} onAdd={props.onAddRule} onRefresh={props.onRefresh} onClose={()=>props.onDrawer(null)} /></div>}
      <CalendarBot messages={botMessages} onAsk={props.onAskBot} mobileOpen={drawer==='bot'} onClose={()=>props.onDrawer(null)} />
    </motion.section>
  );
}

export function CalendarScene(props: CalendarSceneProps) {
  return <main className={`room-shell ${props.isFullscreen?'is-fullscreen':''}`}><BotanicalDecoration /><PerspectiveSelector perspective={props.perspective} authenticatedPerson={props.authenticatedPerson} onSarim={props.onSarim} onSignOut={props.onSignOut} />{props.bookshelf}<LiveStatus deena={props.deenaStatus} sarim={props.sarimStatus} /><HangingCalendar {...props} /><button className="fullscreen-hint" onClick={props.onToggleFullscreen}>⛶ <span>Press <kbd>F</kbd> for full screen</span></button><nav className="mobile-nav" aria-label="Calendar tools"><button onClick={props.onToday}>⌂<span>Today</span></button><button onClick={()=>props.onDrawer('schedule')}>↻<span>Schedule</span></button><button className="mobile-add" onClick={props.onAddEvent}>＋<span>New</span></button><button onClick={()=>props.onDrawer('bot')}>✿<span>Bot</span></button><button onClick={props.onToggleFullscreen}>⛶<span>Focus</span></button></nav></main>;
}

export const FullscreenCalendar = HangingCalendar;
