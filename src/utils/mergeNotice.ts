// 🆕 يُعلن أن uid المستخدم تغيّر أثناء ربط/دمج الحساب (مسار
// auth/credential-already-in-use أو auth/email-already-in-use في
// useAccountLink.ts)، حتى تُعرض ملاحظة واحدة بعد إعادة التحميل التالية.
//
// ⚠️ لماذا هذه الملاحظة ضرورية: mergeAnonymousTrips ينقل عضويات الرحلات، لكنه
// عمداً **لا ينقل createdByUid** على المصاريف القديمة (انظر التعليق في
// useAccountLink.ts وقسم "Design Decisions" في CLAUDE.md) — إعادة كتابة سجلّ
// مالي تاريخي أخطر من فائدة تعديل عابر. الأثر العملي: مصاريف سُجّلت *قبل*
// الربط تصبح للعرض فقط لهذا المستخدم (زرّا التعديل والحذف يختفيان في
// ExpenseListItem لأن createdByUid لم يعد يطابق uid الجديد)، بلا أي تفسير —
// كان يبدو مطابقاً لعدم امتلاك صلاحية من الأصل. هذه الملاحظة هي التفسير.
//
// sessionStorage لا localStorage: الملاحظة تخصّ إعادة التحميل التالية فقط
// (onLinked يستدعي window.location.reload() فوراً، فلا وقت لعرض Toast قبل
// ضياع حالة المكوّن) وتُستهلك مرة واحدة — تُحذف فور قراءتها.
const KEY = 'travelapp_uid_changed_notice'

/** يُستدعى فور نجاح signIn على الحساب القائم في مسار التعارض — قبل إعادة التحميل. */
export function markUidChanged(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // وضع تصفّح خاص صارم قد يمنع sessionStorage — فقدان هذه الملاحظة وحدها
    // لا يستحق كسر تدفّق الربط نفسه.
  }
}

/** true مرة واحدة فقط بعد markUidChanged — يحذف العلم فور قراءته. */
export function consumeUidChangedNotice(): boolean {
  try {
    if (sessionStorage.getItem(KEY) !== '1') return false
    sessionStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}
