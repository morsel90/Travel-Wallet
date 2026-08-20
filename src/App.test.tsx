import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

// ─── اختبار تثبيت سلوك (Characterization Test) ────────────────────────────────
//
// كُتب **قبل** تفكيك App.tsx وليس بعده، وهذا هو بيت القصيد: قيمته كلها في أنه
// يصف السلوك القائم فعلاً لا السلوك المرغوب. أي انحراف أثناء النقل يظهر هنا
// فوراً بدل أن يُكتشف في الإنتاج.
//
// ⚠️ عند تعديل هذا الملف أثناء إعادة هيكلة: تغيير التوقّع لتمرير الاختبار يُلغي
// الغرض منه. إن فشل، فالنقل غيّر سلوكاً — أعد النقل أو أثبت أن التغيير مقصود.
//
// ما يُغطّى عمداً: ترتيب البوابات (شاشة رحلاتي ← رمز الرحلة ← التطبيق)، لأنه
// شرطٌ متسلسل يسهل قلبه سهواً؛ واللافتات؛ وإخفاء مدخلات الإدخال في رحلة مغلقة
// (وهذا إعلام لا حماية — الحماية في firestore.rules).
//
// ما لا يُغطّى: الحساب المالي (له utils/calculations.invariants.test.ts)، ومنطق
// الخطافات (لكل خطاف اختباره)، والتدفقات الحقيقية عبر متصفح (مجلد e2e/).

// ─── محاكاة الوحدات الخارجية ──────────────────────────────────────────────────
// نُحاكي `./firebase` لأن src/firebase.ts يرمي عمداً عند غياب VITE_FIREBASE_*،
// وهي غير معرّفة في بيئة الاختبار — وهذا سلوك مقصود موثّق، لا عطل.
vi.mock('./firebase', () => ({ db: {}, auth: {}, functions: {} }))
vi.mock('./utils/haptics', () => ({
  haptic: { light: vi.fn(), medium: vi.fn(), success: vi.fn(), error: vi.fn(), flash: vi.fn() },
}))
vi.mock('./utils/preload', () => ({ onIdle: vi.fn(() => vi.fn()), preloadAll: vi.fn() }))
vi.mock('./utils/tripId', () => ({ TRIP_ID: 'trip-1', HAS_EXPLICIT_TRIP_ID: true }))

// قيم الخطافات قابلة للتعديل لكل اختبار — تُقرأ داخل المحاكاة عند كل استدعاء.
const h = vi.hoisted(() => ({
  auth: {
    // isAnonymous اختياري لأن المنسّق يقرؤه بـ `user?.isAnonymous === true`
    user: { uid: 'u1' } as { uid: string; isAnonymous?: boolean },
    isAdmin: false, needsTripPin: false, pinCheckLoading: false,
    pinError: null, rateLimitSeconds: null, verifyTripPin: vi.fn(), joinedTripIds: [] as string[],
  },
  isOnline: true,
  expenses: [] as unknown[],
  travelers: [] as unknown[],
  expensesLoaded: true,
  travelersLoaded: true,
  tripStatus: 'active' as string,
  myTrips: [] as unknown[],
  allTrips: [] as unknown[],
  isAddingExpense: false,
  isOrganizer: false,
}))

const noop = () => {}
const formState = {
  date: '2026-01-01', description: '', amount: '', currency: 'SAR', exchangeRate: '1',
  participants: [] as number[], category: 'أخرى', splitMode: 'equal', shares: {},
}

