// اختبارات مسار إزالة العضو وحده من useTripAdminActions — بقية الدوال تكتب
// مباشرةً عبر القواعد وتغطّيها اختبارات firestore.rules.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTripAdminActions } from './useTripAdminActions'
import { haptic } from '../utils/haptics'

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
  repaymentsColByTrip: vi.fn((tripId: string) => ({ _tag: 'repayments', tripId })),
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
  itinerary: [], itineraryRev: 0, status: 'active' as const, tripType: 'standard' as const,
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

  it('إزالة من صلاحيته عامة تُعلن أن وصوله باقٍ — لا تمرّ بهذه الرحلة', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, claimRemoved: true, stillHasAccess: true } })
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'admin-2') })

    const text = showToast.mock.calls[0][0].text
    // 🆕 بلا كلمة «مسؤول»: القاموس المعروض دورٌ واحد — «منظّم الرحلة». ما يُقال
    // هنا هو *الأثر* (صلاحيته عامة لا تمرّ بهذه الرحلة) لا اسم دورٍ ثانٍ.
    expect(text).toContain('صلاحيته عامة')
    expect(text).not.toContain('مسؤول')
    expect(text).not.toContain('حتى ساعة')
  })

  it('من لم يكن عضواً: تنظيف سطر لا إزالة — ولا يُوعَد بقطع وصول لم يقع', async () => {
    mocks.callable.mockResolvedValue({ data: { success: true, claimRemoved: false, stillHasAccess: false } })
    const { result } = setup()
    await act(async () => { await result.current.removeMember('trip-1', 'ghost') })

    expect(showToast.mock.calls[0][0].text).toContain('لم يكن منضمّاً')
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
      Object.assign(new Error('هذا الإجراء ليس من صلاحيات منظّم الرحلة.'), { code: 'functions/permission-denied' }),
    )
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.removeMember('trip-1', 'u1') })

    expect(ok).toBe(false)
    expect(showToast.mock.calls[0][0].text).toBe('هذا الإجراء ليس من صلاحيات منظّم الرحلة.')
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

  // 🆕 مستند عُدِّل من الكونسول يحمل Timestamp بدل رقم — الملف يُرفض قبل
  // التنزيل، والرسالة تسمّي الموضع لا نصاً عاماً.
  it('قيمة لا تنجو من JSON تمنع التنزيل، والرسالة تسمّي موضعها', async () => {
    class Timestamp { constructor(readonly seconds: number) {} }
    mocks.getDocs.mockImplementation((ref: { _tag?: string }) => Promise.resolve(
      ref._tag === 'travelers'
        ? { docs: [{ id: '1', data: () => ({ id: 1, name: 'أحمد', shortName: 'أحمد', deposited: 0, deletedAt: new Timestamp(1) }) }] }
        : { docs: [] },
    ))
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.exportBackup(tripSummary) })

    expect(ok).toBe(false)
    expect(mocks.downloadTripBackup).not.toHaveBeenCalled()
    expect(handleFirestoreError).not.toHaveBeenCalled()
    const toast = showToast.mock.calls[0][0]
    expect(toast.type).toBe('error')
    expect(toast.text).toContain('$.travelers[0].deletedAt')
    expect(toast.text).toContain('رحلة تركيا')
    expect(result.current.isSaving).toBe(false)
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
    await act(async () => { ok = await result.current.saveItinerary('trip-1', shortItinerary, 'standard', 0) })

    expect(ok).toBe(true)
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(mocks.setDoc).toHaveBeenCalledWith({}, { itinerary: shortItinerary, itineraryRev: 1 }, { merge: true })
  })

  it('مسار أطول من 14 يوماً يُرقّي إلى long_term ويضبط currentPeriod الشهر الجاري إن لم يكن مضبوطاً', async () => {
    const longItinerary = [segment('2026-07-01T10:00:00', '2026-07-20T10:00:00')]
    mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.saveItinerary('trip-1', longItinerary, 'standard', 0) })

    expect(ok).toBe(true)
    const payload = mocks.setDoc.mock.calls[0][1]
    expect(payload.tripType).toBe('long_term')
    expect(payload.currentPeriod).toMatch(/^\d{4}-\d{2}$/)
  })

  it('لا يلمس currentPeriod إن كان مضبوطاً أصلاً على المستند', async () => {
    const longItinerary = [segment('2026-07-01T10:00:00', '2026-07-20T10:00:00')]
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ currentPeriod: '2025-01' }) })
    const { result } = setup()
    await act(async () => { await result.current.saveItinerary('trip-1', longItinerary, 'standard', 0) })

    const payload = mocks.setDoc.mock.calls[0][1]
    expect(payload.tripType).toBe('long_term')
    expect(payload).not.toHaveProperty('currentPeriod')
  })

  it('رحلة long_term أصلاً تبقى كذلك ولا تُخفَّض حتى لو قصُر مسارها', async () => {
    const shortItinerary = [segment('2026-07-01T10:00:00', '2026-07-02T10:00:00')]
    const { result } = setup()
    await act(async () => { await result.current.saveItinerary('trip-1', shortItinerary, 'long_term', 0) })

    expect(mocks.getDoc).not.toHaveBeenCalled()
    const payload = mocks.setDoc.mock.calls[0][1]
    expect(payload).toEqual({ itinerary: shortItinerary, itineraryRev: 1 })
  })

  it('يرفض مساراً يتجاوز الحدّ الأقصى بلا كتابة ولا قراءة', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => segment(`2026-01-0${(i % 9) + 1}T10:00:00`, `2026-01-0${(i % 9) + 1}T12:00:00`))
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.saveItinerary('trip-1', tooMany, 'standard', 0) })

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
  it('يرفض من ليس منظّم *هذه* الرحلة تحديداً — نفس شرط canAct', async () => {
    const { result } = setup(false, 'trip-2')
    let token
    await act(async () => { token = await result.current.createInvite('trip-1') })

    expect(token).toBeNull()
    expect(mocks.callable).not.toHaveBeenCalled()
    expect(showToast.mock.calls[0][0].text).toContain('منظّم الرحلة')
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
      Object.assign(new Error('هذا الإجراء متاح لمنظّم الرحلة فقط.'), { code: 'functions/permission-denied' }),
    )
    const { result } = setup()
    let token
    await act(async () => { token = await result.current.createInvite('trip-1') })

    expect(token).toBeNull()
    expect(showToast.mock.calls[0][0].text).toBe('هذا الإجراء متاح لمنظّم الرحلة فقط.')
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
  it('يرفض من ليس منظّم *هذه* الرحلة تحديداً — نفس شرط canAct', async () => {
    const { result } = setup(false, 'trip-2')
    let ok
    await act(async () => { ok = await result.current.linkTravelerAccount('trip-1', 5, 'u1') })

    expect(ok).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
    expect(showToast.mock.calls[0][0].text).toContain('منظّم الرحلة')
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

// ─── تثبيت سلوك قبل توحيد مسار الدوال السحابية (القاعدة ٢١) ──────────────────
//
// كُتبت هذه الكتلة **قبل** استخراج `call()` المشتركة، وأُثبتت خضراء على الكود
// القديم الذي يكرّر نفس الكتلة سبع مرات. تثبّت ما يختلف بين الدوال بالضبط
// (نصّ الرفض ومدّته، توست النجاح ومدّته، مدّة توست الخطأ، ما تُعيده عند
// الفشل) — وهو بالتحديد ما يضيع بصمت حين تُوحَّد سبع نسخ في واحدة.


type Actions = ReturnType<typeof useTripAdminActions>
const ORGANIZER_ONLY = 'هذا الإجراء متاح لمنظّم الرحلة فقط.'
const NOT_ORGANIZER_POWER = 'هذا الإجراء ليس من صلاحيات منظّم الرحلة.'
const NETWORK_FALLBACK = 'تعذّر الاتصال بالخادم — تحقّق من اتصالك.'

interface CallableCase {
  name: string
  run: (a: Actions) => Promise<unknown>
  /** ما يُعيده الخادم عند النجاح. */
  data?: unknown
  success: { toast: [unknown, number?] | null; returns: unknown }
  /** من يُرفض محلياً، وبأي رسالة. null = لا رفض محلي (الإنشاء الذاتي). */
  denied: { as: [boolean, string | null]; toast: [unknown, number] } | null
  failure: { errorMs: number; returns: unknown }
}

const CALLABLES: CallableCase[] = [
  {
    name: 'createTrip',
    run: a => a.createTrip('trip-9', 'رحلة'),
    success: { toast: [{ text: 'تم إنشاء الرحلة "trip-9"', type: 'success' }], returns: true },
    denied: null,
    failure: { errorMs: 4000, returns: false },
  },
  {
    name: 'deleteTrip',
    run: a => a.deleteTrip('trip-1'),
    success: { toast: [{ text: 'تم حذف الرحلة "trip-1"', type: 'success' }], returns: true },
    denied: { as: [false, 'trip-1'], toast: [{ text: NOT_ORGANIZER_POWER, type: 'error' }, 3000] },
    failure: { errorMs: 4000, returns: false },
  },
  {
    name: 'removeMember',
    run: a => a.removeMember('trip-1', 'u1'),
    success: {
      toast: [{ text: 'تمت الإزالة. قد يبقى وصوله فعّالاً حتى ساعة حتى تنتهي صلاحية جلسته.', type: 'success' }, 6000],
      returns: true,
    },
    denied: { as: [false, null], toast: [{ text: ORGANIZER_ONLY, type: 'error' }, 3000] },
    failure: { errorMs: 4000, returns: false },
  },
  {
    name: 'setMemberRole (organizer)',
    run: a => a.setMemberRole('trip-1', 'u1', 'organizer'),
    success: { toast: [{ text: 'صار هذا المسافر منظّماً لهذه الرحلة.', type: 'success' }], returns: true },
    denied: {
      as: [false, 'trip-1'],
      toast: [{ text: 'تغيير دور المنظّم ليس من صلاحيات منظّم الرحلة.', type: 'error' }, 3000],
    },
    failure: { errorMs: 4000, returns: false },
  },
  {
    name: 'setMemberRole (member)',
    run: a => a.setMemberRole('trip-1', 'u1', 'member'),
    success: { toast: [{ text: 'أُلغي دور المنظّم عن هذا المسافر.', type: 'success' }], returns: true },
    denied: {
      as: [false, 'trip-1'],
      toast: [{ text: 'تغيير دور المنظّم ليس من صلاحيات منظّم الرحلة.', type: 'error' }, 3000],
    },
    failure: { errorMs: 4000, returns: false },
  },
  {
    name: 'createInvite',
    run: a => a.createInvite('trip-1'),
    data: { success: true, token: 'TOKEN' },
    // ⚠️ لا توست ولا اهتزاز عند النجاح: المستدعي يبني رابط المشاركة فوراً.
    success: { toast: null, returns: 'TOKEN' },
    denied: { as: [false, null], toast: [{ text: ORGANIZER_ONLY, type: 'error' }, 3000] },
    failure: { errorMs: 4000, returns: null },
  },
  {
    name: 'revokeInvite',
    run: a => a.revokeInvite('trip-1'),
    success: { toast: [{ text: 'تم إبطال رابط الدعوة.', type: 'success' }], returns: true },
    denied: { as: [false, null], toast: [{ text: ORGANIZER_ONLY, type: 'error' }, 3000] },
    failure: { errorMs: 4000, returns: false },
  },
  {
    name: 'linkTravelerAccount',
    run: a => a.linkTravelerAccount('trip-1', 1, 'u1'),
    success: { toast: [{ text: 'تم ربط المسافر بحسابه.', type: 'success' }], returns: true },
    denied: { as: [false, null], toast: [{ text: ORGANIZER_ONLY, type: 'error' }, 3000] },
    failure: { errorMs: 4000, returns: false },
  },
  {
    name: 'restoreTrip',
    run: a => a.restoreTrip('trip-1', {}),
    data: { success: true, tripId: 'trip-1', restored: { travelers: 2, expenses: 3, depositLogs: 4 } },
    success: {
      toast: [{ text: 'تمت الاستعادة — 2 مسافراً، 3 مصروفاً، 4 سجلّ إيداع.', type: 'success' }, 5000],
      returns: true,
    },
    denied: { as: [false, 'trip-1'], toast: [{ text: NOT_ORGANIZER_POWER, type: 'error' }, 3000] },
    // ⚠️ 5000 لا 4000 — رسائل رفض الاستعادة أطول (بنية النسخة، رحلة غير فارغة).
    failure: { errorMs: 5000, returns: false },
  },
]

async function run(c: CallableCase, as: [boolean, string | null] = [true, null]) {
  const { result } = setup(...as)
  let returned: unknown
  await act(async () => { returned = await c.run(result.current) })
  return { returned, isSaving: result.current.isSaving }
}

describe.each(CALLABLES)('عقد الدوال السحابية — $name', c => {
  it('النجاح: التوست ومدّته، والاهتزاز، وما يُعاد', async () => {
    if (c.data) mocks.callable.mockResolvedValue({ data: c.data })
    const { returned, isSaving } = await run(c)

    expect(returned).toEqual(c.success.returns)
    expect(isSaving).toBe(false)
    if (c.success.toast) {
      expect(showToast).toHaveBeenCalledTimes(1)
      expect(showToast).toHaveBeenCalledWith(...c.success.toast)
      expect(haptic.success).toHaveBeenCalledTimes(1)
    } else {
      expect(showToast).not.toHaveBeenCalled()
      expect(haptic.success).not.toHaveBeenCalled()
    }
  })

  it('يجدّد التوكن مرة واحدة قبل الاستدعاء (للمسؤول)', async () => {
    if (c.data) mocks.callable.mockResolvedValue({ data: c.data })
    await run(c)
    expect(mocks.getIdToken).toHaveBeenCalledTimes(1)
    expect(mocks.getIdToken).toHaveBeenCalledWith(true)
  })

  it('رفض الخادم: رسالته كما هي بمدّتها، وما يُعاد', async () => {
    mocks.callable.mockRejectedValue(Object.assign(new Error('رسالة الخادم [400]'), { code: 'functions/failed-precondition' }))
    const { returned, isSaving } = await run(c)

    expect(returned).toEqual(c.failure.returns)
    expect(isSaving).toBe(false)
    expect(showToast).toHaveBeenCalledWith({ text: 'رسالة الخادم', type: 'error' }, c.failure.errorMs)
    expect(haptic.error).toHaveBeenCalledTimes(1)
    expect(handleFirestoreError).not.toHaveBeenCalled()
  })

  it('خطأ ليس من الدالة: يمرّ لمعالج أخطاء Firestore بالنص الاحتياطي', async () => {
    const err = new Error('network')
    mocks.callable.mockRejectedValue(err)
    const { returned } = await run(c)

    expect(returned).toEqual(c.failure.returns)
    expect(handleFirestoreError).toHaveBeenCalledWith(err, NETWORK_FALLBACK)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('بلا مستخدم: لا استدعاء، ويمرّ لمعالج أخطاء Firestore', async () => {
    mocks.currentUser = null
    const { returned, isSaving } = await run(c)

    expect(returned).toEqual(c.failure.returns)
    expect(isSaving).toBe(false)
    expect(mocks.callable).not.toHaveBeenCalled()
    expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), NETWORK_FALLBACK)
  })

  if (c.denied) {
    const denied = c.denied
    it('الرفض المحلي: نصّه ومدّته، بلا استدعاء ولا اهتزاز ولا علم حفظ', async () => {
      const { returned } = await run(c, denied.as)

      expect(returned).toEqual(c.failure.returns)
      expect(showToast).toHaveBeenCalledTimes(1)
      expect(showToast).toHaveBeenCalledWith(...denied.toast)
      expect(mocks.callable).not.toHaveBeenCalled()
      expect(mocks.getIdToken).not.toHaveBeenCalled()
      expect(haptic.error).not.toHaveBeenCalled()
    })
  }
})

describe('createTrip — التوكن بعد الإنشاء الذاتي', () => {
  it('غير المسؤول يجدّد التوكن مرّة ثانية بعد الإنشاء — ليحمل claim العضوية الجديد', async () => {
    const { result } = setup(false, null)
    await act(async () => { await result.current.createTrip('trip-9', 'رحلة') })

    expect(mocks.getIdToken).toHaveBeenCalledTimes(2)
    // الثاني بعد الاستدعاء لا قبله — وإلا لم يكن الـ claim قد مُنح بعد.
    expect(mocks.getIdToken.mock.invocationCallOrder[1]).toBeGreaterThan(mocks.callable.mock.invocationCallOrder[0])
  })

  it('لا تجديد ثانياً إن فشل الإنشاء', async () => {
    mocks.callable.mockRejectedValue(new Error('boom'))
    const { result } = setup(false, null)
    await act(async () => { await result.current.createTrip('trip-9', 'رحلة') })

    expect(mocks.getIdToken).toHaveBeenCalledTimes(1)
  })
})

describe('الكتابة المباشرة — ما لم يكن مغطّى', () => {
  it('saveTripName: يكتب الاسم مقصوصاً بـ merge ويؤكّد', async () => {
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.saveTripName('trip-1', '  رحلة تركيا  ') })

    expect(ok).toBe(true)
    expect(mocks.setDoc).toHaveBeenCalledWith(expect.anything(), { name: 'رحلة تركيا' }, { merge: true })
    expect(showToast).toHaveBeenCalledWith({ text: 'تم حفظ اسم الرحلة', type: 'success' })
  })

  it('saveTripStatus: الحالة وتاريخ تغييرها في كتابة واحدة، والرسالة تسمّي الحالة', async () => {
    const { result } = setup()
    await act(async () => { await result.current.saveTripStatus('trip-1', 'archived') })

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.anything(), { status: 'archived', statusChangedAt: expect.any(Number) }, { merge: true },
    )
    expect(showToast.mock.calls[0][0].text).toContain('«')
  })

  it('رفض محلي لمن ليس منظّم هذه الرحلة: نصّه ومدّته، بلا كتابة', async () => {
    const { result } = setup(false, 'other-trip')
    let ok
    await act(async () => { ok = await result.current.saveTripName('trip-1', 'اسم') })

    expect(ok).toBe(false)
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith({ text: ORGANIZER_ONLY, type: 'error' }, 3000)
  })

  it('saveItinerary: رفضٌ لأن غيرك حفظ قبلك يُقال كذلك — لا «لا تملك الصلاحية»', async () => {
    mocks.setDoc.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }))
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ itineraryRev: 5 }) })
    const { result } = setup()
    let ok
    await act(async () => { ok = await result.current.saveItinerary('trip-1', [], 'standard', 3) })

    expect(ok).toBe(false)
    expect(showToast).toHaveBeenCalledWith(
      { text: expect.stringContaining('عدّل أحدهم مسار الرحلة قبلك'), type: 'error' }, 6000,
    )
    expect(handleFirestoreError).not.toHaveBeenCalled()
  })

  it('saveItinerary: رفضٌ والنسخة لم تتغيّر ⇒ خطأ صلاحيات عادي عبر المعالج', async () => {
    const err = Object.assign(new Error('denied'), { code: 'permission-denied' })
    mocks.setDoc.mockRejectedValue(err)
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ itineraryRev: 3 }) })
    const { result } = setup()
    await act(async () => { await result.current.saveItinerary('trip-1', [], 'standard', 3) })

    expect(handleFirestoreError).toHaveBeenCalledWith(err, 'تعذّر حفظ مسار الرحلة.')
  })
})
