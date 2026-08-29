// اختبارات مسار إزالة العضو وحده من useTripAdminActions — بقية الدوال تكتب
// مباشرةً عبر القواعد وتغطّيها اختبارات firestore.rules.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTripAdminActions } from './useTripAdminActions'

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  httpsCallable: vi.fn(),
  callable: vi.fn(),
  getIdToken: vi.fn(),
  currentUser: null as { getIdToken: (force?: boolean) => Promise<string> } | null,
  downloadTripBackup: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({ setDoc: mocks.setDoc, getDoc: mocks.getDoc, getDocs: mocks.getDocs }))
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.httpsCallable }))
vi.mock('../firebase', () => ({
  functions: {},
  auth: { get currentUser() { return mocks.currentUser } },
}))
vi.mock('../firestore', () => ({
  tripDocById: vi.fn(() => ({})),
  // 🆕 كل واحدة تُعيد كائناً موسوماً بنوع المجموعة، فيميّز getDocs الموهم أيّها
  // استُدعيت به دون الحاجة لمحاكاة Firestore الحقيقي.
  expensesColByTrip: vi.fn((tripId: string) => ({ _tag: 'expenses', tripId })),
  travelersColByTrip: vi.fn((tripId: string) => ({ _tag: 'travelers', tripId })),
  travelerNamesColByTrip: vi.fn((tripId: string) => ({ _tag: 'travelerNames', tripId })),
  depositLogsColByTrip: vi.fn((tripId: string, travelerId: number) => ({ _tag: 'depositLogs', tripId, travelerId })),
}))
vi.mock('../utils/haptics', () => ({ haptic: { success: vi.fn(), error: vi.fn() } }))
// buildTripBackup حقيقية (لها اختباراتها الخاصة في utils/backup.test.ts)؛
// downloadTripBackup وحدها ممنوَّة — تلمس DOM (Blob/عنصر <a>) ولا قيمة في
// محاكاة ذلك هنا، فالمهم اختباره أنها استُدعيت لا كيف تعمل داخلياً.
vi.mock('../utils/backup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/backup')>()),
  downloadTripBackup: mocks.downloadTripBackup,
}))

const showToast = vi.fn()
const handleFirestoreError = vi.fn()

const setup = (isAdmin = true, organizerTripId: string | null = null) =>
  renderHook(() => useTripAdminActions({ isAdmin, organizerTripId, showToast, handleFirestoreError }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUser = { getIdToken: mocks.getIdToken }
  mocks.getIdToken.mockResolvedValue('tok')
  mocks.httpsCallable.mockReturnValue(mocks.callable)
  mocks.callable.mockResolvedValue({ data: { success: true, claimRemoved: true, stillHasAccess: false } })
  mocks.setDoc.mockResolvedValue(undefined)
  mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })
  mocks.getDocs.mockImplementation((ref: { _tag?: string }) => {
    if (ref._tag === 'travelers') {
      return Promise.resolve({ docs: [{ id: '1', data: () => ({ id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 0 }) }] })
    }
    if (ref._tag === 'expenses') {
      return Promise.resolve({
        docs: [{
          id: 'e1',
          data: () => ({
            date: '2026-01-01', description: 'عشاء', amount: 100, originalAmount: 100,
            currency: 'SAR', exchangeRate: 1, participants: [1], createdAt: 1,
          }),
        }],
      })
    }
    return Promise.resolve({ docs: [] })
  })
})

const tripSummary = {
  id: 'trip-1', name: 'رحلة تركيا',
  itinerary: [], status: 'active' as const, tripType: 'standard' as const,
}

describe('removeMember — الصلاحية والعقد', () => {
  it('غير المسؤول لا يستدعي الدالة إطلاقاً', async () => {
    const { result } = setup(false)
    let ok
    await act(async () => { ok = await result.current.removeMember('trip-1', 'u1') })

    expect(ok).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
  })

  it('يستدعي manageMember بالوضع والمعرّفين الصحيحة', async () => {
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })

    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'manageMember')
    expect(mocks.callable).toHaveBeenCalledWith({ mode: 'remove', tripId: 'trip-1', uid: 'u1' })
  })

  // ⚠️ الـ claim لا يتحدّث إلا بتوكن جديد؛ مسؤولٌ مُنح صلاحيته للتوّ يحمل توكناً
  // بلا admin، فتردّه الدالة بـ permission-denied رغم أنه مسؤول فعلاً.
  it('يجدّد التوكن قبل الاستدعاء', async () => {
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })
    expect(mocks.getIdToken).toHaveBeenCalledWith(true)
  })
})