vi.mock('./hooks', () => ({
  useAuth: () => h.auth,
  useOnlineStatus: () => h.isOnline,
  useMyTrips: () => ({ trips: h.myTrips, loading: false, error: null }),
  useAllTrips: () => ({ trips: h.allTrips, loading: false, error: null }),
  useExchangeRates: () => ({ ratesUpdatedAt: null, CURRENCIES: {} }),
  useExpenses: () => ({
    expenses: h.expenses, setExpenses: noop,
    expensesLoaded: h.expensesLoaded, refreshExpenses: vi.fn(),
  }),
  useTravelers: () => ({
    travelers: h.travelers, setTravelers: noop,
    travelersLoaded: h.travelersLoaded, refreshTravelers: vi.fn(),
  }),
  // ⚠️ bankDetails كائن دائماً — الخطاف الحقيقي يسقط إلى BANK_DETAILS في
  // constants.ts ولا يُرجع null أبداً، وBankDetailsCard يقرأ حقوله مباشرة.
  useTripConfig: () => ({
    tripName: 'رحلة الاختبار',
    bankDetails: { bankName: 'بنك الاختبار', beneficiary: 'مسافر', iban: 'SA0000000000000000000000' },
    itinerary: [],
    status: h.tripStatus,
  }),
  // 🆕 المرحلة ٣ — «هل أنا منظّم الرحلة الحالية؟». افتراضياً false، وتُفعَّل
  // صراحةً في الاختبارات التي تحتاجها تحديداً.
  useMyTripRole: () => h.isOrganizer,
  useBalances: () => ({ balances: [], totalSpent: 0, totalDeposited: 0, totalRemaining: 0 }),
  useModals: () => ({
    modal: { type: 'none' }, openReports: noop, openTrashBin: noop, openTripAdmin: noop,
    openDeleteTraveler: noop, openDeposit: noop, openDepositHistory: noop, closeModal: noop,
  }),
  useAdminAuth: () => ({
    showAdminSignIn: false, openAdminSignIn: noop, handleAdminSignOut: noop, adminModalProps: {},
  }),
  useExpenseActions: () => ({
    newExpense: formState, setNewExpense: noop, isAddingExpense: h.isAddingExpense, editingExpense: null,
    expenseToDelete: null, setExpenseToDelete: noop, openExpenseForm: noop, cancelExpenseForm: noop,
    handleAddExpense: noop, handleQuickAddExpense: () => null, startEditExpense: noop,
    requestDeleteExpense: noop, confirmDelete: noop, handleRestoreExpense: noop,
    toggleParticipant: noop, toggleAllParticipants: noop,
  }),
  useTravelerActions: () => ({
    isAddingTraveler: false, newTravelerName: '', setNewTravelerName: noop,
    newTravelerDeposit: '', setNewTravelerDeposit: noop, startAddTraveler: noop,
    cancelAddTraveler: noop, handleAddTraveler: noop, handleRestoreTraveler: noop,
    confirmDeleteTraveler: noop,
  }),
  useDepositActions: () => ({
    depositAmount: '', setDepositAmount: noop, depositMode: 'add', setDepositMode: noop,
    depositReason: '', setDepositReason: noop, handleAddDeposit: noop, closeDeposit: noop,
  }),
  useTripAdminActions: () => ({
    isSaving: false, saveBankDetails: noop, saveItinerary: noop, saveTripName: noop,
    saveTripStatus: noop, createTrip: noop, resetTripPin: noop, deleteTrip: noop,
  }),
  // 🆕 رابط دعوة بنقرة واحدة — status: 'done' دائماً هنا (لا رابط دعوة في بيئة
  // الاختبار: ./utils/tripId مُحاكى أعلاه بلا INVITE_TOKEN)، فلا تُعرض شاشة
  // InviteJoinScreen وتُتابع اختبارات ترتيب البوابات القائمة كما هي.
  useInviteJoin: () => ({ status: 'done' as const, submitName: noop, skipName: noop, isSubmittingName: false }),
}))

vi.mock('./hooks/useFilteredExpenses', () => ({
  useFilteredExpenses: () => ({
    searchQuery: '', setSearchQuery: noop,
    sortOrder: 'date_desc', setSortOrder: noop,
    filteredExpenses: h.expenses,
  }),
}))

beforeEach(() => {
  h.auth = {
    user: { uid: 'u1' } as { uid: string; isAnonymous?: boolean },
    isAdmin: false, needsTripPin: false, pinCheckLoading: false,
    pinError: null, rateLimitSeconds: null, verifyTripPin: vi.fn(), joinedTripIds: [],
  }
  h.isOnline = true
  h.expenses = []
  h.travelers = []
  h.expensesLoaded = true
  h.travelersLoaded = true
  h.tripStatus = 'active'
  h.myTrips = []
  h.allTrips = []
  h.isAddingExpense = false
  h.isOrganizer = false
})

// ─── ترتيب البوابات ───────────────────────────────────────────────────────────
// الترتيب في App.tsx: شاشة «رحلاتي» أولاً، ثم بوابة رمز الرحلة، ثم التطبيق.
// قلبُ هذا الترتيب لا يُنتج خطأ تصريفياً ولا يكسر أي اختبار آخر — ولهذا يُثبَّت.

