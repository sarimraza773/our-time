import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface BotMessage { id:string; role:'bot'|'user'; text:string }

export function CalendarBot({ messages, onAsk, mobileOpen, onClose }: { messages:BotMessage[]; onAsk:(text:string)=>void; mobileOpen:boolean; onClose:()=>void }) {
  const [text,setText] = useState('');
  const submit = (event:React.FormEvent) => { event.preventDefault(); if(!text.trim()) return; onAsk(text.trim()); setText(''); };
  return (
    <motion.section className={`paper-panel calendar-bot ${mobileOpen?'mobile-open':''}`} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} aria-label="Deena's calendar assistant">
      <h3>Deena’s Bot <span>✿ <button onClick={onClose} aria-label="Close bot">×</button></span></h3>
      <div className="bot-messages" aria-live="polite">
        <AnimatePresence initial={false}>
          {messages.map((message)=><motion.p key={message.id} className={message.role} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>{message.text}</motion.p>)}
        </AnimatePresence>
      </div>
      <form onSubmit={submit}><label className="sr-only" htmlFor="bot-message">Message Deena's Bot</label><input id="bot-message" value={text} onChange={(e)=>setText(e.target.value)} placeholder="When are we both free?" /><button aria-label="Send message">↗</button></form>
      <div className="bot-suggestions">
        <button onClick={()=>onAsk('When are we both free tonight?')}>Both free tonight?</button>
        <button onClick={()=>onAsk('Can we study together Wednesday?')}>Study together?</button>
      </div>
    </motion.section>
  );
}
