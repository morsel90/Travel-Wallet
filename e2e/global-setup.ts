// 🔴 تسخين عمّال محاكي الدوال قبل أي اختبار.
//
// محاكي الدوال يشغّل عملية Node جديدة لكل دالة عند أول استدعاء لها، وكلفة ذلك
// 2–5 ثوانٍ تحت حمل المتصفحات المتوازية (قيست 2026-10-02 من سجلات --debug:
// addWorker ← أول POST). تحميل functions/index.js نفسه ~0.2 ثانية، فالكلفة كلها
// من المحاكي لا من كود الدوال ولا اعتمادياتها. هذه الثواني كانت تسقط على أول
// اختبار يستدعي الدالة — أيّاً كان — فتأكل نصف مهلة expect (10 ثوانٍ) ويفشل
// اختبار مختلف في كل تشغيل (auth-gate مرة، settlement-record مرة).
//
// الطلب بلا توكن يكفي: المحاكي يُقلع العامل قبل أن يرى الطلب، والدالة ترفضه
// بـ unauthenticated فوراً بلا أي كتابة. العامل يبقى خاملاً ويُعاد استخدامه.
import { readFileSync } from 'node:fs'
import { E2E_PROJECT_ID } from './utils/seed'

const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001'

// من المصدر لا قائمة يدوية — دالة onCall جديدة تُسخَّن تلقائياً دون تذكّر هذا الملف.
function callableNames(): string[] {
  const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8')
  return [...source.matchAll(/^exports\.(\w+) = onCall\(/gm)].map(m => m[1])
}

export default async function globalSetup(): Promise<void> {
  const names = callableNames()
  if (names.length === 0) throw new Error('لم يُعثر على أي دالة onCall في functions/index.js — تغيّر نمط التصدير؟')

  await Promise.all(names.map(async name => {
    const res = await fetch(`http://${FUNCTIONS_HOST}/${E2E_PROJECT_ID}/us-central1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    })
    // 401 هو المتوقع؛ 404 يعني أن الدالة لم تُحمَّل في المحاكي أصلاً — أفضل أن نعرف الآن.
    if (res.status === 404) throw new Error(`محاكي الدوال لا يعرف ${name}`)
  }))
}
