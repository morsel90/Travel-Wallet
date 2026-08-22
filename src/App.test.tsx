import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
vi.mock('./utils/tripId', () => ({ TRIP_ID: 'trip-1', HAS_EXPLICIT_TRIP_ID: true, INVITE_TOKEN: null }))

// قيم الخطافات قابلة للتعديل لكل اختبار — تُقرأ داخل المحاكاة عند كل استدعاء.
const h = vi.hoisted(() => ({
  auth: {
    user: { uid: 'u1' } as { uid: string } | null,
    isAdmin: false, authLoading: false,
    // 🆕 لا رمز رحلة بعد الآن — الوصول عضوية مباشرة (claim). trip-1 هنا لأن
    // ./utils/tripId مُحاكى أدناه بـ TRIP_ID: 'trip-1'؛ الأساس الافتراضي «عضو
    // ولديه وصول» يوازي needsTripPin:false في النموذج القديم.
    joinedTripIds: ['trip-1'] as string[],
    signInError: null as string | null, isSigningIn: false,
    signInWithGoogle: vi.fn(), signInWithEmail: vi.fn(),
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
  useTripConfig: () => ({
    tripName: 'رحلة الاختبار',
    organizerUid: 'organizer-1',
    itinerary: [],
    status: h.tripStatus,
  }),
  // 🆕 قراءة حيّة لبيانات بنك المنظّم — كائن ثابت يكفي، لا يُستهلك تفصيلياً
  // في اختبارات ترتيب البوابات هذه.
  useOrganizerBankDetails: () => ({
    bankDetails: { bankName: 'بنك الاختبار', beneficiary: 'مسافر', iban: 'SA0000000000000000000000' },
    displayName: null,
    loading: false,
  }),
  // 🆕 المرحلة ٣ — «هل أنا منظّم الرحلة الحالية؟». افتراضياً false، وتُفعَّل
  // صراحةً في الاختبارات التي تحتاجها تحديداً.
  useMyTripRole: () => h.isOrganizer,
  useBalances: () => ({ balances: [], totalSpent: 0, totalDeposited: 0, totalRemaining: 0 }),
  useModals: () => ({
    modal: { type: 'none' }, openReports: noop, openTrashBin: noop, openTripAdmin: noop,
    openDeleteTraveler: noop, openDeposit: noop, openDepositHistory: noop, openUserProfile: noop, closeModal: noop,
  }),
  // 🆕 بروفايل المستخدم العام (اسم/بنك) — لا يُستهلك في تجميعات هذا الاختبار
  // بخلاف تمريره كخاصية، فكائن ثابت يكفي.
  useUserProfile: () => ({
    profile: { displayName: '', bankDetails: { bankName: '', beneficiary: '', iban: '' } },
    isSaving: false, saveProfile: noop,
  }),
  // 🆕 مزامنة صامتة لاسم المسافر من البروفايل — بلا أثر مرئي يستحق تجميعه هنا.
  // دالة سهماً لا `noop` مباشرة: vi.mock مرفوعة فوق تعريف noop، فالوصول له هنا
  // مباشرة (لا داخل إغلاق يُستدعى لاحقاً) يسبق تهيئته.
  useSyncTravelerNameFromProfile: () => undefined,
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
    isSaving: false, saveItinerary: noop, saveTripName: noop,
    saveTripStatus: noop, createTrip: noop, deleteTrip: noop,
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
    user: { uid: 'u1' },
    isAdmin: false, authLoading: false, joinedTripIds: ['trip-1'],
    signInError: null, isSigningIn: false, signInWithGoogle: vi.fn(), signInWithEmail: vi.fn(),
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
// الترتيب في App.tsx: استعادة الجلسة ← تسجيل الدخول ← رحلاتي ← عضوية هذه
// الرحلة ← التطبيق. لا رمز رحلة بعد الآن (انظر docs/DECISIONS.md) — قلبُ هذا
// الترتيب لا يُنتج خطأ تصريفياً ولا يكسر أي اختبار آخر، ولهذا يُثبَّت.

describe('App — ترتيب البوابات', () => {
  it('يعرض التطبيق مباشرة حين يكون المعرّف صريحاً والوصول متاح', async () => {
    render(<App />)
    expect(await screen.findByText('أرصدة المسافرين')).toBeInTheDocument()
    expect(screen.queryByText('سجّل الدخول لمتابعة')).not.toBeInTheDocument()
    expect(screen.queryByText('لست عضواً في هذه الرحلة')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'رحلاتي' })).not.toBeInTheDocument()
  })

  it('أثناء authLoading تظهر بوابة الدخول بحالة تحقّق لا بأزرار تسجيل الدخول', async () => {
    // AuthGate يعرض «جارٍ التحقق من جلستك...» بدل الأزرار حين loading — وهذا
    // مقصود: عرض أزرار تسجيل دخول قبل معرفة الحاجة إليها (قد تكون هناك جلسة
    // محفوظة) يطالب المستخدم بما قد لا يُطلب منه.
    h.auth = { ...h.auth, authLoading: true }
    render(<App />)
    await waitFor(() => expect(screen.getByText('جارٍ التحقق من جلستك...')).toBeInTheDocument())
    expect(screen.queryByText('متابعة عبر Google')).not.toBeInTheDocument()
    expect(screen.queryByText('أرصدة المسافرين')).not.toBeInTheDocument()
  })

  it('يعرض بوابة تسجيل الدخول حين لا يوجد مستخدم مسجَّل دخوله', async () => {
    h.auth = { ...h.auth, user: null }
    render(<App />)
    expect(await screen.findByText('سجّل الدخول لمتابعة')).toBeInTheDocument()
    expect(screen.getByText('متابعة عبر Google')).toBeInTheDocument()
    expect(screen.queryByText('أرصدة المسافرين')).not.toBeInTheDocument()
  })

  it('يعرض شاشة "لست عضواً" حين يكون مسجَّل الدخول لكنه ليس عضواً في هذه الرحلة، ولم يكن مسؤولاً', async () => {
    h.auth = { ...h.auth, joinedTripIds: [] }
    render(<App />)
    expect(await screen.findByText('لست عضواً في هذه الرحلة')).toBeInTheDocument()
    expect(screen.queryByText('أرصدة المسافرين')).not.toBeInTheDocument()
  })

  it('المسؤول يتجاوز شاشة "لست عضواً" حتى بلا عضوية في هذه الرحلة', async () => {
    h.auth = { ...h.auth, isAdmin: true, joinedTripIds: [] }
    render(<App />)
    expect(await screen.findByText('أرصدة المسافرين')).toBeInTheDocument()
    expect(screen.queryByText('لست عضواً في هذه الرحلة')).not.toBeInTheDocument()
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
    expect(screen.getByText('سلة المهملات')).toBeInTheDocument()
    // 🆕 «إدارة الرحلات» انتقلت من ExpensesPanel إلى AccountMenu (الهيدر) —
    // لا تظهر إلا بعد فتح القائمة. انظر AccountMenu.tsx وdocs/DECISIONS.md.
    fireEvent.click(screen.getByRole('button', { name: 'حسابي' }))
    expect(screen.getByText('لوحة الإدارة')).toBeInTheDocument()
  })

  it('غير المسؤول لا يرى أزرار الإدارة', async () => {
    render(<App />)
    await screen.findByText('أرصدة المسافرين')
    expect(screen.queryByText('سلة المهملات')).not.toBeInTheDocument()
    expect(screen.getByText('التقارير')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'حسابي' }))
    expect(screen.queryByText('لوحة الإدارة')).not.toBeInTheDocument()
    expect(screen.queryByText('إدارة الرحلة')).not.toBeInTheDocument()
    expect(screen.getByText('تسجيل الدخول كمسؤول')).toBeInTheDocument()
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