// ⚠️ الرسالة ليست تجميلاً: «تمت الإزالة» وحدها تكذب في حالتين مختلفتين، وفي
// إحداهما قد يعتمد المسؤول عليها في تسرّب فعلي للرمز.
describe('removeMember — الرسالة تقول ما حدث فعلاً', () => {
  it('الإزالة الناجحة تذكر تأخير الساعة صراحةً', async () => {
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })

    expect(showToast.mock.calls[0][0].text).toContain('حتى ساعة')
  })

  it('إزالة مسؤول تُعلن أن وصوله باقٍ — صلاحيته عامة لا تمرّ بعضوية الرحلة', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, claimRemoved: true, stillHasAccess: true } })
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'admin-2') })

    const text = showToast.mock.calls[0][0].text
    expect(text).toContain('مسؤول')
    expect(text).not.toContain('حتى ساعة')
  })

  it('من لم يكن عضواً: تنظيف سطر لا إزالة — ولا يُوعَد بقطع وصول لم يقع', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, claimRemoved: false, stillHasAccess: false } })
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'ghost') })

    expect(showToast.mock.calls[0][0].text).toContain('لم يكن عضواً')
  })
})

// 🆕 المرحلة ٣: منظّم الرحلة يستطيع نفس الاستدعاء، لكن مقصوراً على رحلته
// تحديداً — الفحص الحقيقي (منظّم لا يزيل مسؤولاً/منظّماً آخر) خادمي بالكامل،
// انظر اختبارات functions/index.js المباشرة ضد المحاكي (منفصلة عن هذا الملف).
describe('removeMember — منظّم الرحلة (المرحلة ٣)', () => {
  it('منظّم رحلته يستدعي الدالة بنجاح', async () => {
    const { result } = setup(false, 'trip-1')
    let ok
    await act(async () => { ok = await result.current.removeMember('trip-1', 'u1') })

    expect(ok).toBe(true)
    expect(mocks.callable).toHaveBeenCalledWith({ mode: 'remove', tripId: 'trip-1', uid: 'u1' })
  })

  it('منظّم رحلة أخرى لا يستدعي الدالة لرحلة ليست رحلته', async () => {
    const { result } = setup(false, 'trip-1')
    let ok
    await act(async () => { ok = await result.current.removeMember('trip-2', 'u1') })

    expect(ok).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
  })
})

describe('setMemberRole — المسؤول العالمي حصراً', () => {
  it('منظّم الرحلة نفسه لا يستطيع تعيين دور — لا حتى لرحلته', async () => {
    const { result } = setup(false, 'trip-1')
    let ok
    await act(async () => { ok = await result.current.setMemberRole('trip-1', 'u1', 'organizer') })

    expect(ok).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
  })

  it('المسؤول يستدعي manageMember بالوضع والدور الصحيحين', async () => {
    const { result } = setup()
    await act(async () => { await result.current.setMemberRole('trip-1', 'u1', 'organizer') })

    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'manageMember')
    expect(mocks.callable).toHaveBeenCalledWith({ mode: 'setRole', tripId: 'trip-1', uid: 'u1', role: 'organizer' })
  })

  it('رسالة الدالة العربية عند الفشل تُعرض كما هي', async () => {
    mocks.callable.mockRejectedValue(
      Object.assign(new Error('هذا الحساب لم ينضم لهذه الرحلة بعد.'), { code: 'functions/failed-precondition' }),
    )
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.setMemberRole('trip-1', 'ghost', 'organizer') })

    expect(ok).toBe(false)
    expect(showToast.mock.calls[0][0].text).toBe('هذا الحساب لم ينضم لهذه الرحلة بعد.')
  })
})

