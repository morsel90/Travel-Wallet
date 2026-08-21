// 🔴 المرحلة ١ من دورة حياة الرحلة التلقائية (active → completed → archived) —
// انظر functions/index.js: advanceTripLifecycleLogic، وdocs/DECISIONS.md.
// انتقال عكوس بالكامل، بلا أي حذف أو أثر على البيانات المالية — الأزرار
// اليدوية في TripDetailPanel.tsx تعمل دائماً بصرف النظر عن هذا المسار.
//
// 🆕 لا واجهة مستخدم هنا إطلاقاً — advanceTripLifecycleLogic دالة خادمية بحتة
// (Firestore Admin SDK فقط)، فهذا الاختبار يستدعيها مباشرة عبر require() بدل
// انتظار جدولة onSchedule حقيقية (تحتاج محاكي pubsub غير المشغَّل في
// test:e2e أصلاً) أو فتح متصفح. تحقّقنا فعلياً (لا افتراضاً) أن هذا الاستدعاء
// المباشر يعمل بشكل سليم ضد محاكي Firestore قبل كتابة هذا الملف.
import { createRequire } from 'module'
import { test, expect } from '@playwright/test'
import { adminFirestore } from './utils/seed'
import type { ItinerarySegment } from '../src/types'

const require = createRequire(import.meta.url)
const { advanceTripLifecycleLogic } = require('../functions/index.js') as {
  advanceTripLifecycleLogic: (now?: number) => Promise<{ completed: number; archived: number }>
}

const DAY_MS = 24 * 60 * 60 * 1000

function segmentEndingAt(arrivalTime: number): ItinerarySegment[] {
  return [{
    id: 'seg1',
    mode: 'flight',
    identifier: 'X1',
    departure: { location: 'أ', time: new Date(arrivalTime - 3600_000).toISOString() },
    arrival: { location: 'ب', time: new Date(arrivalTime).toISOString() },
  }]
}

test.describe('دورة حياة الرحلة التلقائية — advanceTripLifecycleLogic', () => {
  test('رحلة تمرّ فعلياً بكامل المسار: active → completed → archived، بفارق زمني كافٍ في كل مرحلة', async () => {
    const db = adminFirestore()
    const tripId = `e2e-lifecycle-full-${Date.now()}`
    const now = Date.now()

    // مسار انتهى قبل 40 يوماً — أبعد بكثير من مدة سماح "completed" (7 أيام).
    await db.collection('trips').doc(tripId).set({
      name: 'رحلة اختبار دورة الحياة',
      status: 'active',
      itinerary: segmentEndingAt(now - 40 * DAY_MS),
    })

    const first = await advanceTripLifecycleLogic(now)
    expect(first.completed).toBeGreaterThanOrEqual(1)

    const afterFirst = (await db.collection('trips').doc(tripId).get()).data()
    expect(afterFirst?.status).toBe('completed')
    expect(typeof afterFirst?.statusChangedAt).toBe('number')

    // ⚠️ لا انتظار 30 يوماً حقيقياً — نُرجع statusChangedAt يدوياً لمحاكاة
    // مرور الوقت، تماماً كما يفعل seed مباشر لأي حقل آخر في هذا الملف.
    await db.collection('trips').doc(tripId).update({
      statusChangedAt: now - 40 * DAY_MS,
    })

    const second = await advanceTripLifecycleLogic(now)
    expect(second.archived).toBeGreaterThanOrEqual(1)

    const afterSecond = (await db.collection('trips').doc(tripId).get()).data()
    expect(afterSecond?.status).toBe('archived')
  })

  test('رحلة نشِطة بمسار لم ينتهِ بعد لا تتأثر', async () => {
    const db = adminFirestore()
    const tripId = `e2e-lifecycle-still-active-${Date.now()}`
    const now = Date.now()

    await db.collection('trips').doc(tripId).set({
      name: 'رحلة لم تنتهِ بعد',
      status: 'active',
      itinerary: segmentEndingAt(now + 10 * DAY_MS), // في المستقبل
    })

    await advanceTripLifecycleLogic(now)

    const after = (await db.collection('trips').doc(tripId).get()).data()
    expect(after?.status).toBe('active')
    expect(after?.statusChangedAt).toBeUndefined()
  })

  test('رحلة نشِطة انتهى مسارها قبل أيام قليلة (داخل مدة السماح) لا تُنهى بعد', async () => {
    const db = adminFirestore()
    const tripId = `e2e-lifecycle-within-grace-${Date.now()}`
    const now = Date.now()

    // انتهى قبل يومين فقط — أقل من مدة سماح "completed" (7 أيام).
    await db.collection('trips').doc(tripId).set({
      name: 'رحلة انتهت للتوّ',
      status: 'active',
      itinerary: segmentEndingAt(now - 2 * DAY_MS),
    })

    await advanceTripLifecycleLogic(now)

    const after = (await db.collection('trips').doc(tripId).get()).data()
    expect(after?.status).toBe('active')
  })

  test('رحلة completed يدوياً حديثاً لا تُؤرشَف قبل أوانها', async () => {
    const db = adminFirestore()
    const tripId = `e2e-lifecycle-recent-completed-${Date.now()}`
    const now = Date.now()

    await db.collection('trips').doc(tripId).set({
      name: 'رحلة أُنهيت يدوياً منذ يوم',
      status: 'completed',
      statusChangedAt: now - 1 * DAY_MS, // أقل بكثير من مدة سماح "archived" (30 يوماً)
      itinerary: [],
    })

    await advanceTripLifecycleLogic(now)

    const after = (await db.collection('trips').doc(tripId).get()).data()
    expect(after?.status).toBe('completed')
  })

  test('رحلة بلا مسار (itinerary فارغ) تبقى active إلى الأبد — لا إشارة صادقة لمتى انتهت', async () => {
    const db = adminFirestore()
    const tripId = `e2e-lifecycle-no-itinerary-${Date.now()}`
    const now = Date.now()

    await db.collection('trips').doc(tripId).set({
      name: 'رحلة بلا مسار',
      status: 'active',
      itinerary: [],
    })

    await advanceTripLifecycleLogic(now)

    const after = (await db.collection('trips').doc(tripId).get()).data()
    expect(after?.status).toBe('active')
  })
})
