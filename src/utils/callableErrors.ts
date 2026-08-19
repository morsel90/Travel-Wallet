// 🆕 ترجمة أخطاء استدعاء الدوال السحابية (httpsCallable) إلى سببها الحقيقي —
// دوال بحتة (انظر callableErrors.test.ts).
//
// ⚠️ سبب وجود هذا الملف عطلٌ حقيقي كلّف ساعتين في 2026-08-13: مانع إعلانات على
// جهاز واحد كان يُسقط ترويسة `Authorization`، فترمي الدالة `unauthenticated`،
// فتعرض الواجهة **«رمز الرحلة غير صحيح»**. الرسالة أرسلت التشخيص في اتجاه
// خاطئ تماماً: بحثنا في الرمز وفي قاعدة البيانات وفي صلاحيات Cloud Run، بينما
// كان الخادم سليماً والرمز صحيحاً ولم يُقرأ أصلاً.
//
// هذا هو بعينه ما يعالجه utils/writeErrors.ts للكتابات («لا تلقِ اللوم على
// الشبكة»، القاعدة ١٠). الفرق أن ذاك يترجم أخطاء Firestore وهذا يترجم أخطاء
// الدوال.
//
// ── ما يبقى مُوحَّداً عمداً ───────────────────────────────────────────────────
// «الرمز خاطئ» و«الرحلة غير موجودة» يشتركان في رسالة واحدة، ويجب أن يبقيا كذلك:
// كلاهما يصل كـ `permission-denied` من verifyTripPin بنص واحد، وذلك كتمانٌ
// أمني مقصود يمنع اكتشاف وجود الرحلات بتخمين `?trip=` (انظر functions/index.js).
// أما `unauthenticated` و`internal` و`unavailable` فليست أمناً بل غموضاً، ولا
// مبرر لإخفائها.

/** يستخرج كود خطأ الدالة: 'functions/unauthenticated' → 'unauthenticated'. */
export function callableErrorCode(err: unknown): string {
  if (typeof err !== 'object' || err === null) return ''
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string') return ''
  return code.includes('/') ? code.split('/').pop() ?? '' : code
}

export interface CallableErrorDescription {
  /** النص المعروض للمستخدم. */
  text: string
  /**
   * هل السبب في المدخلات (الرمز) أم في البيئة؟
   * الواجهة تستخدمه لتقرر أين تضع التركيز: حقل الإدخال أم رسالة عامة.
   */
  kind: 'input' | 'environment'
}

const WRONG_PIN: CallableErrorDescription = {
  // ⚠️ لا تُفصّل هذه: نفس النص للرمز الخاطئ وللرحلة غير الموجودة — كتمان مقصود.
  text: 'رمز الرحلة غير صحيح، حاول مرة أخرى.',
  kind: 'input',
}

// 🆕 نظير WRONG_PIN لمسار joinViaInvite — نفس الكتمان الأمني (توكن غير موجود
// وتوكن مُبطَل رسالة واحدة، انظر functions/index.js)، لكن نصاً يخصّ الروابط لا
// الرمز اليدوي؛ عرض «رمز الرحلة غير صحيح» لمن ضغط رابطاً كان سيربكه بلا داعٍ.
const INVALID_INVITE: CallableErrorDescription = {
  text: 'رابط الدعوة غير صالح أو أُبطل. اطلب من منظّم الرحلة رابطاً جديداً.',
  kind: 'input',
}

/**
 * الأسباب البيئية مشتركة بين verifyTripPin وjoinViaInvite (نفس الأعراض: امتداد
 * متصفح، شبكة، خادم) — فقط نص الحالة الافتراضية (fallback) يختلف بينهما.
 *
 * ⚠️ `unauthenticated` **لا يعني أن المستخدم غير مسجّل** — التطبيق يُسجّل كل
 * زائر تلقائياً كمجهول. وصولها يعني أن التوكن لم يصل إلى الدالة: امتداد متصفح
 * يُسقط الترويسة (السبب الفعلي في حادثة 2026-08-13)، أو وسيط شبكة، أو جلسة
 * انتهت. ولهذا تذكر الرسالة الامتداد صراحةً: هو الاحتمال الأرجح والوحيد الذي
 * يستطيع المستخدم إصلاحه بنفسه.
 */
function describeCallableErrorWithFallback(err: unknown, fallback: CallableErrorDescription): CallableErrorDescription {
  const code = callableErrorCode(err)

  switch (code) {
    case 'permission-denied':
      return fallback

    case 'unauthenticated':
      return {
        text: 'تعذّر التحقق من هويتك. إن كنت تستخدم مانع إعلانات أو إضافة خصوصية، عطّلها لهذا الموقع ثم أعد المحاولة.',
        kind: 'environment',
      }

    case 'unavailable':
    case 'deadline-exceeded':
      return {
        text: 'تعذّر الوصول إلى الخادم. تحقّق من اتصالك وحاول مجدداً.',
        kind: 'environment',
      }

    case 'not-found':
      return {
        text: 'خدمة التحقق غير متاحة حالياً. أبلغ منظّم الرحلة.',
        kind: 'environment',
      }

    case 'internal':
      return {
        text: 'حدث خطأ في الخادم أثناء التحقق. حاول مجدداً، وأبلغ منظّم الرحلة إن تكرّر.',
        kind: 'environment',
      }

    // ⚠️ الافتراضي هو fallback المُمرَّر، لا رسالة عامة: أغلب حالات الفشل
    // الفعلية تقع في input (رمز خاطئ/رابط باطل)، والحالات المسمّاة أعلاه تغطي
    // ما عداها. لكن **أضف الكود هنا** متى ظهر كود جديد بدل توسيع هذا الفرع —
    // فالغرض من الملف كله ألا تُخفي رسالةٌ واحدة أسباباً متعددة.
    default:
      return fallback
  }
}

/** @param err الخطأ كما وصل من httpsCallable لـ verifyTripPin (FirebaseError بكود `functions/…`) */
export function describeCallableError(err: unknown): CallableErrorDescription {
  return describeCallableErrorWithFallback(err, WRONG_PIN)
}

/** @param err الخطأ كما وصل من httpsCallable لـ joinViaInvite (FirebaseError بكود `functions/…`) */
export function describeInviteError(err: unknown): CallableErrorDescription {
  return describeCallableErrorWithFallback(err, INVALID_INVITE)
}