describe('removeMember — الفشل', () => {
  it('رسالة الدالة العربية تُعرض كما هي', async () => {
    mocks.callable.mockRejectedValue(
      Object.assign(new Error('هذا الإجراء متاح للمسؤول فقط.'), { code: 'functions/permission-denied' }),
    )
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.removeMember('trip-1', 'u1') })

    expect(ok).toBe(false)
    expect(showToast.mock.calls[0][0].text).toBe('هذا الإجراء متاح للمسؤول فقط.')
  })

  it('خطأ غير خاص بالدوال يمرّ لمعالج أخطاء Firestore', async () => {
    mocks.callable.mockRejectedValue(new Error('network'))
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })

    expect(handleFirestoreError).toHaveBeenCalled()
  })

  it('يحرّر علم الحفظ بعد الفشل فيبقى الزر قابلاً لإعادة المحاولة', async () => {
    mocks.callable.mockRejectedValue(new Error('boom'))
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'u1') })

    expect(result.current.isSaving).toBe(false)
  })
})

describe('exportBackup', () => {
  it('غير المسؤول لا يقرأ شيئاً', async () => {
    const { result } = setup(false)
    let ok
    await act(async () => { ok = await result.current.exportBackup(tripSummary) })

    expect(ok).toBe(false)
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })

  it('يقرأ المسافرين والمصاريف وحجوزات الأسماء لمعرّف الرحلة الصحيح، وينزّل النسخة', async () => {
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.exportBackup(tripSummary) })

    expect(ok).toBe(true)
    expect(mocks.downloadTripBackup).toHaveBeenCalledTimes(1)
    const backup = mocks.downloadTripBackup.mock.calls[0][0]
    expect(backup.tripId).toBe('trip-1')
    expect(backup.travelers).toHaveLength(1)
    expect(backup.expenses).toHaveLength(1)
  })

  it('يقرأ سجلّ الإيداعات لكل مسافر على حدة، بمعرّفه الصحيح', async () => {
    const { result } = setup()
    await act(async () => { await result.current.exportBackup(tripSummary) })

    expect(mocks.getDocs).toHaveBeenCalledWith({ _tag: 'depositLogs', tripId: 'trip-1', travelerId: 1 })
  })

  it('رسالة النجاح تذكر اسم الرحلة وعدد المسافرين والمصاريف', async () => {
    const { result } = setup()
    await act(async () => { await result.current.exportBackup(tripSummary) })

    const text = showToast.mock.calls[0][0].text
    expect(text).toContain('رحلة تركيا')
    expect(text).toContain('1')
  })

  it('فشل القراءة يمرّ لمعالج أخطاء Firestore ويحرّر علم الحفظ', async () => {
    mocks.getDocs.mockRejectedValue(new Error('network'))
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.exportBackup(tripSummary) })

    expect(ok).toBe(false)
    expect(handleFirestoreError).toHaveBeenCalled()
    expect(result.current.isSaving).toBe(false)
    expect(mocks.downloadTripBackup).not.toHaveBeenCalled()
  })
})

