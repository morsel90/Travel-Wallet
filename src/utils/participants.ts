import type { Traveler } from '../types'

// ─── أدوات المشاركين ──────────────────────────────────────────────────────────
// مصدر واحد لمنطق تحويل قائمة participants (معرّفات رقمية) إلى أسماء عرض،
// ولمطابقة مشارك مع مسافر.

/** هل يطابق هذا المسافرُ مدخلَ المشاركة؟ */
export function matchesTraveler(t: Traveler, id: number): boolean {
  return t.id === id
}

/** يحوّل قائمة المشاركين إلى أسماء عرض (الاسم المختصر، أو وسم احتياطي إن لم يُطابَق). */
export function toDisplayNames(participants: number[], travelers: Traveler[]): string[] {
  return participants.map(id => travelers.find(t => t.id === id)?.shortName ?? `#${id}`)
}

/** يُسقط أي معرّف لا يطابق مسافراً موجوداً. يُستخدم عند تحرير مصروف. */
export function toIds(participants: number[], travelers: Traveler[]): number[] {
  const validIds = new Set(travelers.map(t => t.id))
  return participants.filter(id => validIds.has(id))
}
