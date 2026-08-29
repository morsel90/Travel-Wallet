// 🆕 لوحة تفاصيل رحلة واحدة داخل واجهة إدارة الرحلات — تعمل على *أي* رحلة
// بمعرّفها، لا على الرحلة المفتوحة فقط: قواعد Firestore تشترط isAdmin() ولا
// تشير للرحلة النشطة، فالمسؤول يعدّل رحلة أخرى دون مغادرة الحالية.
//
// نمط التحرير: المسار يُحرَّر على نسخة عمل محلية ثم يُحفظ بضغطة صريحة — لا حفظ
// تلقائي. السبب أن الحقل يُكتب كمصفوفة كاملة، فالحفظ بعد كل ضغطة يعني كتابات
// متلاحقة على نفس المستند وفرصة أكبر لضياع تعديل عند التحرير من جهازين معاً.
import { useEffect, useMemo, useState } from 'react'
import {
  Settings, Route, Save, Plane, Car, Train, Bus,
  Pencil, Trash2, Plus, ArrowUp, ArrowDown, Loader2, AlertTriangle, Lock,
  UserMinus, Check, Download, ShieldCheck, Share2, Ban,
  UserCheck, Link2, User, CalendarClock,
} from '../../icons'
import { useTripMembers } from '../../hooks/useTripMembers'
import { useTripTravelers } from '../../hooks/useTripTravelers'
import SegmentForm from './SegmentForm'
import EmptyState from '../EmptyState'
import {
  TRANSPORT_LABEL, MAX_SEGMENTS, LONG_TERM_THRESHOLD_DAYS,
  emptySegmentDraft, segmentToDraft, draftToSegment, validateDraft,
} from '../../utils/itinerary'
import type { SegmentDraft } from '../../utils/itinerary'
import type { TripSummary } from '../../hooks/useAllTrips'
import { TRIP_STATUS_LABEL } from '../../types'
import type { ToastMessage, Traveler, TransportMode, TripMember, TripStatus } from '../../types'
import { isEligibleForAgePurge } from '../../utils/tripStatus'

interface TripDetailPanelProps {
  trip: TripSummary
  /**
   * 🆕 المرحلة ٣: 'organizer' يخفي قسمي «نسخة احتياطية» و«حذف الرحلة» داخل
   * تبويب «إعدادات الرحلة» (لم يعودا تبويبين مستقلّين بعد الدمج)، ولا يرى زرّ
   * تعيين/إلغاء منظّم في تبويب المسافرين — تلك صلاحية للمسؤول العالمي حصراً
   * (انظر functions/index.js: manageMember mode=setRole). الحماية الحقيقية
   * خادمية بالكامل؛ هذا إخفاء واجهة فقط.
   */
  viewerRole: 'admin' | 'organizer'
  isSaving: boolean
  onSaveTripName: (tripId: string, name: string) => Promise<boolean>
  onSaveItinerary: (tripId: string, itinerary: TripSummary['itinerary'], currentType: TripSummary['tripType']) => Promise<boolean>
  /** 🆕 تغيير حالة دورة حياة الرحلة (active / completed / archived). */
  onSaveTripStatus: (tripId: string, status: TripStatus) => Promise<boolean>
  /** 🆕 تخفيض يدوي من طويلة المدى إلى قياسية — الترقية بالاتجاه المعاكس تلقائية بالكامل (انظر onSaveItinerary). */
  onSaveTripType: (tripId: string, type: TripSummary['tripType']) => Promise<boolean>
  /** حذف نهائي — الخادم يرفضه إن كانت الرحلة تحوي أي بيانات. */
  onDeleteTrip: (tripId: string) => Promise<boolean>
  /** 🆕 إزالة عضو — تمسح عضوية هذه الرحلة وحدها من claims المستهدَف. */
  onRemoveMember: (tripId: string, uid: string) => Promise<boolean>
  /** 🆕 تعيين/إلغاء دور «منظّم الرحلة» (المرحلة ٣) — المسؤول العالمي حصراً. */
  onSetMemberRole: (tripId: string, uid: string, role: 'organizer' | 'member') => Promise<boolean>
  /** 🆕 ربط مسافر "شبح" (uid == null) بحساب عضو انضمّ فعلاً — نموذج الهوية الهجين. */
  onLinkTravelerAccount: (tripId: string, travelerId: number, targetUid: string) => Promise<boolean>
  /** 🆕 تنزيل نسخة JSON احتياطية — docs/PLAN-backup-recovery.md المرحلة ١. */
  onExportBackup: (trip: TripSummary) => Promise<boolean>
  /** 🆕 رابط دعوة بنقرة واحدة — ينشئ توكناً جديداً (يُبطل أي رابط سابق لنفس الرحلة ضمنياً). null عند الفشل. */
  onCreateInvite: (tripId: string) => Promise<string | null>
  /** 🆕 يُبطل رابط الدعوة النشط لهذه الرحلة، إن وُجد. */
  onRevokeInvite: (tripId: string) => Promise<boolean>
  /** 🆕 توست عام — لتأكيد نسخ رسالة الدعوة حين لا يدعم الجهاز Web Share API. */
  showToast: (msg: ToastMessage, durationMs?: number) => void
  /** يُستدعى بعد نجاح الحذف — الرحلة لم تعد موجودة فلا يصح إبقاء لوحتها مفتوحة. */
  onDeleted: () => void
}

type DetailTab = 'details' | 'itinerary' | 'members'