// 🆕 الترقية التلقائية لـ tripType (standard → long_term) عند تجاوز مدّة
// المسار 14 يوماً — انظر deriveTripType في utils/itinerary.ts. منطق العتبة
// نفسه مُختبَر هناك؛ هنا نتحقق من الوسيط: الحمولة المكتوبة وقراءة currentPeriod
// الشرطية.
describe('saveItinerary — الترقية التلقائية لنوع الرحلة', () => {
  const segment = (dep: string, arr: string) => ({
    id: 's1', mode: 'flight' as const, identifier: 'QR 1',
    departure: { location: 'أ', time: dep }, arrival: { location: 'ب', time: arr },
  })

  it('مسار أقصر من 14 يوماً لا يغيّر tripType ولا يقرأ currentPeriod', async () => {
    const shortItinerary = [segment('2026-07-01T10:00:00', '2026-07-10T10:00:00')]
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.saveItinerary('trip-1', shortItinerary, 'standard') })

    expect(ok).toBe(true)
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(mocks.setDoc).toHaveBeenCalledWith({}, { itinerary: shortItinerary }, { merge: true })
  })

  it('مسار أطول من 14 يوماً يُرقّي إلى long_term ويضبط currentPeriod الشهر الجاري إن لم يكن مضبوطاً', async () => {
    const longItinerary = [segment('2026-07-01T10:00:00', '2026-07-20T10:00:00')]
    mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.saveItinerary('trip-1', longItinerary, 'standard') })

    expect(ok).toBe(true)
    const payload = mocks.setDoc.mock.calls[0][1]
    expect(payload.tripType).toBe('long_term')
    expect(payload.currentPeriod).toMatch(/^\d{4}-\d{2}$/)
  })

  it('لا يلمس currentPeriod إن كان مضبوطاً أصلاً على المستند', async () => {
    const longItinerary = [segment('2026-07-01T10:00:00', '2026-07-20T10:00:00')]
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ currentPeriod: '2025-01' }) })
    const { result } = setup()
    await act(async () => { await result.current.saveItinerary('trip-1', longItinerary, 'standard') })

    const payload = mocks.setDoc.mock.calls[0][1]
    expect(payload.tripType).toBe('long_term')
    expect(payload).not.toHaveProperty('currentPeriod')
  })

  it('رحلة long_term أصلاً تبقى كذلك ولا تُخفَّض حتى لو قصُر مسارها', async () => {
    const shortItinerary = [segment('2026-07-01T10:00:00', '2026-07-02T10:00:00')]
    const { result } = setup()
    await act(async () => { await result.current.saveItinerary('trip-1', shortItinerary, 'long_term') })

    expect(mocks.getDoc).not.toHaveBeenCalled()
    const payload = mocks.setDoc.mock.calls[0][1]
    expect(payload).toEqual({ itinerary: shortItinerary })
  })

  it('يرفض مساراً يتجاوز الحدّ الأقصى بلا كتابة ولا قراءة', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => segment(`2026-01-0${(i % 9) + 1}T10:00:00`, `2026-01-0${(i % 9) + 1}T12:00:00`))
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.saveItinerary('trip-1', tooMany, 'standard') })

    expect(ok).toBe(false)
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('saveTripType — التخفيض اليدوي وحده', () => {
  it('يكتب tripType فقط، بلا لمس currentPeriod أو lastClosedPeriod', async () => {
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.saveTripType('trip-1', 'standard') })

    expect(ok).toBe(true)
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(mocks.setDoc).toHaveBeenCalledWith({}, { tripType: 'standard' }, { merge: true })
  })

  it('منظّم رحلة أخرى لا يستطيع تعديلها', async () => {
    const { result } = setup(false, 'trip-2')
    let ok
    await act(async () => { ok = await result.current.saveTripType('trip-1', 'standard') })

    expect(ok).toBe(false)
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

// ⚠️ التحقق الفعلي من صحة بنية backup خادمي بالكامل (restoreTrip في
// functions/index.js، مُختبَر مباشرةً ضد محاكيَي Auth+Firestore الحقيقيين —
// انظر ملاحظات الالتزام). هنا نختبر الوسيط فقط: الصلاحية، تمرير العقد
// الصحيح، ورسالة النجاح/الفشل — لا منطق التحقق نفسه.
describe('restoreTrip', () => {
  const fakeBackup = { schemaVersion: 1, tripId: 'trip-1', trip: {}, travelers: [], expenses: [] }

  it('غير المسؤول لا يستدعي الدالة إطلاقاً', async () => {
    const { result } = setup(false)
    let ok
    await act(async () => { ok = await result.current.restoreTrip('trip-1', fakeBackup) })

    expect(ok).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
  })

  it('يستدعي restoreTrip بالمعرّف والنسخة كما هي — بلا فحص شكلها محلياً', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, tripId: 'trip-1', restored: { travelers: 2, expenses: 5, depositLogs: 1 } } })
    const { result } = setup()
    await act(async () => { await result.current.restoreTrip('trip-1', fakeBackup) })

    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'restoreTrip')
    expect(mocks.callable).toHaveBeenCalledWith({ tripId: 'trip-1', backup: fakeBackup })
  })

  it('رسالة النجاح تذكر أعداد ما استُعيد فعلياً', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, tripId: 'trip-1', restored: { travelers: 2, expenses: 5, depositLogs: 1 } } })
    const { result } = setup()
    await act(async () => { await result.current.restoreTrip('trip-1', fakeBackup) })

    const text = showToast.mock.calls[0][0].text
    expect(text).toContain('2')
    expect(text).toContain('5')
  })

  it('رسالة رفض الخادم (رحلة غير فارغة مثلاً) تُعرض كما هي', async () => {
    mocks.callable.mockRejectedValue(
      Object.assign(new Error('لا يمكن الاستعادة إلى "trip-1" لأنها تحوي مسافرين أو مصاريف بالفعل.'), { code: 'functions/failed-precondition' }),
    )
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.restoreTrip('trip-1', fakeBackup) })

    expect(ok).toBe(false)
    expect(showToast.mock.calls[0][0].text).toBe('لا يمكن الاستعادة إلى "trip-1" لأنها تحوي مسافرين أو مصاريف بالفعل.')
  })

  it('يحرّر علم الحفظ بعد الفشل', async () => {
    mocks.callable.mockRejectedValue(new Error('boom'))
    const { result } = setup()
    await act(async () => { await result.current.restoreTrip('trip-1', fakeBackup) })

    expect(result.current.isSaving).toBe(false)
  })
})

