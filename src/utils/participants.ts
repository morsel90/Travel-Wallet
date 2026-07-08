import type { Traveler } from '../types'

// ─── أدوات المشاركين ──────────────────────────────────────────────────────────
// مصدر واحد لمنطق تحويل قائمة participants (معرّفات رقمية، أو أسماء مختصرة قديمة
// قبل الهجرة) إلى أسماء عرض، ولمطابقة مشارك مع مسافر. يدعم النوعين معاً للتوافق
// مع البيانات القديمة حتى يُشغَّل سكربت الهجرة.

/** هل يطابق هذا المسافرُ مدخلَ المشاركة (id رقمي أو اسم مختصر قديم)؟ */
export function matchesTraveler(t: Traveler, p: number | string): boolean {
  return typeof p === 'number' ? t.id === p : t.shortName === p
}

/** يحوّل قائمة المشاركين إلى أسماء عرض (الاسم المختصر، أو وسم احتياطي إن لم يُطابَق). */
export function toDisplayNames(
  participants: Array<number | string>,
  travelers: Traveler[],
): string[] {
  return participants.map(p => {
    if (typeof p === 'number') return travelers.find(t => t.id === p)?.shortName ?? `#${p}`
    return p // اسم مختصر قديم (قبل الهجرة)
  })
}

/** يحوّل قائمة المشاركين إلى معرّفات رقمية (يُسقط ما لا يُطابَق). يُستخدم عند تحرير مصروف. */
export function toIds(
  participants: Array<number | string>,
  travelers: Traveler[],
): number[] {
  return participants
    .map(p => (typeof p === 'number' ? p : travelers.find(t => t.shortName === p)?.id))
    .filter((id): id is number => typeof id === 'number')
}