describe('App — ترتيب البوابات', () => {
  it('يعرض التطبيق مباشرة حين يكون المعرّف صريحاً والوصول متاح', async () => {
    render(<App />)
    expect(await screen.findByText('أرصدة المسافرين')).toBeInTheDocument()
    expect(screen.queryByText('أدخل رمز الرحلة')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'رحلاتي' })).not.toBeInTheDocument()
  })

  it('يعرض بوابة الرمز حين يُطلب رمز الرحلة ولم يكن المستخدم مسؤولاً', async () => {
    h.auth = { ...h.auth, needsTripPin: true }
    render(<App />)
    expect(await screen.findByText('أدخل رمز الرحلة')).toBeInTheDocument()
    expect(screen.queryByText('أرصدة المسافرين')).not.toBeInTheDocument()
  })

  it('المسؤول يتجاوز بوابة الرمز حتى مع needsTripPin', async () => {
    h.auth = { ...h.auth, isAdmin: true, needsTripPin: true }
    render(<App />)
    expect(await screen.findByText('أرصدة المسافرين')).toBeInTheDocument()
    expect(screen.queryByText('أدخل رمز الرحلة')).not.toBeInTheDocument()
  })

  it('أثناء pinCheckLoading تظهر البوابة بحالة تحقّق لا بحقل الإدخال', async () => {
    // TripGate يعرض «جارٍ التحقق...» بدل العنوان حين loading — وهذا مقصود:
    // عرض حقل رمز قبل معرفة الحاجة إليه يطالب المستخدم بما قد لا يُطلب منه.
    h.auth = { ...h.auth, pinCheckLoading: true }
    render(<App />)
    await waitFor(() => expect(screen.getByText('جارٍ التحقق...')).toBeInTheDocument())
    expect(screen.queryByText('أدخل رمز الرحلة')).not.toBeInTheDocument()
    expect(screen.queryByText('أرصدة المسافرين')).not.toBeInTheDocument()
  })
})

// ─── اللافتات وحالة الاتصال ───────────────────────────────────────────────────

describe('App — اللافتات', () => {
  it('يعرض لافتة انقطاع الاتصال حين يكون غير متصل', async () => {
    h.isOnline = false
    render(<App />)
    expect(await screen.findByText(/أنت غير متصل بالإنترنت حالياً/)).toBeInTheDocument()
  })

  it('لا يعرض لافتة الانقطاع حين يكون متصلاً', async () => {
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    expect(screen.queryByText(/أنت غير متصل بالإنترنت حالياً/)).not.toBeInTheDocument()
  })
})

// ─── دورة حياة الرحلة ─────────────────────────────────────────────────────────
// ⚠️ هذا إخفاء وتفسير في الواجهة فقط — المنع الفعلي في firestore.rules
// (tripAcceptsExpenses). الاختبار يثبّت أن الواجهة *تشرح* الإغلاق ولا تكتفي
// بإخفاء الأزرار، وهو ما يميّز رحلة مغلقة عن عطل عشوائي.

describe('App — رحلة منتهية أو مؤرشفة', () => {
  // ⚠️ ExpenseForm يُرجع null بنفسه حين يكون النموذج مغلقاً، فاختباره والنموذج
  // مغلق لا يُثبت شيئاً عن App. لذا نفتح النموذج في هذه الاختبارات: عندها يكون
  // اختفاؤه في رحلة مغلقة قراراً اتخذه App (شرط canAddExpenses) لا المكوّن.

  it('رحلة نشطة والنموذج مفتوح: كلا مدخلَي المصروف ظاهران ولا لافتة إغلاق', async () => {
    h.isAddingExpense = true
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    expect(screen.getByPlaceholderText('مثال: وقود، عشاء...')).toBeInTheDocument() // ExpenseForm
    expect(screen.queryByText(/^هذه الرحلة/)).not.toBeInTheDocument()
  })

  it('رحلة نشطة: شريط الإدخال السريع ظاهر حين يكون النموذج مغلقاً', async () => {
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    expect(screen.getByPlaceholderText('عشاء، بنزين...')).toBeInTheDocument() // SmartInputBar
  })

  it.each([
    ['completed', /^هذه الرحلة منتهية/],
    ['archived', /^هذه الرحلة مؤرشفة/],
  ])('رحلة %s: يرفض App عرض المدخلات ولو كان النموذج مفتوحاً، ويشرح السبب', async (status, notice) => {
    h.tripStatus = status
    h.isAddingExpense = true
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    expect(screen.queryByPlaceholderText('عشاء، بنزين...')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('مثال: وقود، عشاء...')).not.toBeInTheDocument()
    // ولافتة تشرح لماذا اختفيا — لا اختفاء صامت
    expect(screen.getByText(notice)).toBeInTheDocument()
  })
})

