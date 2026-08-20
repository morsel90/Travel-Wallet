// 🆕 ترجمة أخطاء استدعاء الدوال السحابية (httpsCallable) إلى سببها الحقيقي —
// دوال بحتة (انظر callableErrors.test.ts).
//
// ⚠️ سبب وجود هذا الملف عطلٌ حقيقي كلّف ساعتين في 2026-08-13: مانع إعلانات على
// جهاز واحد كان يُسقط ترويسة `Authorization`، فترمي الدالة `unauthenticated`،
// فتعرض الواجهة رسالة تخصّ المدخلات بدل البيئة. الرسالة أرسلت التشخيص في اتجاه
// خاطئ تماماً: بحثنا في المدخلات وفي قاعدة البيانات وفي صلاحيات Cloud Run،
// بينما كان الخادم سليماً ولم يصله التوكن أصلاً.
//
// هذا هو بعينه ما يعالجه utils/writeErrors.ts للكتابات («لا تلقِ اللوم على
// الشبكة»، القاعدة ١٠). الفرق أن ذاك يترجم أخطاء Firestore وهذا يترجم أخطاء
// الدوال.
//
// 🆕 كانت هذه الآلية مشتركة بين مسارين (verifyTripPin وjoinViaInvite)، فحملت
// معامل fallback عاماً. بعد إلغاء رمز الرحلة (انظر docs/DECISIONS.md) لم يبقَ
// سوى joinViaInvite، فطُويت الدالتان في describeInviteError مباشرة — لا قيمة
// في تجريد لمستدعٍ واحد.

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
   * هل السبب في المدخلات (الرابط) أم في البيئة؟
   * الواجهة تستخدمه لتقرر أين تضع التركيز: حقل الإدخال أم رسالة عامة.
   */
  kind: 'input' | 'environment'
}

// ⚠️ توكن غير موجود وتوكن مُبطَل يصلان بنفس النص — نفس الكتمان الأمني الذي
// كان معمولاً به لرمز الرحلة قبل إلغائه، لمنع اكتشاف حالة رابط الدعوة بالتخمين.
const INVALID_INVITE: CallableErrorDescription = {
  text: 'رابط الدعوة غير صالح أو أُبطل. اطلب من منظّم الرحلة رابطاً جديداً.',
  kind: 'input',
}

/**
 * @param err الخطأ كما وصل من httpsCallable لـ joinViaInvite (FirebaseError بكود `functions/…`)
 *
 * ⚠️ `unauthenticated` **لا يعني أن المستخدم غير مسجّل دخوله بنيّة** — قد يكون
 * فعلاً سجّل الدخول والتوكن ببساطة لم يصل الدالة: امتداد متصفح يُسقط الترويسة
 * (السبب الفعلي في حادثة 2026-08-13)، أو وسيط شبكة، أو جلسة انتهت. ولهذا تذكر
 * الرسالة الامتداد صراحةً: هو الاحتمال الأرجح والوحيد الذي يستطيع المستخدم
 * إصلاحه بنفسه.
 */
export function describeInviteError(err: unknown): CallableErrorDescription {
  const code = callableErrorCode(err)

  switch (code) {
    case 'permission-denied':
      return INVALID_INVITE

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
        text: 'خدمة الدعوة غير متاحة حالياً. أبلغ منظّم الرحلة.',
        kind: 'environment',
      }

    case 'internal':
      return {
        text: 'حدث خطأ في الخادم أثناء الانضمام. حاول مجدداً، وأبلغ منظّم الرحلة إن تكرّر.',
        kind: 'environment',
      }

    case 'failed-precondition':
      return {
        text: 'الانضمام يتطلب حساباً حقيقياً (Google أو بريد إلكتروني) — سجّل الدخول أولاً.',
        kind: 'input',
      }

    // ⚠️ الافتراضي هو INVALID_INVITE، لا رسالة عامة: أغلب حالات الفشل الفعلية
    // تقع في input (رابط باطل)، والحالات المسمّاة أعلاه تغطي ما عداها. لكن
    // **أضف الكود هنا** متى ظهر كود جديد بدل توسيع هذا الفرع — فالغرض من
    // الملف كله ألا تُخفي رسالةٌ واحدة أسباباً متعددة.
    default:
      return INVALID_INVITE
  }
}
