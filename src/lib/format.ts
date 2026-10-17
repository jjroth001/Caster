/** "4:05", "1:02:09"; "--:--" when unknown. */
export function clock(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '--:--';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "42 min", "1 h 5 min", "under 1 min". */
export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "24 min left", or "" when the length is unknown. */
export function timeLeft(positionS: number, durationS: number | null | undefined): string {
  if (!durationS) return '';
  const left = Math.max(0, durationS - positionS);
  return `${duration(left) || 'under 1 min'} left`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today", "Yesterday", "Mon" (this week), "Oct 9", or "Oct 9, 2024" for another year. */
export function releaseDate(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return '';
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const d = new Date(ms);
  if (days < 7) return DAYS[d.getDay()];
  const md = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${md}, ${d.getFullYear()}`;
}

/** "1.5×" with no trailing zeros. */
export function speedLabel(speed: number): string {
  return `${Number(speed.toFixed(2))}×`;
}

/** "3 h 12 min", "45 min", "2 days 4 h". */
export function span(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} days ${hours % 24} h`;
}
