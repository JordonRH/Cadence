import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { fail } from './auth.mjs';

const text = max => z.string().trim().min(1).max(max);
export const profileSchema = z.object({language:text(80),goal:text(500),minutes:z.union([z.literal(5),z.literal(15),z.literal(30)])}).strict();
export const lessonSchema = z.object({
  session_id:text(128).min(8).describe('A unique session ID; reuse the same ID when retrying this save.'),
  language:text(80),title:text(160),summary:text(4000),
  skills:z.array(z.enum(['speaking','listening','reading','writing','vocabulary','grammar'])).min(1).max(6),
  minutes:z.number().int().min(1).max(240),
}).strict();
export const phrasesSchema = z.object({language:text(80),items:z.array(z.object({phrase:text(500),meaning:text(1000),context:z.string().trim().max(1000).default('')}).strict()).min(1).max(20)}).strict();
export const listSchema = z.object({language:text(80).optional(),limit:z.number().int().min(1).max(50).default(20),offset:z.number().int().min(0).max(10000).default(0)}).strict();
export function parse(schema,data) {
  const result=schema.safeParse(data);
  if(!result.success) fail(422,'Please check the learning fields and try again.');
  return result.data;
}
export function createLearning(db) {
  const profile=()=>db.prepare('SELECT language,goal,minutes FROM profile WHERE id=1').get() || null;
  const lessons=()=>db.prepare('SELECT id,language,title,summary,skills,minutes,created FROM lessons ORDER BY created DESC LIMIT 12').all().map(row=>({...row,skills:JSON.parse(row.skills)}));
  const listPhrases = input => {
    const {language,limit,offset}=parse(listSchema,input);
    const rows=language ? db.prepare('SELECT * FROM review_items WHERE language=? ORDER BY created DESC LIMIT ? OFFSET ?').all(language,limit,offset) : db.prepare('SELECT * FROM review_items ORDER BY created DESC LIMIT ? OFFSET ?').all(limit,offset);
    const count=language ? db.prepare('SELECT COUNT(*) AS count FROM review_items WHERE language=?').get(language).count : db.prepare('SELECT COUNT(*) AS count FROM review_items').get().count;
    return {items:rows,total:count,offset,next_offset:offset+rows.length<count ? offset+rows.length : null};
  };
  return {
    context:()=>({profile:profile(),recent_lessons:lessons(),saved_phrase_count:db.prepare('SELECT COUNT(*) AS count FROM review_items').get().count,mascot:'Echo',guidance:'Ask about current ability and goals when missing. Practise recall before revealing answers. Save selected summaries and phrases; never passwords, tokens or full conversation transcripts. Progress is practice evidence, not a certified fluency score.'}),
    setProfile:input=>{
      const data=parse(profileSchema,input);
      db.prepare('INSERT INTO profile VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET language=excluded.language,goal=excluded.goal,minutes=excluded.minutes').run(data.language,data.goal,data.minutes);
      return {profile:data};
    },
    saveLesson:input=>{
      const data=parse(lessonSchema,input);
      const existing=db.prepare('SELECT * FROM lessons WHERE id=?').get(data.session_id);
      if(existing) {
        if(existing.language!==data.language || existing.title!==data.title || existing.summary!==data.summary || existing.skills!==JSON.stringify(data.skills) || existing.minutes!==data.minutes) fail(409,'This session ID already has a different summary. Use a new session ID for another lesson.');
        return {id:existing.id,saved:true,already_saved:true};
      }
      db.prepare('INSERT INTO lessons VALUES (?,?,?,?,?,?,?)').run(data.session_id,data.language,data.title,data.summary,JSON.stringify(data.skills),data.minutes,Date.now());
      return {id:data.session_id,saved:true,already_saved:false};
    },
    listPhrases,
    savePhrases:input=>{
      const data=parse(phrasesSchema,input); let added=0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for(const item of data.items) added+=Number(db.prepare('INSERT OR IGNORE INTO review_items VALUES (?,?,?,?,?,?)').run(randomUUID(),data.language,item.phrase.normalize('NFC'),item.meaning,item.context,Date.now()).changes);
        db.exec('COMMIT');
      } catch(error) { db.exec('ROLLBACK'); throw error; }
      return {added,already_present:data.items.length-added};
    },
  };
}