// ─── الحالات الفارغة ──────────────────────────────────────────────────────────

describe('App — الحالات الفارغة', () => {
  it('بلا مسافرين: حالة فارغة توضّح الخطوة التالية', async () => {
    render(<App />)
    expect(await screen.findByText('لا يوجد مسافرون بعد')).toBeInTheDocument()
  })

  it('زر إضافة أول مسافر يظهر للمسؤول فقط', async () => {
    render(<App />)
    await screen.findByText('لا يوجد مسافرون بعد')
    expect(screen.queryByText('إضافة أول مسافر')).not.toBeInTheDocument()
  })

  it('المسؤول يرى زر إضافة أول مسافر وأزرار الإدارة', async () => {
    h.auth = { ...h.auth, isAdmin: true }
    render(<App />)
    expect(await screen.findByText('إضافة أول مسافر')).toBeInTheDocument()
    expect(screen.getByText('إدارة الرحلات')).toBeInTheDocument()
    expect(screen.getByText('سلة المهملات')).toBeInTheDocument()
  })

  it('غير المسؤول لا يرى أزرار الإدارة', async () => {
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    expect(screen.queryByText('إدارة الرحلات')).not.toBeInTheDocument()
    expect(screen.queryByText('سلة المهملات')).not.toBeInTheDocument()
    expect(screen.getByText('التقارير')).toBeInTheDocument()
  })

  it('بلا مصاريف: حالة فارغة في السجل ولا قسم إحصائيات', async () => {
    render(<App />)
    expect(await screen.findByText('لا توجد مصاريف بعد')).toBeInTheDocument()
  })

  it('رحلة مغلقة بلا مصاريف: نص مختلف يعكس أنها أُغلقت لا أنها لم تبدأ', async () => {
    h.tripStatus = 'archived'
    render(<App />)
    expect(await screen.findByText('لا توجد مصاريف في هذه الرحلة')).toBeInTheDocument()
  })
})

// ─── شريط حفظ الحساب ──────────────────────────────────────────────────────────
// ⚠️ هذه ليست اختبارات تثبيت للسلوك القديم بل حراسة لإصلاح: كان الشريط في
// TripPicker وحده، وتلك الشاشة لا تظهر لمن يفتح رابط رحلة ولديه رحلة واحدة —
// أي لأغلب الأعضاء، وهم بالضبط من صُنع لأجلهم (قاعدة المساهمة ١٧).

describe('App — شريط حفظ الحساب', () => {
  it('يظهر في الشاشة الرئيسية لجلسة مجهولة', async () => {
    h.auth = { ...h.auth, user: { uid: 'u1', isAnonymous: true } }
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    expect(screen.getByText(/محفوظة على هذا المتصفح وحده/)).toBeInTheDocument()
    expect(screen.getByText(/حفظ الحساب عبر Google/)).toBeInTheDocument()
  })

  it('لا يظهر لحساب دائم — لا شيء يُرقَّى', async () => {
    h.auth = { ...h.auth, user: { uid: 'u1', isAnonymous: false } }
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    expect(screen.queryByText(/محفوظة على هذا المتصفح وحده/)).not.toBeInTheDocument()
  })

  it('لا يظهر أثناء التحميل الأولي — تحذير قبل وصول البيانات بلا معنى', async () => {
    h.auth = { ...h.auth, user: { uid: 'u1', isAnonymous: true } }
    h.expensesLoaded = false
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    expect(screen.queryByText(/محفوظة على هذا المتصفح وحده/)).not.toBeInTheDocument()
  })
})

// ─── حالة التحميل ─────────────────────────────────────────────────────────────

describe('App — التحميل الأولي', () => {
  it('لا يعرض الحالات الفارغة قبل اكتمال تحميل المصاريف والمسافرين', async () => {
    h.expensesLoaded = false
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    // الحالة الفارغة مضلّلة أثناء التحميل: تقول «لا يوجد» بينما لم يصل شيء بعد
    expect(screen.queryByText('لا يوجد مسافرون بعد')).not.toBeInTheDocument()
    expect(screen.queryByText('لا توجد مصاريف بعد')).not.toBeInTheDocument()
  })
})
