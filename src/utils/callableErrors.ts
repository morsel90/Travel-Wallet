// ترجمة أخطاء الدوال السحابية (httpsCallable) إلى سببها الحقيقي — نظير
// utils/writeErrors.ts لأخطاء Firestore (القاعدة ١٠: لا تلقِ اللوم على الخطأ الخطأ).
// الحادثة التي أوجدته في DECISIONS.md.

/** يستخرج كود خطأ الدالة: 'functions/unauthenticated' → 'unauthenticated'. */
export function callableErrorCode(err: unknown): string {
  if (typeof err !== 'object' || err === null) return ''
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string') return ''
  return code.includes('/') ? code.split('/').pop() ?? '' : code
}

/**
 * نصّ الخادم لخطأ دالة سحابية جاهزاً للعرض، أو null إن لم يكن منها.
 *
 * ⚠️ SDK فايربيس 12.x يُلحق رمز HTTP بالرسالة («… [401]») فيوحي بعطل تقني حيث
 * الرفض مقصود — يُقصّ هنا. الموضع الوحيد الذي يعرف شكل خطأ الدالة؛ لا تقرأ
 * `message` مباشرةً في مكان آخر.
 */
export function callableMessage(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null
  const { code, message } = err as { code?: unknown; message?: unknown }
  if (typeof code !== 'string' || !code.startsWith('functions/')) return null
  if (typeof message !== 'string') return null
  const text = message.replace(/\s*\[\d{3}\]\s*$/, '').trim()
  return text || null
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

// ⚠️ توكن غير موجود ومُبطَل بالنص نفسه عمداً — لا يُكشف حال الرابط بالتخمين.
const INVALID_INVITE: CallableErrorDescription = {
  text: 'رابط الدعوة غير صالح أو أُبطل. اطلب من منظّم الرحلة رابطاً جديداً.',
  kind: 'input',
}

/**
 * @param err الخطأ كما وصل من httpsCallable لـ joinViaInvite
 *
 * ⚠️ `unauthenticated` غالباً ليس «غير مسجّل»: التوكن لم يصل (امتداد متصفح يُسقط
 * الترويسة). الرسالة تذكر الامتداد لأنه الأرجح والوحيد الذي يصلحه المستخدم.
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

    // ⚠️ كود جديد؟ أضف له حالة — لا توسّع هذا الفرع؛ رسالة واحدة لأسباب متعددة هي ما يمنعه الملف.
    default:
      return INVALID_INVITE
  }
}
