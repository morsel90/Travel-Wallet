// ─── منح/سحب صلاحية المسؤول (admin custom claim) ─────────────────────────────
// 🆕 يمنح (أو يسحب) الـ Custom Claim باسم `admin: true` لمستخدم عبر بريده
// الإلكتروني. هذا هو نفس الـ Claim الذي تتحقق منه قواعد Firestore في
// firestore.rules:
//     function isAdmin() { return isSignedIn() && request.auth.token.admin == true; }
//
// لماذا سكربت Admin SDK وليس واجهة أو Cloud Function؟
//   منح صلاحية المسؤول عملية حساسة جداً وتُنفَّذ نادراً (مرة واحدة عادةً)، فلا
//   يصح أبداً كشفها من العميل. تشغيلها يدوياً بصلاحيات serviceAccountKey.json —
//   نفس نمط create-trip.mjs — يبقيها خارج أي مسار وصول عام تماماً.
//
// الاستخدام:
//   node scripts/set-admin.mjs                      → تفاعلي (يسألك عن البريد والإجراء)
//   node scripts/set-admin.mjs grant user@mail.com  → منح مباشرة
//   node scripts/set-admin.mjs revoke user@mail.com → سحب مباشرة
//   node scripts/set-admin.mjs list  user@mail.com  → عرض الـ Claims الحالية فقط
//
// ⚠️ بعد المنح: يجب أن يُحدَّث رمز المستخدم (ID Token) قبل أن تسري الصلاحية —
// إمّا بتسجيل خروج ثم دخول، أو باستدعاء getIdToken(true) في العميل. الـ Claims
// لا تُطبَّق فوراً على الجلسة الحالية (يتجدد الرمز تلقائياً كل ساعة على الأكثر).

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'serviceAccountKey.json'), 'utf8'),
)

initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth()

const VALID_ACTIONS = ['grant', 'revoke', 'list']

async function main() {
  // قراءة الوسائط من سطر الأوامر إن وُجدت، وإلا السؤال تفاعلياً
  let [, , action, email] = process.argv

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q) => rl.question(q)

  try {
    if (!action) {
      action = (
        await ask('الإجراء (grant = منح / revoke = سحب / list = عرض): ')
      ).trim()
    }
    if (!VALID_ACTIONS.includes(action)) {
      console.error(`❌ إجراء غير معروف: "${action}" — استخدم grant أو revoke أو list.`)
      process.exit(1)
    }

    if (!email) {
      email = (await ask('البريد الإلكتروني للمستخدم: ')).trim()
    }
    if (!email) {
      console.error('❌ البريد الإلكتروني مطلوب.')
      process.exit(1)
    }

    // getUserByEmail يرمي auth/user-not-found إن لم يكن المستخدم مسجّلاً بعد —
    // المستخدم يجب أن يكون قد سجّل دخوله مرة واحدة على الأقل قبل منحه الصلاحية.
    let user
    try {
      user = await auth.getUserByEmail(email)
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.error(
          `❌ لا يوجد مستخدم بهذا البريد (${email}). يجب أن يسجّل دخوله في التطبيق مرة واحدة أولاً ثم أعد المحاولة.`,
        )
        process.exit(1)
      }
      throw err
    }

    const existing = user.customClaims || {}

    if (action === 'list') {
      console.log(`\n👤 ${email}  (uid: ${user.uid})`)
      console.log('📋 الـ Custom Claims الحالية:')
      console.log(JSON.stringify(existing, null, 2))
      return
    }

    if (action === 'grant') {
      if (existing.admin === true) {
        console.log(`ℹ️  المستخدم ${email} يملك صلاحية المسؤول مسبقاً — لا تغيير.`)
        return
      }
      // ⚠️ setCustomUserClaims يستبدل كامل قيمة الـ Claims ولا يدمجها — لذا ننشر
      // الموجود (مثل trips) ثم نضيف admin حتى لا نمسح عضويات الرحلات الحالية.
      await auth.setCustomUserClaims(user.uid, { ...existing, admin: true })
      console.log(`\n✅ تم منح صلاحية المسؤول للمستخدم ${email}.`)
    } else {
      // revoke — نحذف مفتاح admin فقط مع الإبقاء على بقية الـ Claims كما هي
      if (existing.admin !== true) {
        console.log(`ℹ️  المستخدم ${email} لا يملك صلاحية المسؤول أصلاً — لا تغيير.`)
        return
      }
      const { admin: _removed, ...rest } = existing
      await auth.setCustomUserClaims(user.uid, rest)
      console.log(`\n✅ تم سحب صلاحية المسؤول من المستخدم ${email}.`)
    }

    console.log(
      '⏳ لن تسري الصلاحية على جلسته الحالية إلا بعد تحديث الرمز — اطلب منه تسجيل الخروج ثم الدخول مرة أخرى (أو استدعاء getIdToken(true)).',
    )
  } finally {
    rl.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
