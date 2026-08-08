// 🆕 ترجمة أخطاء كتابة Firestore إلى سبب حقيقي بالعربية — دوال بحتة (انظر
// writeErrors.test.ts).
//
// ⚠️ الفرضية التي كان الكود يبنى عليها خاطئة: كان يفترض أن رفض الكتابة يعني
// انقطاع الاتصال، فيقول «فشل الحفظ، يبدو أنك غير متصل بالإنترنت».
//
// الحقيقة أن `persistentLocalCache` (انظر firebase.ts) يجعل السلوك دون اتصال
// مختلفاً تماماً: الكتابة تُطبَّق على الكاش المحلي فوراً، وتُحفَظ في IndexedDB،
// وتُرسَل تلقائياً عند عودة الاتصال — و**وعد** setDoc/commit يبقى معلّقاً ولا
// يُرفض. فـ .catch() لا يعمل عند انقطاع الاتصال إطلاقاً.
//
// أي أن وصول الخطأ إلى هنا يعني أن الخادم رفض الكتابة فعلاً: قواعد، أو اسم
// محجوز، أو حدّ معدّل. وحين يرفض الخادم، يتراجع Firestore عن التعديل المحلي
// ويُطلق onSnapshot بلقطة مصحّحة — فيختفي الصف من القائمة. لهذا تذكر الرسائل
// أدناه أن الإدخال «تراجع»: هذا ما سيراه المستخدم بعينه بعد لحظة.
//
// ونتيجة أخرى مهمة: إعادة المحاولة لا تنفع مع سبب لن يتغيّر. زر إعادة المحاولة
// يُعرض فقط عندما retryable — انظر isRetryableCode.

/** أكواد يُجدي معها إعادة المحاولة: انقطاع مؤقت أو تعارض لحظي، لا رفض منطقي. */
const RETRYABLE_CODES = new Set([
  'unavailable',       // الخدمة غير متاحة مؤقتاً
  'deadline-exceeded', // انتهت المهلة قبل وصول التأكيد
  'aborted',           // تعارض في معاملة/دفعة — قد تنجح في المحاولة التالية
  'internal',          // خطأ داخلي عابر
  'cancelled',         // أُلغيت العملية (تنقّل/إغلاق تبويب)
])

/**
 * يستخرج كود خطأ Firestore. FirebaseError يحمل `code` مثل 'permission-denied'،
 * وبعض المسارات تحمله مسبوقاً بالخدمة ('firestore/permission-denied') — نتعامل
 * مع الشكلين حتى لا تنهار الترجمة لاختلاف بادئة.
 */
export function writeErrorCode(err: unknown): string {
  if (typeof err !== 'object' || err === null) return ''
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string') return ''
  return code.includes('/') ? code.split('/').pop() ?? '' : code
}

export function isRetryableCode(code: string): boolean {
  return RETRYABLE_CODES.has(code)
}

export interface WriteErrorDescription {
  /** نص يُعرض للمستخدم — يذكر السبب، ويذكر التراجع حين يكون قد حدث فعلاً. */
  text: string
  /** هل يُعرض زر «إعادة المحاولة»؟ false للأسباب التي لن تتغيّر بالتكرار. */
  retryable: boolean
}

/**
 * نوع العملية — يغيّر صياغة الرسالة، لأن «تراجع الإدخال» صحيح للإضافة لا للحذف.
 */
export type WriteAction = 'create' | 'edit' | 'delete' | 'restore' | 'generic'

const REVERTED: Record<WriteAction, string> = {
  create:  'ولم يُسجَّل المصروف',
  edit:    'ولم تُحفظ التعديلات',
  delete:  'ولم يُحذف',
  restore: 'ولم تتم الاستعادة',
  generic: 'ولم يُحفظ التغيير',
}

/**
 * يحوّل خطأ كتابة إلى رسالة تشرح السبب الفعلي وتوضّح أن التغيير لم يثبت.
 *
 * تُستخدم للكتابات المتفائلة تحديداً: المستخدم رأى رسالة نجاح قبل قليل، ثم
 * سيرى الصف يختفي (تراجع Firestore التلقائي). بلا هذه الرسالة يبدو الاختفاء
 * عطلاً عشوائياً في التطبيق.
 */
export function describeWriteError(err: unknown, action: WriteAction = 'generic'): WriteErrorDescription {
  const code = writeErrorCode(err)
  const reverted = REVERTED[action]

  switch (code) {
    case 'permission-denied':
      return {
        text: `لا تملك الصلاحية لهذا الإجراء ${reverted}.`,
        retryable: false,
      }
    case 'resource-exhausted':
      return {
        text: `تجاوزت الحد المسموح من العمليات — تمهّل قليلاً ${reverted}.`,
        retryable: false,
      }
    case 'already-exists':
      return {
        text: `العنصر موجود مسبقاً ${reverted}.`,
        retryable: false,
      }
    case 'not-found':
      return {
        text: `العنصر غير موجود — قد يكون حُذف من جهاز آخر ${reverted}.`,
        retryable: false,
      }
    case 'invalid-argument':
    case 'failed-precondition':
      return {
        text: `البيانات غير مقبولة من الخادم ${reverted}.`,
        retryable: false,
      }
    case 'unauthenticated':
      return {
        text: `انتهت جلستك ${reverted} — أعد تحميل الصفحة.`,
        retryable: false,
      }
    default:
      if (isRetryableCode(code)) {
        return {
          text: `تعذّر الوصول للخادم مؤقتاً ${reverted}.`,
          retryable: true,
        }
      }
      // كود غير معروف: لا ندّعي معرفة السبب، ولا ندّعي أنه انقطاع اتصال.
      return {
        text: `تعذّر إتمام العملية ${reverted}.`,
        retryable: true,
      }
  }
}