describe('createTrip — الصلاحية والعقد', () => {
  // 🆕 نموذج واتساب: أي حساب حقيقي مسجّل دخوله يُنشئ رحلة ويصبح منظّمها —
  // لا فحص isAdmin هنا بعد الآن على الإطلاق. الحدّ الحقيقي (جلسة غير مجهولة،
  // حدّ زمني) خادمي بالكامل في manageTrip؛ انظر functions/index.js.
  it('غير المسؤول يستدعي الدالة أيضاً — الإنشاء الذاتي لم يعد حصراً بالمسؤول', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, tripId: 'trip-1' } })
    const { result } = setup(false)
    let ok
    await act(async () => { ok = await result.current.createTrip('trip-1', 'اسم') })

    expect(ok).toBe(true)
    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'manageTrip')
    expect(mocks.callable).toHaveBeenCalledWith({ mode: 'create', tripId: 'trip-1', name: 'اسم' })
  })

  it('يستدعي manageTrip بالوضع create والاسم بلا رمز رحلة', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, tripId: 'trip-1' } })
    const { result } = setup()
    await act(async () => { await result.current.createTrip('trip-1', 'رحلة تركيا') })

    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'manageTrip')
    expect(mocks.callable).toHaveBeenCalledWith({ mode: 'create', tripId: 'trip-1', name: 'رحلة تركيا' })
  })

})

describe('deleteTrip — الصلاحية والعقد', () => {
  // 🆕 الحذف يبقى للمسؤول فقط — لم يُطلب تغييره، وهو الأخطر بين الاثنين
  // (يُتلف بيانات مالية إن أُسيء استخدامه)، بخلاف الإنشاء الذاتي الجديد.
  it('غير المسؤول لا يستدعي الدالة إطلاقاً', async () => {
    const { result } = setup(false)
    let ok
    await act(async () => { ok = await result.current.deleteTrip('trip-1') })

    expect(ok).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
  })

  it('يستدعي manageTrip بالوضع delete بلا رمز رحلة', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, tripId: 'trip-1' } })
    const { result } = setup()
    await act(async () => { await result.current.deleteTrip('trip-1') })

    expect(mocks.callable).toHaveBeenCalledWith({ mode: 'delete', tripId: 'trip-1', name: '' })
  })
})

