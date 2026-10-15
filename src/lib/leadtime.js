// Working-day lead time (brLeadVal / rvLeadVal in the Power App).
// Counts weekdays that are not holidays from today up to the day before launch
// (or the effective date for extensions / updates). After the 15:00 cut-off,
// today no longer counts.
import { CUTOFF_HOUR } from './constants.js';
import { addDays, bkkParts, diffDays, isBlank, todayBkk, weekdayMon } from './util.js';

export function leadTimeWD(b, holidayDates) {
  const today = todayBkk();
  const ext = ['Extension', 'Update'].includes(b.brief_type) && !isBlank(b.effective_date);
  const target = ext ? b.effective_date : b.launch_date;
  if (isBlank(b.launch_date) || isBlank(target)) return 0;
  const d = diffDays(today, target);
  if (d <= 0) return 0;
  const hol = new Set(holidayDates);
  const working = (s) => weekdayMon(s) < 6 && !hol.has(s);
  let count = 0;
  for (let s = 0; s < d; s++) if (working(addDays(today, s))) count++;
  if (bkkParts().hh >= CUTOFF_HOUR && working(today)) count -= 1;
  return Math.max(0, count);
}