// 🆕 «الأعضاء» و«المسافرون» كانا تبويبين منفصلين يعرضان وجهين لنفس الأشخاص —
// من انضمّ بحساب مقابل من له سطر في دفتر الرحلة — وربط الاثنين (نموذج الهوية
// الهجين) كان يتطلّب القفز بينهما لمطابقة سطر بعينه يدوياً. دُمجا في تبويب
// واحد بنفس منطق دمج «رحلاتي» مع «إدارة الرحلات»: سطر واحد لكل شخص بدل شاشتين.
// 🆕 التبويب سُمّي «المسافرون» لا «الأعضاء والمسافرون» — كل سطر فيه مسافر
// أصلاً (نفس المصطلح المستخدم في بقية التطبيق)، والعضوية شارة على السطر لا
// هوية التبويب. تسمية مركّبة كانت لتضلّل أكثر مما تُوضّح: "الأعضاء" وحدها لا
// تصدق على مسافر "شبح" لم ينضمّ بعد.
// 🆕 «نسخة احتياطية» و«حذف الرحلة» دُمجا بدورهما داخل «اسم الرحلة» — أُعيدت
// تسميته «إعدادات الرحلة» ليصدق على الأربعة معاً (الاسم، الحالة، النسخة
// الاحتياطية، الحذف): كلها خصائص عامة للرحلة نفسها لا لأشخاصها أو مسارها،
// ولا مبرّر لتبويب مستقل بزرّ واحد لكلٍّ منهما. الإخفاء عن المنظّم صار على
// مستوى القسمين داخل التبويب (viewerRole === 'admin') بدل التبويب كله.
const ALL_TABS: Array<{ key: DetailTab; label: string; Icon: typeof Settings }> = [
  { key: 'details',   label: 'إعدادات الرحلة', Icon: Settings },
  { key: 'itinerary', label: 'مسار الرحلة',     Icon: Route },
  { key: 'members',   label: 'المسافرون',       Icon: UserCheck },
]

const MODE_ICON: Record<TransportMode, typeof Plane> = {
  flight: Plane, car: Car, train: Train, bus: Bus,
}

const DT_LOCALE = 'ar-SA-u-ca-gregory-nu-latn'
/** 🆕 undefined ممكن الآن (وقت وصول مقطع جديد لا حقل له في النموذج) — يُعرض «—». */
const fmtDateTime = (iso: string | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString(DT_LOCALE, { day: 'numeric', month: 'short' })} · ${
    d.toLocaleTimeString(DT_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

const inputClass =
  'w-full border border-slate-200 rounded-xl px-3 py-2 text-base bg-white focus:ring-2 focus:ring-teal-500 outline-none'
const labelClass = 'block text-xs font-bold text-slate-500 mb-1.5'

// ما تمنعه كل حالة — يُعرض للمسؤول قبل أن يختار، لأن الأثر ليس بديهياً من الاسم
const STATUS_HELP: Record<TripStatus, string> = {
  active:    'كل شيء متاح: تسجيل المصاريف وتعديلها وإدارة المسافرين والأرصدة.',
  completed: 'لا مصاريف جديدة ولا تعديل عليها، لكن تعديل المسافرين والأرصدة يبقى متاحاً لتسوية الحسابات. التقارير تعمل كالمعتاد.',
  archived:  'للاطّلاع والتقارير فقط — لا تُقبل أي كتابة. وتختفي من قائمة الرحلات لمن ليس داخلها.',
}

/** "يومين"/"٥ أيام" — تقريب لأقرب يوم، كافٍ لتلميح لا لدقّة زمنية. */
function daysSince(timestamp: number): string {
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)))
  if (days === 0) return 'اليوم'
  if (days === 1) return 'يوم واحد'
  if (days === 2) return 'يومين'
  return `${days} يوماً`
}