describe('createInvite — الصلاحية والعقد', () => {
  it('يرفض غير المسؤول ولمن ليس منظّم *هذه* الرحلة تحديداً — نفس شرط canAct', async () => {
    const { result } = setup(false, 'trip-2')
    let token
    await act(async () => { token = await result.current.createInvite('trip-1') })

    expect(token).toBeNull()
    expect(mocks.callable).not.toHaveBeenCalled()
    expect(showToast.mock.calls[0][0].text).toContain('أو منظّم الرحلة')
  })

  it('يستدعي manageInvite بالوضع create ويُعيد التوكن', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, token: 'tok-abc' } })
    const { result } = setup()
    let token
    await act(async () => { token = await result.current.createInvite('trip-1') })

    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'manageInvite')
    expect(mocks.callable).toHaveBeenCalledWith({ mode: 'create', tripId: 'trip-1' })
    expect(token).toBe('tok-abc')
  })

  it('منظّم هذه الرحلة تحديداً (لا رحلة أخرى) يستطيع الإنشاء', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, token: 'tok-abc' } })
    const { result } = setup(false, 'trip-1')
    let token
    await act(async () => { token = await result.current.createInvite('trip-1') })

    expect(token).toBe('tok-abc')
  })

  it('يحدّث التوكن قبل الاستدعاء (claim الصلاحية قد يكون تغيّر)', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, token: 'tok-abc' } })
    const { result } = setup()
    await act(async () => { await result.current.createInvite('trip-1') })
    expect(mocks.getIdToken).toHaveBeenCalledWith(true)
  })

  it('رسالة رفض الخادم تُعرض كما هي، وتُعيد null', async () => {
    mocks.callable.mockRejectedValue(
      Object.assign(new Error('هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.'), { code: 'functions/permission-denied' }),
    )
    const { result } = setup()
    let token
    await act(async () => { token = await result.current.createInvite('trip-1') })

    expect(token).toBeNull()
    expect(showToast.mock.calls[0][0].text).toBe('هذا الإجراء متاح للمسؤول أو منظّم الرحلة فقط.')
  })

  it('خطأ شبكة (لا كود functions/) يستخدم handleFirestoreError لا رسالة الخادم', async () => {
    mocks.callable.mockRejectedValue(new Error('network'))
    const { result } = setup()
    await act(async () => { await result.current.createInvite('trip-1') })

    expect(handleFirestoreError).toHaveBeenCalledTimes(1)
    expect(showToast).not.toHaveBeenCalled()
  })
})

describe('revokeInvite — الصلاحية والعقد', () => {
  it('يرفض من ليس مسؤولاً أو منظّم هذه الرحلة', async () => {
    const { result } = setup(false, 'trip-2')
    let ok
    await act(async () => { ok = await result.current.revokeInvite('trip-1') })

    expect(ok).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
  })

  it('يستدعي manageInvite بالوضع revoke ويُظهر توست نجاح', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true } })
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.revokeInvite('trip-1') })

    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'manageInvite')
    expect(mocks.callable).toHaveBeenCalledWith({ mode: 'revoke', tripId: 'trip-1' })
    expect(ok).toBe(true)
    expect(showToast.mock.calls[0][0]).toMatchObject({ text: 'تم إبطال رابط الدعوة.', type: 'success' })
  })

  it('فشل الخادم يُعيد false ويعرض الرسالة كما وصلت', async () => {
    mocks.callable.mockRejectedValue(
      Object.assign(new Error('لم يعد الإجراء متاحاً.'), { code: 'functions/failed-precondition' }),
    )
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.revokeInvite('trip-1') })

    expect(ok).toBe(false)
    expect(showToast.mock.calls[0][0].text).toBe('لم يعد الإجراء متاحاً.')
  })

  it('يحرّر علم الحفظ بعد النجاح والفشل معاً', async () => {
    mocks.callable.mockResolvedValueOnce({ data: { success: true } })
    const { result } = setup()
    await act(async () => { await result.current.revokeInvite('trip-1') })
    expect(result.current.isSaving).toBe(false)

    mocks.callable.mockRejectedValueOnce(new Error('boom'))
    await act(async () => { await result.current.revokeInvite('trip-1') })
    expect(result.current.isSaving).toBe(false)
  })
})

