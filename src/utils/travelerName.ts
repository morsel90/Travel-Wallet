// أدوات اسم المسافر ومعرّفه. الاسم المختصر يُستخدم لمطابقة المشاركين في
// المصاريف القديمة، وكمعرّف مستند travelerNames/{shortName} الذي يفرض التفرّد —
// ولهذا الثاني وُجدت isValidNameKey.

/** أول كلمة من الاسم. `\s+` لا ' ': المسافات المتتالية وغير المعتادة شائعة في الأسماء المنسوخة. */
export function deriveShortName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}

/**
 * هل يصلح الاسم معرّفَ مستند؟ قيود Firestore نفسها — والحدّ بالبايتات لا
 * بالمحارف (الحرف العربي بايتان). يحوّل اسماً غريباً إلى رسالة مفهومة بدل
 * فشل كتابة غامض عند المزامنة.
 */
export function isValidNameKey(shortName: string): boolean {
  if (!shortName) return false
  if (shortName.includes('/')) return false
  if (shortName === '.' || shortName === '..') return false
  if (/^__.*__$/.test(shortName)) return false
  return new TextEncoder().encode(shortName).length <= 1500
}

/**
 * معرّف مسافر عشوائي.
 *
 * ⚠️ لا «أكبر معرّف + 1»: إضافتان متزامنتان تأخذان الرقم نفسه فيكتب الثاني فوق
 * الأول ويختفي مسافر برصيده بصمت. المدى موجب وأقل من 2^31 لأن القواعد تشترط
 * `d.id is int`.
 */
export function newTravelerId(): number {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return (bytes[0] % 2_147_483_646) + 1
}