export default function TripDetailPanel({
  trip, viewerRole, isSaving, onSaveTripName, onSaveItinerary,
  onSaveTripStatus, onSaveTripType, onDeleteTrip, onRemoveMember, onSetMemberRole, onLinkTravelerAccount,
  onExportBackup, onCreateInvite, onRevokeInvite, showToast, onDeleted,
}: TripDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('details')
  // 🆕 تأكيد بخطوتين قبل التخفيض إلى standard — نفس نمط تأكيد الإزالة
  // (removingUid) أعلاه، إذ لا رجوع فعلياً عن إخفاء واجهة الشهر المحاسبي.
  const [confirmingTypeDowngrade, setConfirmingTypeDowngrade] = useState(false)

  // 🆕 لا نقرأ السجلّين إلا والتبويب المدمج مفتوح: القراءة مقصورة على
  // المسؤول/المنظّم، والقائمتان لا تتغيّران إلا بفعله هو في هذه الشاشة نفسها —
  // فلا داعي لجلبهما مع كل رحلة يفتحها. كلتاهما تُجلبان معاً دائماً الآن لأن
  // العرض المدمج يحتاجهما معاً لمطابقة كل مسافر بعضويته (انظر useTripTravelers).
  const { members, error: membersError, refresh: refreshMembers } =
    useTripMembers(trip.id, activeTab === 'members')
  const { travelers, error: travelersError, refresh: refreshTravelers } =
    useTripTravelers(trip.id, activeTab === 'members')
  const [removingUid, setRemovingUid] = useState<string | null>(null)
  // 🆕 نموذج الهوية الهجين — id المسافر الذي فُتحت له قائمة "ربط بحساب"، والعضو
  // المختار فيها. سطر واحد يُفتح في كل مرة (نفس فكرة removingUid أعلاه).
  const [linkingTravelerId, setLinkingTravelerId] = useState<number | null>(null)
  const [linkTargetUid, setLinkTargetUid] = useState('')
  // 🆕 رابط دعوة بنقرة واحدة — توكن هذه الجلسة فقط (لا قراءة من الخادم لمعرفة
  // رابط نشط سابق؛ العقد الوحيد المتاح هو create/revoke — انظر manageInvite في
  // functions/index.js). null يعني «لم نطلب رابطاً بعد في هذه الجلسة».
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [isPreparingInvite, setIsPreparingInvite] = useState(false)
  const [inviteMsgCopied, setInviteMsgCopied] = useState(false)

  const [nameForm, setNameForm] = useState(trip.name)
  const [workingItinerary, setWorkingItinerary] = useState(trip.itinerary)
  const [draft, setDraft] = useState<SegmentDraft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // تأكيد الحذف بكتابة المعرّف: الحذف نهائي ولا تراجع عنه، وضغطة زر واحدة
  // بالخطأ على رحلة خاطئة أسهل مما ينبغي في قائمة رحلات متشابهة الأسماء.
  const [deleteConfirm, setDeleteConfirm] = useState('')

  // القائمة حيّة (onSnapshot): إعادة تهيئة النماذج عند تبديل الرحلة المختارة
  // حتى لا تُعرض بيانات الرحلة السابقة في حقول الرحلة الجديدة.
  useEffect(() => {
    setNameForm(trip.name)
    setWorkingItinerary(trip.itinerary)
    setDraft(null)
    setEditingId(null)
    setDraftError(null)
    setDeleteConfirm('')
    setActiveTab('details')
    // 🆕 توكن الجلسة السابقة يخصّ رحلة أخرى — لا معنى لمشاركته هنا.
    setInviteToken(null)
    setInviteMsgCopied(false)
    setLinkingTravelerId(null)
    setLinkTargetUid('')
    setConfirmingTypeDowngrade(false)
  }, [trip.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const nameDirty = nameForm !== trip.name

  const itineraryDirty = useMemo(
    () => JSON.stringify(workingItinerary) !== JSON.stringify(trip.itinerary),
    [workingItinerary, trip.itinerary]
  )

  const saveName = () => onSaveTripName(trip.id, nameForm)

  // 🆕 رابط الدخول المباشر (?invite=TOKEN) — طريقة الانضمام الوحيدة لرحلة (لا رمز رحلة بعد الآن).
  const directJoinUrl = (token: string) =>
    `${window.location.origin}${window.location.pathname}?invite=${token}`

  const inviteShareMessage = (token: string) =>
    `أهلاً! أدعوك للانضمام إلى رحلتنا ✈️ ${trip.name}. انقر على الرابط التالي للدخول مباشرة: ${directJoinUrl(token)}`

  // 🆕 مشاركة بنقرة واحدة — Web Share API إن دعمها الجهاز، وإلا نسخ الرسالة
  // كاملة للحافظة. ⚠️ لا await قبل navigator.share() إن كان لدينا توكن مسبقاً:
  // بعض المتصفحات (Safari تحديداً) ترفض استدعاء share() بعد فجوة زمنية طويلة
  // منذ ضغطة المستخدم (انتهاء "user activation") — لذا الزر يبقى معطّلاً
  // (isPreparingInvite) حتى يجهز التوكن، فلا حاجة لانتظار شبكة داخل هذه الدالة
  // في الحالة الشائعة (توكن جاهز مسبقاً من ضغطة سابقة أو من نفس الجلسة).
  const handleShareInvite = async () => {
    let token = inviteToken
    if (!token) {
      setIsPreparingInvite(true)
      token = await onCreateInvite(trip.id)
      setIsPreparingInvite(false)
      if (!token) return // توست الخطأ عُرض بالفعل من onCreateInvite
      setInviteToken(token)
    }

    const message = inviteShareMessage(token)

    if (navigator.share) {
      try {
        await navigator.share({ text: message })
      } catch {
        // المستخدم ألغى صفحة المشاركة، أو فشلت لسبب لا يستحق تنبيهاً
      }
      return
    }

    try {
      await navigator.clipboard.writeText(message)
      setInviteMsgCopied(true)
      showToast({ text: 'نُسخت رسالة الدعوة — الصقها لمن تريد دعوته.', type: 'success' })
      window.setTimeout(() => setInviteMsgCopied(false), 2000)
    } catch {
      // نادر: تعذّر الوصول للحافظة (صلاحيات المتصفح)
    }
  }

  const handleRevokeInvite = async () => {
    const ok = await onRevokeInvite(trip.id)
    if (ok) setInviteToken(null)
  }

  const submitRemoveMember = async (uid: string) => {
    setRemovingUid(null)
    const ok = await onRemoveMember(trip.id, uid)
    // إعادة الجلب عند النجاح وحده: الفشل يترك السطر موجوداً فعلاً، وإخفاؤه
    // يوهم بأن الإزالة تمّت.
    if (ok) refreshMembers()
  }

  // 🆕 تعيين/إلغاء دور منظّم — المسؤول العالمي حصراً (زرّه لا يظهر أصلاً لغيره،
  // ومنظّم يحاول استدعاءها مباشرة يُرفض خادمياً في manageMember).
  const submitSetRole = async (uid: string, role: 'organizer' | 'member') => {
    const ok = await onSetMemberRole(trip.id, uid, role)
    if (ok) refreshMembers()
  }

  // 🆕 أعضاء لم يُربَطوا بأي ملف مسافر بعد في هذه الرحلة — هذه القائمة وحدها
  // تُعرض في اختيار "ربط بحساب"، فلا يستطيع المنظّم ربط شخص مربوط أصلاً بغيره
  // (نفس المنع الذي تفرضه linkTravelerAccount خادمياً — هنا مجرّد تسهيل عرض).
  const unlinkedMembers = useMemo(
    () => (members ?? []).filter(m => !(travelers ?? []).some(t => t.uid === m.uid)),
    [members, travelers],
  )

  // 🆕 مطابقة كل مسافر بعضويته — قلب العرض المدمج. غياب السطر رغم t.uid موجود
  // معناه عضو أُزيل بالفعل (manageMember لا يمسّ Traveler.uid، انظر تعليقه):
  // الشارة "منضم" تبقى صادقة تاريخياً، لكن لا أزرار عضوية تُعرض له لأن لا شيء
  // لإزالته أو تعديل دوره.
  const memberByUid = useMemo(() => {
    const map = new Map<string, TripMember>()
    for (const m of members ?? []) map.set(m.uid, m)
    return map
  }, [members])

  // 🆕 ترتيب العرض: المنظّم أولاً، فمن ربط حسابه (مهما كان ترتيب إنشائه في
  // الدفتر)، ثم المسجَّلون يدوياً آخراً — لا ترتيب زمني عشوائي كما كان.
  const sortedTravelers = useMemo(() => {
    const rank = (t: Traveler) => {
      if (t.uid && memberByUid.get(t.uid)?.role === 'organizer') return 0
      if (t.uid) return 1
      return 2
    }
    return travelers ? [...travelers].sort((a, b) => rank(a) - rank(b)) : null
  }, [travelers, memberByUid])

  const startLinkTraveler = (travelerId: number) => {
    setLinkingTravelerId(travelerId)
    setLinkTargetUid('')
  }
  const cancelLinkTraveler = () => { setLinkingTravelerId(null); setLinkTargetUid('') }

  const submitLinkTraveler = async () => {
    if (linkingTravelerId === null || !linkTargetUid) return
    const ok = await onLinkTravelerAccount(trip.id, linkingTravelerId, linkTargetUid)
    if (ok) {
      cancelLinkTraveler()
      refreshTravelers()
      refreshMembers()
    }
  }

  // 🆕 "من" تُملأ تلقائياً بوجهة وصول آخر مقطع في المسار الحالي (بترتيب
  // المصفوفة اليدوي، لا الزمني) — غالباً المقطع التالي يبدأ من حيث انتهى سابقه.
  const startAdd = () => {
    setEditingId(null)
    setDraftError(null)
    const lastSegment = workingItinerary[workingItinerary.length - 1]
    setDraft(emptySegmentDraft(lastSegment?.arrival.location))
  }
  const startEdit = (id: string) => {
    const segment = workingItinerary.find(s => s.id === id)
    if (!segment) return
    setEditingId(id)
    setDraftError(null)
    setDraft(segmentToDraft(segment))
  }
  const cancelDraft = () => { setDraft(null); setEditingId(null); setDraftError(null) }

  const submitDraft = () => {
    if (!draft) return
    const error = validateDraft(draft)
    if (error) { setDraftError(error); return }
    const segment = draftToSegment(draft)
    setWorkingItinerary(prev =>
      editingId ? prev.map(s => (s.id === editingId ? segment : s)) : [...prev, segment]
    )
    cancelDraft()
  }

  // الترتيب يدوي عمداً: المقاطع تُعرض بترتيب المصفوفة كما هي، ولو رتّبناها
  // زمنياً أثناء التحرير لقفز مقطع لم يُدخَل وقته بعد بشكل مربك.
  const moveSegment = (index: number, direction: -1 | 1) => {
    setWorkingItinerary(prev => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const submitDelete = async () => {
    const ok = await onDeleteTrip(trip.id)
    if (ok) onDeleted()
  }

  // مؤشّر إرشادي فقط. المرجع الحقيقي هو فحص الخادم قبل الحذف مباشرةً: القائمة
  // هنا لا تعرف عدد المصاريف/المسافرين (لا تُقرأ في هذه الشاشة)، وحتى لو عرفت
  // لكانت لقطة قديمة قد يضيف عليها جهاز آخر بين العرض والضغط.
  const hasItinerary = trip.itinerary.length > 0

  // 🆕 المرحلة ٢ من دورة حياة الرحلة التلقائية — مؤشّر إرشادي أيضاً (الفرض
  // الفعلي خادمي، manageTrip mode:'delete'). حين تصحّ، الحذف متاح رغم بيانات
  // مالية حقيقية محتملة — الرسالة أدناه تشرح ذلك صراحةً بدل ترك المسؤول يظنّها
  // "فارغة" لمجرّد أن الزرّ لم يُرفَض.
  const agePurgeEligible = isEligibleForAgePurge(trip.status, trip.statusChangedAt)

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ALL_TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              activeTab === key
                ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'details' && (
        <>
        <form
          onSubmit={e => { e.preventDefault(); void saveName() }}
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4"
        >
          <div>
            <label className={labelClass} htmlFor="trip-name">اسم الرحلة</label>
            <input
              id="trip-name"
              type="text"
              value={nameForm}
              onChange={e => setNameForm(e.target.value)}
              className={inputClass}
            />
          </div>

          <hr className="border-slate-100" />

          {/* 🆕 لا حقول بنك هنا — بيانات البنك المعروضة لأعضاء هذه الرحلة تُقرأ
              حيّة من بروفايل المنظّم (users/{organizerUid})، لا مستند الرحلة.
              انظر docs/DECISIONS.md. */}
          <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <User className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              بيانات البنك المعروضة لأعضاء هذه الرحلة تُقرأ من بروفايل المنظّم
              الحالي مباشرة — عدّلها من (بروفايلي)، وينعكس التعديل فوراً هنا
              وفي كل رحلة أخرى ينظّمها نفس الحساب.
            </p>
          </div>

          <hr className="border-slate-100" />

          {/* 🆕 دورة حياة الرحلة — الأثر مفروض في firestore.rules لا هنا */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-teal-600" /> حالة الرحلة
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              يتغيّر الأثر فوراً لكل الأعضاء — والمنع مفروض على الخادم لا في الواجهة فقط.
            </p>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="حالة الرحلة">
              {(['active', 'completed', 'archived'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { if (value !== trip.status) void onSaveTripStatus(trip.id, value) }}
                  disabled={isSaving}
                  aria-pressed={trip.status === value}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border disabled:opacity-40 ${
                    trip.status === value
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {TRIP_STATUS_LABEL[value]}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 mt-2.5 leading-relaxed bg-slate-50 border border-slate-100 rounded-lg p-2.5">
              {STATUS_HELP[trip.status]}
            </p>

            {/* 🆕 شفافية لا وظيفة جديدة — لا يظهر لرحلة لم تُلمَس منذ هذه
                الميزة (statusChangedAt غائب، انظر useTripConfig.ts). */}
            {typeof trip.statusChangedAt === 'number' && (
              <p className="text-[11px] text-slate-400 mt-1.5">
                منذ {daysSince(trip.statusChangedAt)} على آخر تغيير لحالتها — يدوياً أو تلقائياً.
              </p>
            )}
          </div>

          <hr className="border-slate-100" />

          {/* 🆕 نوع الرحلة — الترقية إلى طويلة المدى تلقائية بالكامل (تُشتَقّ من
              مدّة مسار الرحلة عند حفظه، انظر deriveTripType)، فلا زرّ لها هنا.
              التخفيض وحده يدوي — الاتجاه الوحيد الذي لا يجوز أن يحدث بالخطأ. */}
          {trip.tripType === 'long_term' && (
            <>
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
                <CalendarClock className="w-4 h-4 text-teal-600" /> نوع الرحلة
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                طويلة المدى — تظهر لها واجهة "الشهر المحاسبي" لإغلاق الأرصدة شهرياً. رُقّيت
                تلقائياً لتجاوز مسارها {LONG_TERM_THRESHOLD_DAYS} يوماً، أو حُوِّلت يدوياً سابقاً.
              </p>

              {!confirmingTypeDowngrade ? (
                <button
                  type="button"
                  onClick={() => setConfirmingTypeDowngrade(true)}
                  disabled={isSaving}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  تحويل إلى رحلة قياسية
                </button>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2.5">
                  <p className="text-xs text-amber-900 leading-relaxed">
                    يُخفي هذا واجهة "الشهر المحاسبي" فقط — لا يُلغي أثر أي شهر أُغلق فعلياً على
                    هذه الرحلة، وحركاته المالية المُرحَّلة تبقى كما هي في دفتر الرحلة.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { void onSaveTripType(trip.id, 'standard'); setConfirmingTypeDowngrade(false) }}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      تأكيد التحويل
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingTypeDowngrade(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
            <hr className="border-slate-100" />
            </>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isSaving || !nameDirty}
              className="flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ التغييرات
            </button>
            {nameDirty && (
              <button
                type="button"
                onClick={() => setNameForm(trip.name)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                تراجع
              </button>
            )}
          </div>
        </form>

        {/* 🆕 نسخة احتياطية وحذف الرحلة — قسمان للمسؤول العالمي حصراً، لا
            المنظّم (كانا تبويبين مستقلّين قبل الدمج؛ انظر تعليق ALL_TABS أعلاه).
            الحماية الحقيقية خادمية بالكامل (manageTrip mode:'delete' وقراءة
            بيانات النسخة الاحتياطية تشترطان isAdmin())؛ هذا إخفاء واجهة فقط. */}
        {viewerRole === 'admin' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Download className="w-4 h-4 text-teal-600" /> تنزيل نسخة احتياطية
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed">
              ملف JSON يحتوي كل بيانات هذه الرحلة القابلة لإعادة الاستيراد لاحقاً — المسافرون
              والمصاريف وسجلّات الإيداع ومسار الرحلة. بخلاف تصدير Excel، هذا الملف يحتفظ بالمعرّفات
              الداخلية وسجلّ الحذف اللين، وهو <span className="font-bold">الشيء الوحيد الذي ينجو من فقدان
              الوصول لحساب Google/Firebase نفسه</span> — نسخ Firestore التلقائي يعيش داخل نفس المشروع.
            </p>

            <p className="text-[11px] text-slate-400">
              لا يعيد وصول الأعضاء عند استعادته لاحقاً — العضوية تعيش في حساب كل عضو لا في هذا الملف.
            </p>

            <button
              type="button"
              onClick={() => void onExportBackup(trip)}
              disabled={isSaving}
              className="flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              تنزيل نسخة احتياطية (JSON)
            </button>
          </div>
        )}

        {viewerRole === 'admin' && (
          <form
            onSubmit={e => { e.preventDefault(); void submitDelete() }}
            className="bg-white rounded-2xl shadow-sm border border-rose-200 p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600" /> حذف الرحلة نهائياً
            </h3>

            <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1.5">
              <p className="font-bold">لا يمكن التراجع عن هذا الإجراء.</p>
              <p>
                يُحذف مستند الرحلة نهائياً. الحذف متاح <span className="font-bold">للرحلات الفارغة فقط</span> —
                أي التي لا تحوي أي مسافر أو مصروف — حمايةً للسجلات المالية وسجلات الإيداع
                التي لا يمكن استرجاعها.
              </p>
              <p>بعد الحذف يصبح المعرّف <span dir="ltr" className="font-mono">{trip.id}</span> متاحاً لإنشاء رحلة جديدة به.</p>
            </div>

            {agePurgeEligible && (
              <p className="text-xs font-bold text-rose-900 bg-rose-100 border border-rose-300 rounded-xl p-2.5 leading-relaxed">
                استثناء: هذه الرحلة مؤرشفة منذ أكثر من 90 يوماً، فالحذف متاح لها
                حتى لو كانت تحوي مسافرين أو مصاريف أو سجلات إيداع فعلية — وستُحذف
                كل هذه البيانات نهائياً معها، لا تُترَك يتيمة.
              </p>
            )}

            {hasItinerary && (
              <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                تنبيه: هذه الرحلة تحوي {trip.itinerary.length} مقطعاً في مسارها، وستُحذف معها.
              </p>
            )}

            <div>
              <label className={labelClass} htmlFor="delete-confirm">
                للتأكيد، اكتب معرّف الرحلة: <span dir="ltr" className="font-mono text-slate-700">{trip.id}</span>
              </label>
              <input
                id="delete-confirm"
                type="text"
                autoComplete="off"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                dir="ltr"
                className={`${inputClass} text-right`}
              />
            </div>

            <button
              type="submit"
              disabled={isSaving || deleteConfirm.trim() !== trip.id}
              className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              حذف الرحلة نهائياً
            </button>
          </form>
        )}
        </>
      )}

      {activeTab === 'itinerary' && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Route className="w-4 h-4 text-teal-600" /> مقاطع المسار
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {workingItinerary.length} من {MAX_SEGMENTS}. يظهر أول مقطع قادم في صفحة الرحلة.
                </p>
              </div>
              {!draft && (
                <button
                  type="button"
                  onClick={startAdd}
                  disabled={workingItinerary.length >= MAX_SEGMENTS}
                  className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" /> إضافة مقطع
                </button>
              )}
            </div>

            {itineraryDirty && (
              <div className="mt-4 flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-amber-800 flex-1">تعديلات غير محفوظة على المسار.</span>
                <button
                  type="button"
                  onClick={() => void onSaveItinerary(trip.id, workingItinerary, trip.tripType)}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  حفظ المسار
                </button>
                <button
                  type="button"
                  onClick={() => { setWorkingItinerary(trip.itinerary); cancelDraft() }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  تراجع
                </button>
              </div>
            )}
          </div>

          {draft && (
            <SegmentForm
              draft={draft}
              setDraft={setDraft}
              onSubmit={submitDraft}
              onCancel={cancelDraft}
              isEditing={editingId !== null}
              error={draftError}
            />
          )}

          {workingItinerary.length === 0 && !draft ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <EmptyState
                Icon={Route}
                title="لا يوجد مسار بعد"
                description="أضف رحلات الطيران أو التنقلات البرية ليظهر للمسافرين المقطع القادم وموعده."
                actionLabel="إضافة أول مقطع"
                onAction={startAdd}
                ActionIcon={Plus}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {workingItinerary.map((segment, index) => {
                const ModeIcon = MODE_ICON[segment.mode]
                // 🆕 identifier اختياري الآن — العنوان الغامق يسقط لـnotes ثم
                // لاسم وسيلة التنقل بدل عرض "undefined" أو ترك سطر فارغ.
                const title = segment.identifier || segment.notes || TRANSPORT_LABEL[segment.mode]
                return (
                  <div key={segment.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex items-center justify-center w-9 h-9 rounded-full bg-teal-100 text-teal-700 shrink-0">
                          <ModeIcon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-400">
                            {TRANSPORT_LABEL[segment.mode]}
                            {segment.reference && <span dir="ltr"> · {segment.reference}</span>}
                          </p>
                          <p className="text-sm font-bold text-slate-800 truncate">{title}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button" onClick={() => moveSegment(index, -1)} disabled={index === 0}
                          aria-label="تحريك لأعلى"
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button" onClick={() => moveSegment(index, 1)}
                          disabled={index === workingItinerary.length - 1}
                          aria-label="تحريك لأسفل"
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button" onClick={() => startEdit(segment.id)}
                          aria-label={`تعديل ${title}`}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-500 hover:text-teal-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkingItinerary(prev => prev.filter(s => s.id !== segment.id))}
                          aria-label={`حذف ${title}`}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className="bg-slate-50 rounded-lg border border-slate-100 p-2.5 min-w-0">
                        <p className="text-[11px] font-bold text-slate-400 mb-0.5">الانطلاق</p>
                        <p className="text-sm font-bold text-slate-700 truncate">{segment.departure.location}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{fmtDateTime(segment.departure.time)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg border border-slate-100 p-2.5 min-w-0">
                        <p className="text-[11px] font-bold text-slate-400 mb-0.5">الوصول</p>
                        <p className="text-sm font-bold text-slate-700 truncate">{segment.arrival.location}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{fmtDateTime(segment.arrival.time)}</p>
                      </div>
                    </div>

                    {/* 🆕 identifier أصبح عنوان البطاقة أعلاه إن وُجد — الملاحظات
                        تُعرض هنا فقط حين لا تتطابق مع ما ظهر عنواناً بالفعل. */}
                    {segment.notes && segment.notes !== title && (
                      <p className="text-[11px] text-slate-500 mt-2.5 bg-slate-50 border border-slate-100 rounded-lg p-2 leading-relaxed">
                        {segment.notes}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'members' && (
        <>
          {/* 🆕 رابط دعوة بنقرة واحدة — طريقة الانضمام الوحيدة لرحلة (لا رمز
              رحلة بعد الآن). رابط واحد نشط فقط لكل رحلة. */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-teal-600" /> دعوة أعضاء
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              رابط يدخل به المدعوّ إلى الرحلة مباشرة بعد تسجيل دخوله. رابط واحد نشط فقط لكل
              رحلة — مشاركة رابط جديد تُبطل أي رابط سابق تلقائياً.
            </p>

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void handleShareInvite()}
                disabled={isPreparingInvite}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-40"
              >
                {isPreparingInvite ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : inviteMsgCopied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                {isPreparingInvite ? 'جارٍ التجهيز...' : inviteMsgCopied ? 'نُسخت الرسالة' : 'مشاركة رابط الدعوة'}
              </button>
              <button
                type="button"
                onClick={() => void handleRevokeInvite()}
                disabled={isSaving}
                className="flex items-center gap-1.5 text-rose-700 hover:bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
              >
                <Ban className="w-3.5 h-3.5" /> إبطال رابط الدعوة
              </button>
            </div>

            {typeof navigator === 'undefined' || !navigator.share ? (
              <p className="text-[11px] text-slate-400">
                جهازك لا يدعم المشاركة المباشرة — يُنسخ نص الدعوة إلى الحافظة بدلاً من ذلك.
              </p>
            ) : null}
          </div>

          {/* 🆕 قائمة موحّدة: كل مسافر في الدفتر مع حالة ربطه بعضويته إن
              وُجدت، بدل تبويبين منفصلين يتطلّبان القفز بينهما لمطابقة سطر
              بعينه. الأعضاء الذين لا ملف مسافر لهم بعد (حالة نادرة — فشل
              التزويد التلقائي، انظر تعليق joinViaInvite في functions/index.js)
              يظهرون في قسم إضافي أسفل القائمة بدل أن يختفوا. */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-teal-600" /> المسافرون
              {travelers && <span className="text-xs font-normal text-slate-400">({travelers.length})</span>}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              كل مسافر في دفتر هذه الرحلة، وحالة ربطه بحساب انضمّ فعلاً — "مسجل يدوياً" يعني ملفاً
              أنشأه المنظّم لشخص لم ينضمّ بعد (أو لا يملك حساباً)، ويمكن ربطه لاحقاً بحسابه الحقيقي.
            </p>
          </div>

          {/* ⚠️ التأخير يُقال هنا لا يُخفى: العضوية تُقرأ من التوكن وهو صالح ٦٠
              دقيقة، فالإزالة لا تُغلق الباب فوراً. مسؤول يظنّها فورية قد يعتمد
              عليها في حالة تسرّب — والصمت هنا أسوأ من القيد نفسه. */}
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
            <p className="font-bold">الإزالة قد تستغرق حتى ساعة لتصبح فعّالة.</p>
            <p>
              جلسة العضو صالحة ٦٠ دقيقة، والصلاحية تُقرأ منها. لا يوجد إجراء فوري بديل —
              العضوية تبقى سارية حتى تنتهي صلاحية توكن العضو الحالي.
            </p>
          </div>

          {(membersError || travelersError) && (
            <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
              تعذّر جلب قائمة الأعضاء أو المسافرين. القراءة متاحة للمسؤول أو منظّم الرحلة — جرّب تسجيل الخروج والدخول لتحديث صلاحيتك.
            </p>
          )}

          {(!members || !travelers) && !membersError && !travelersError && (
            <div className="flex items-center justify-center gap-2 text-slate-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-bold">جارٍ الجلب...</span>
            </div>
          )}

          {members && travelers && travelers.length === 0 && unlinkedMembers.length === 0 && (
            <EmptyState
              Icon={UserCheck}
              title="لا أحد في السجلّ بعد"
              description="يُضاف المسافرون من صفحة الرحلة الرئيسية، أو تلقائياً عند الانضمام برابط دعوة."
            />
          )}

          {members && sortedTravelers && (sortedTravelers.length > 0 || unlinkedMembers.length > 0) && (
            <div className="space-y-2">
              {sortedTravelers.map(t => {
                const m = t.uid ? memberByUid.get(t.uid) : undefined
                const isLinking = linkingTravelerId === t.id
                const isConfirming = !!m && removingUid === m.uid
                return (
                  <div key={t.id} className={`rounded-xl border p-3 transition-colors ${
                    isConfirming ? 'border-rose-300 bg-rose-50'
                      : isLinking ? 'border-teal-300 bg-teal-50/60'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}>
                    {/* ⚠️ flex-col أساساً، صفّ واحد من sm فصاعداً — تقاسم سطر واحد بين
                        الاسم والشارة وزرّ "ربط بحساب مسافر" (أو زرّي المنظّم/الإزالة)
                        كان يترك الاسم حرفين أو ثلاثة قبل القصّ على الموبايل، لأن الثلاثة
                        تتنازع نفس العرض الضيق (رُصد فعلياً). الاسم يأخذ سطراً كاملاً له
                        وحده الآن، والأزرار تنزل سطراً مستقلاً تحته — نمط قوائم
                        المحادثات/الأعضاء المعتاد (واتساب مثلاً) لا صفّاً واحداً مزدحماً. */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{t.name}</span>
                          {/* 🆕 شارة "منظّم" تكفي وحدها — منظّم الرحلة منضمّ إليها بداهةً،
                              فشارة "منضم" بجانبها معلومة صفرية. تظهر شارة الدور للجميع
                              (منظّم يقرأ السجلّ أيضاً)، وزرّ تغييرها أدناه للمسؤول العالمي وحده. */}
                          {m?.role === 'organizer' ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full shrink-0">
                              <ShieldCheck className="w-3 h-3" /> منظّم
                            </span>
                          ) : t.uid ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full shrink-0">
                              <UserCheck className="w-3 h-3" /> منضم
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                              مسجل يدوياً
                            </span>
                          )}
                        </p>
                        {/* 🆕 هوية الحساب المرتبط — قد تختلف عن اسم المسافر في الدفتر
                            (لقب اختاره هو بنفسه)، وهي ما يعرف به المسؤول العضو فعلياً. */}
                        {m && (
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {m.displayName || m.email || 'عضو بجلسة مجهولة'}
                          </p>
                        )}
                        {m && (
                          <p className="text-[11px] text-slate-500 mt-1">
                            {/* غياب joinedAt يُعرض «غير معروف» لا 1970: السطور
                                المُرحَّلة لا تعرف التاريخ، ولا مكان يحفظه. */}
                            {m.joinedAt
                              ? `انضمّ: ${new Date(m.joinedAt).toLocaleDateString(DT_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`
                              : 'تاريخ الانضمام غير معروف (سطر مُرحَّل)'}
                            {m.mergedFrom && ' · نُقلت عضويته من جلسة سابقة'}
                          </p>
                        )}
                      </div>

                      {!t.uid && !isLinking && (
                        <button
                          type="button"
                          onClick={() => startLinkTraveler(t.id)}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 text-teal-700 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 shrink-0"
                        >
                          <Link2 className="w-3.5 h-3.5" /> ربط بحساب مسافر
                        </button>
                      )}

                      {/* 🆕 أزرار العضوية تحتاج سطر عضو مطابق فعلياً — قد يغيب
                          رغم t.uid موجود إن كان قد أُزيل بالفعل (انظر تعليق
                          memberByUid أعلاه). */}
                      {m && !isConfirming && (
                        <div className="flex items-center gap-2 shrink-0">
                          {/* 🆕 تعيين/إلغاء المنظّم — المسؤول العالمي حصراً (viewerRole).
                              functions/index.js يرفض أي استدعاء آخر خادمياً بغضّ النظر. */}
                          {viewerRole === 'admin' && (
                            <button
                              type="button"
                              onClick={() => void submitSetRole(m.uid, m.role === 'organizer' ? 'member' : 'organizer')}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 text-teal-700 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {m.role === 'organizer' ? 'إلغاء التنظيم' : 'تعيين منظّماً'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRemovingUid(m.uid)}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 text-rose-700 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                          >
                            <UserMinus className="w-3.5 h-3.5" /> إزالة
                          </button>
                        </div>
                      )}
                    </div>

                    {isLinking && (
                      <div className="mt-3 pt-3 border-t border-teal-200 space-y-2.5">
                        {unlinkedMembers.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            لا يوجد عضو غير مربوط بعد — كل من انضمّ للرحلة مربوط بمسافر آخر بالفعل.
                          </p>
                        ) : (
                          <>
                            <label className={labelClass} htmlFor="link-target-uid">اختر الحساب</label>
                            <select
                              id="link-target-uid"
                              value={linkTargetUid}
                              onChange={e => setLinkTargetUid(e.target.value)}
                              className={inputClass}
                            >
                              <option value="">— اختر عضواً —</option>
                              {unlinkedMembers.map(um => (
                                <option key={um.uid} value={um.uid}>
                                  {um.displayName || um.email || `عضو بجلسة مجهولة (${um.uid})`}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void submitLinkTraveler()}
                            disabled={isSaving || !linkTargetUid}
                            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                          >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                            تأكيد الربط
                          </button>
                          <button
                            type="button"
                            onClick={cancelLinkTraveler}
                            className="px-3 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}

                    {isConfirming && m && (
                      <div className="mt-3 pt-3 border-t border-rose-200 space-y-2.5">
                        <p className="text-xs text-rose-900">
                          <span className="font-bold">تُزال عضويته من هذه الرحلة وحدها.</span>{' '}
                          رحلاته الأخرى لا تتأثر، ومصاريفه المسجَّلة تبقى كما هي — إزالة شخص من
                          الرحلة ليست محو أثره من الدفتر.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void submitRemoveMember(m.uid)}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                          >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                            تأكيد الإزالة
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemovingUid(null)}
                            className="px-3 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 🆕 أعضاء بلا ملف مسافر — حالة نادرة (فشل التزويد التلقائي عند
                  الانضمام). لا زرّ ربط هنا: الربط يتم من جهة المسافر "الشبح"
                  أعلاه، لا العكس. */}
              {unlinkedMembers.map(m => {
                const isConfirming = removingUid === m.uid
                return (
                  <div
                    key={m.uid}
                    className={`rounded-xl border p-3 transition-colors ${
                      isConfirming ? 'border-rose-300 bg-rose-50' : 'border-amber-200 bg-amber-50/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{m.displayName || m.email || 'عضو بجلسة مجهولة'}</span>
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                            بلا ملف مسافر
                          </span>
                          {m.role === 'organizer' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full shrink-0">
                              <ShieldCheck className="w-3 h-3" /> منظّم
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {m.joinedAt
                            ? `انضمّ: ${new Date(m.joinedAt).toLocaleDateString(DT_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : 'تاريخ الانضمام غير معروف (سطر مُرحَّل)'}
                          {m.mergedFrom && ' · نُقلت عضويته من جلسة سابقة'}
                        </p>
                      </div>

                      {!isConfirming && (
                        <div className="flex items-center gap-2 shrink-0">
                          {viewerRole === 'admin' && (
                            <button
                              type="button"
                              onClick={() => void submitSetRole(m.uid, m.role === 'organizer' ? 'member' : 'organizer')}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 text-teal-700 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {m.role === 'organizer' ? 'إلغاء التنظيم' : 'تعيين منظّماً'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRemovingUid(m.uid)}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 text-rose-700 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                          >
                            <UserMinus className="w-3.5 h-3.5" /> إزالة
                          </button>
                        </div>
                      )}
                    </div>

                    {isConfirming && (
                      <div className="mt-3 pt-3 border-t border-rose-200 space-y-2.5">
                        <p className="text-xs text-rose-900">
                          <span className="font-bold">تُزال عضويته من هذه الرحلة وحدها.</span>{' '}
                          رحلاته الأخرى لا تتأثر — لا ملف مسافر له هنا أصلاً ليتأثر.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void submitRemoveMember(m.uid)}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                          >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                            تأكيد الإزالة
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemovingUid(null)}
                            className="px-3 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </>
      )}
    </div>
  )
}
