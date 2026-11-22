import { motion, AnimatePresence } from 'framer-motion';
import type { RecurringRule } from '../types';
import { DateTime } from 'luxon';
import { FREQUENCIES } from './RepeatFields';

const ICONS: Record<string,string> = { class:'📚', sleep:'🌙', friends:'🫂', food:'🥗', study:'☑', personal:'✦', call:'☎', dateNight:'♥', sharedTime:'♥', freeTime:'○' };
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function subtitle(rule: RecurringRule) {
  if (rule.startDate && rule.pattern !== 'weekdays' && rule.pattern !== 'custom') {
    const interval = rule.interval ?? 1;
    const date = DateTime.fromISO(rule.startDate);
    const unit = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[rule.pattern];
    const cadence = interval === 1 ? FREQUENCIES[rule.pattern] : `Every ${interval} ${unit}`;
    const day = rule.pattern === 'weekly' ? (rule.weekdays.length ? rule.weekdays.map(value => DAYS[value - 1]).join(', ') : date.toFormat('ccc'))
      : rule.pattern === 'monthly' ? date.toFormat('d') : rule.pattern === 'yearly' ? date.toFormat('LLL d') : '';
    return [cadence, day, `${rule.startTime}–${rule.endTime}`].filter(Boolean).join(' · ');
  }
  const dayText = rule.pattern === 'daily' ? 'Every day' : rule.pattern === 'weekdays' ? 'Weekdays' : rule.weekdays.map((day)=>DAYS[day-1]).join(' · ');
  return `${dayText} · ${rule.startTime}–${rule.endTime}`;
}

export function RecurringSchedulePanel({ rules, onToggle, onEdit, onDelete, onAdd, onRefresh, onClose }: { rules:RecurringRule[]; onToggle:(id:string)=>void; onEdit:(rule:RecurringRule)=>void; onDelete:(id:string)=>void; onAdd:()=>void; onRefresh:()=>void; onClose?:()=>void }) {
  return (
    <motion.aside className="paper-panel recurring-panel" initial={{opacity:0,x:12}} animate={{opacity:1,x:0}}>
      <h3>Recurring Schedule <span><button title="Refresh recurring schedule" aria-label="Refresh recurring schedule" onClick={onRefresh}>↻</button>{onClose&&<button onClick={onClose} aria-label="Close schedule panel">×</button>}</span></h3>
      <div className="rules-list">
        <AnimatePresence initial={false}>
          {rules.map((rule)=>(
            <motion.div className={`rule-row ${!rule.active?'disabled':''}`} key={rule.id} layout exit={{opacity:0,height:0}}>
              <button className="rule-main" onClick={()=>onEdit(rule)}>
                <b>{ICONS[rule.category] ?? '✦'}</b><span>{rule.title}<small>{subtitle(rule)}</small></span>
              </button>
              <button role="switch" aria-checked={rule.active} className={`toggle ${rule.ownerId==='sarim'?'blue':''} ${rule.active?'on':''}`} onClick={()=>onToggle(rule.id)} aria-label={`${rule.active?'Disable':'Enable'} ${rule.title}`}><i /></button>
              <button className="rule-delete" onClick={()=>onDelete(rule.id)} aria-label={`Delete ${rule.title}`}>×</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <button className="add-rule" onClick={onAdd}>＋ Add New</button>
    </motion.aside>
  );
}