// 🆕 نموذج الهوية الهجين — ربط مسافر "شبح" بحساب. الفحص الحقيقي (المسافر غير
// مربوط بالفعل، والحساب المستهدَف غير مربوط بمسافر آخر) خادمي بالكامل في
// linkTravelerAccount (functions/index.js) — هنا فقط عقد الاستدعاء والصلاحية
// على مستوى الواجهة، نفس نمط removeMember/createInvite أعلاه بالضبط.
describe('linkTravelerAccount — الصلاحية والعقد', () => {
  it('يرفض غير المسؤول ولمن ليس منظّم *هذه* الرحلة تحديداً — نفس شرط canAct', async () => {
    const { result } = setup(false, 'trip-2')
    let ok
    await act(async () => { ok = await result.current.linkTravelerAccount('trip-1', 5, 'u1') })

    expect(ok).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
    expect(showToast.mock.calls[0][0].text).toContain('أو منظّم الرحلة')
  })

  it('يستدعي linkTravelerAccount بالمعرّفات الصحيحة ويُظهر توست نجاح', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, tripId: 'trip-1', travelerId: 5, targetUid: 'u1' } })
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.linkTravelerAccount('trip-1', 5, 'u1') })

    expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'linkTravelerAccount')
    expect(mocks.callable).toHaveBeenCalledWith({ tripId: 'trip-1', travelerId: 5, targetUid: 'u1' })
    expect(ok).toBe(true)
    expect(showToast.mock.calls[0][0]).toMatchObject({ text: 'تم ربط المسافر بحسابه.', type: 'success' })
  })

  it('منظّم هذه الرحلة تحديداً (لا رحلة أخرى) يستطيع الربط', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, tripId: 'trip-1', travelerId: 5, targetUid: 'u1' } })
    const { result } = setup(false, 'trip-1')
    let ok
    await act(async () => { ok = await result.current.linkTravelerAccount('trip-1', 5, 'u1') })

    expect(ok).toBe(true)
  })

  it('يحدّث التوكن قبل الاستدعاء', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true } })
    const { result } = setup()
    await act(async () => { await result.current.linkTravelerAccount('trip-1', 5, 'u1') })
    expect(mocks.getIdToken).toHaveBeenCalledWith(true)
  })
})

// ⚠️ الحالتان السالبتان الحقيقيتان — مسافر مربوط بالفعل، وحساب مربوط بمسافر
// آخر — لا يمكن اختبارهما هنا: الواجهة لا تعرف شيئاً عن حالة المسافر قبل
// الاستدعاء، فقط تُمرّر العقد وتعرض رسالة الخادم كما وصلت. هذا بالضبط ما
// تختبره الحالتان أدناه — أن الرسالة الخادمية (أياً كانت) تصل كما هي.
describe('linkTravelerAccount — رسائل الرفض الخادمية تصل كما هي', () => {
  it('مسافر مربوط بالفعل', async () => {
    mocks.callable.mockRejectedValue(
      Object.assign(new Error('هذا المسافر مربوط بحساب بالفعل.'), { code: 'functions/failed-precondition' }),
    )
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.linkTravelerAccount('trip-1', 5, 'u1') })

    expect(ok).toBe(false)
    expect(showToast.mock.calls[0][0].text).toBe('هذا المسافر مربوط بحساب بالفعل.')
  })

  it('الحساب المستهدَف مربوط بمسافر آخر في نفس الرحلة', async () => {
    mocks.callable.mockRejectedValue(
      Object.assign(new Error('هذا الحساب مربوط بالفعل بمسافر آخر في هذه الرحلة.'), { code: 'functions/failed-precondition' }),
    )
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.linkTravelerAccount('trip-1', 5, 'u1') })

    expect(ok).toBe(false)
    expect(showToast.mock.calls[0][0].text).toBe('هذا الحساب مربوط بالفعل بمسافر آخر في هذه الرحلة.')
  })

  it('خطأ شبكة (لا كود functions/) يستخدم handleFirestoreError لا رسالة الخادم', async () => {
    mocks.callable.mockRejectedValue(new Error('network'))
    const { result } = setup()
    await act(async () => { await result.current.linkTravelerAccount('trip-1', 5, 'u1') })

    expect(handleFirestoreError).toHaveBeenCalledTimes(1)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('يحرّر علم الحفظ بعد النجاح والفشل معاً', async () => {
    mocks.callable.mockResolvedValueOnce({ data: { success: true } })
    const { result } = setup()
    await act(async () => { await result.current.linkTravelerAccount('trip-1', 5, 'u1') })
    expect(result.current.isSaving).toBe(false)

    mocks.callable.mockRejectedValueOnce(new Error('boom'))
    await act(async () => { await result.current.linkTravelerAccount('trip-1', 5, 'u1') })
    expect(result.current.isSaving).toBe(false)
  })
})
