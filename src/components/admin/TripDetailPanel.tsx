// 🆕 لوحة تفاصيل رحلة واحدة داخل واجهة إدارة الرحلات — تعمل على *أي* رحلة
// بمعرّفها، لا على الرحلة المفتوحة فقط: قواعد Firestore تشترط isAdmin() ولا
// تشير للرحلة النشطة، فالمسؤول يعدّل رحلة أخرى دون مغادرة الحالية.
//
// نمط التحرير: المسار يُحرَّر على نسخة عمل محلية ثم يُحفظ بضغطة صريحة — لا حفظ
// تلقائي. السبب أن الحقل يُكتب كمصفوفة كاملة، فالحفظ بعد كل ضغطة يعني كتابات
// متلاحقة على نفس المستند وفرصة أكبر لضياع تعديل عند التحرير من جهازين معاً.
import { useEffect, useMemo, useState } from 'react'
import {
  Building2, Route, KeyRound, Save, Plane, Car, Train, Bus,
  Pencil, Trash2, Plus, ArrowUp, ArrowDown, Loader2, AlertTriangle, Lock,
  Users, UserMinus, Copy, Check, Download, ShieldCheck, Share2, Ban,
} from '../../icons'
import { useTripMembers } from '../../hooks/useTripMembers'
import { tripUrl } from '../../utils/tripId'
import QrCode from './QrCode'
import SegmentForm from './SegmentForm'
import EmptyState from '../EmptyState'
import {
  TRANSPORT_LABEL, MAX_SEGMENTS,
  emptySegmentDraft, segmentToDraft, draftToSegment, validateDraft,
} from '../../utils/itinerary'
import type { SegmentDraft } from '../../utils/itinerary'
import type { TripSummary } from '../../hooks/useAllTrips'
import { TRIP_STATUS_LABEL } from '../../types'
import type { BankDetails, ToastMessage, TransportMode, TripStatus } from '../../types'

interface TripDetailPanelProps {
  trip: TripSummary
  /**
   * 🆕 المرحلة ٣: 'organizer' يخفي التبويبات الإدارية الحساسة (نسخة احتياطية،
   * رمز الدخول، حذف الرحلة) ولا يرى زرّ تعيين/إلغاء منظّم في تبويب الأعضاء —
   * تلك صلاحية للمسؤول العالمي حصراً (انظر functions/index.js: manageMember
   * mode=setRole). الحماية الحقيقية خادمية بالكامل؛ هذا إخفاء واجهة فقط.
   */
  viewerRole: 'admin' | 'organizer'
  isSaving: boolean
  onSaveTripName: (tripId: string, name: string) => Promise<boolean>
  onSaveBankDetails: (tripId: string, details: BankDetails) => Promise<boolean>
  onSaveItinerary: (tripId: string, itinerary: TripSummary['itinerary']) => Promise<boolean>
  onResetPin: (tripId: string, pin: string) => Promise<boolean>
  /** 🆕 تغيير حالة دورة حياة الرحلة (active / completed / archived). */
  onSaveTripStatus: (tripId: string, status: TripStatus) => Promise<boolean>
  /** حذف نهائي — الخادم يرفضه إن كانت الرحلة تحوي أي بيانات. */
  onDeleteTrip: (tripId: string) => Promise<boolean>
  /** 🆕 إزالة عضو — تمسح عضوية هذه الرحلة وحدها من claims المستهدَف. */
  onRemoveMember: (tripId: string, uid: string) => Promise<boolean>
  /** 🆕 تعيين/إلغاء دور «منظّم الرحلة» (المرحلة ٣) — المسؤول العالمي حصراً. */
  onSetMemberRole: (tripId: string, uid: string, role: 'organizer' | 'member') => Promise<boolean>
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

type DetailTab = 'bank' | 'itinerary' | 'members' | 'backup' | 'pin' | 'danger'

const ALL_TABS: Array<{ key: DetailTab; label: string; Icon: typeof Building2 }> = [
  { key: 'bank',      label: 'الاسم والحساب', Icon: Building2 },
  { key: 'itinerary', label: 'مسار الرحلة',   Icon: Route },
  { key: 'members',   label: 'الأعضاء',       Icon: Users },
  { key: 'backup',    label: 'نسخة احتياطية', Icon: Download },
  { key: 'pin',       label: 'رمز الدخول',    Icon: KeyRound },
  { key: 'danger',    label: 'حذف الرحلة',    Icon: Trash2 },
]

// 🆕 منظّم الرحلة لا يرى ما ليس من صلاحياته أصلاً — لا مجرّد أزرار معطّلة.
// النسخة الاحتياطية ورمز الدخول والحذف تبقى للمسؤول العالمي وحده (الخطة، المرحلة ٣).
const ORGANIZER_HIDDEN_TABS: ReadonlySet<DetailTab> = new Set(['backup', 'pin', 'danger'])

const MODE_ICON: Record<TransportMode, typeof Plane> = {
  flight: Plane, car: Car, train: Train, bus: Bus,
}

const DT_LOCALE = 'ar-SA-u-ca-gregory-nu-latn'
const fmtDateTime = (iso: string): string => {
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

export default function TripDetailPanel({
  trip, viewerRole, isSaving, onSaveTripName, onSaveBankDetails, onSaveItinerary, onResetPin,
  onSaveTripStatus, onDeleteTrip, onRemoveMember, onSetMemberRole, onExportBackup,
  onCreateInvite, onRevokeInvite, showToast, onDeleted,
}: TripDetailPanelProps) {
  const TABS = useMemo(
    () => viewerRole === 'admin' ? ALL_TABS : ALL_TABS.filter(t => !ORGANIZER_HIDDEN_TABS.has(t.key)),
    [viewerRole],
  )
  const [activeTab, setActiveTab] = useState<DetailTab>('bank')

  // 🆕 لا نقرأ السجلّ إلا والتبويب مفتوح: القراءة مقصورة على المسؤول، والقائمة
  // لا تتغيّر إلا بفعله هو في هذه الشاشة نفسها — فلا داعي لجلبها مع كل رحلة يفتحها.
  const { members, error: membersError, refresh: refreshMembers } =
    useTripMembers(trip.id, activeTab === 'members')
  const [removingUid, setRemovingUid] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  // 🆕 رابط دعوة بنقرة واحدة — توكن هذه الجلسة فقط (لا قراءة من الخادم لمعرفة
  // رابط نشط سابق؛ العقد الوحيد المتاح هو create/revoke — انظر manageInvite في
  // functions/index.js). null يعني «لم نطلب رابطاً بعد في هذه الجلسة».
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [isPreparingInvite, setIsPreparingInvite] = useState(false)
  const [inviteMsgCopied, setInviteMsgCopied] = useState(false)

  const [nameForm, setNameForm] = useState(trip.name)
  const [bankForm, setBankForm] = useState<BankDetails>(trip.bankDetails)
  const [workingItinerary, setWorkingItinerary] = useState(trip.itinerary)
  const [draft, setDraft] = useState<SegmentDraft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  // تأكيد الحذف بكتابة المعرّف: الحذف نهائي ولا تراجع عنه، وضغطة زر واحدة
  // بالخطأ على رحلة خاطئة أسهل مما ينبغي في قائمة رحلات متشابهة الأسماء.
  const [deleteConfirm, setDeleteConfirm] = useState('')

  // القائمة حيّة (onSnapshot): إعادة تهيئة النماذج عند تبديل الرحلة المختارة
  // حتى لا تُعرض بيانات الرحلة السابقة في حقول الرحلة الجديدة.
  useEffect(() => {
    setNameForm(trip.name)
    setBankForm(trip.bankDetails)
    setWorkingItinerary(trip.itinerary)
    setDraft(null)
    setEditingId(null)
    setDraftError(null)
    setNewPin('')
    setPinError(null)
    setDeleteConfirm('')
    setActiveTab('bank')
    // 🆕 توكن الجلسة السابقة يخصّ رحلة أخرى — لا معنى لمشاركته هنا.
    setInviteToken(null)
    setInviteMsgCopied(false)
  }, [trip.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const bankDirty = useMemo(
    () => nameForm !== trip.name ||
      (['bankName', 'beneficiary', 'iban'] as const).some(k => bankForm[k] !== trip.bankDetails[k]),
    [nameForm, bankForm, trip]
  )

  const itineraryDirty = useMemo(
    () => JSON.stringify(workingItinerary) !== JSON.stringify(trip.itinerary),
    [workingItinerary, trip.itinerary]
  )

  const saveNameAndBank = async () => {
    if (nameForm !== trip.name) await onSaveTripName(trip.id, nameForm)
    await onSaveBankDetails(trip.id, bankForm)
  }

  const inviteUrl = tripUrl(trip.id)

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteUrl)
    setLinkCopied(true)
    window.setTimeout(() => setLinkCopied(false), 2000)
  }

  // 🆕 رابط الدخول المباشر (?invite=TOKEN) — يتجاوز رمز الرحلة كلياً لمن يفتحه.
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

  // تنزيل الـ QR كـ SVG: نُسلسِل العقدة المرسومة فعلاً بدل إعادة توليدها، فما
  // يُحفَظ هو نفسه ما رآه المسؤول على الشاشة حرفياً.
  const downloadQr = () => {
    const svg = document.getElementById(`qr-${trip.id}`)
    if (!svg) return
    const blob = new Blob(
      ['<?xml version="1.0" encoding="UTF-8"?>\n', new XMLSerializer().serializeToString(svg)],
      { type: 'image/svg+xml' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${trip.id}-qr.svg`
    a.click()
    URL.revokeObjectURL(url)
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

  const startAdd = () => { setEditingId(null); setDraftError(null); setDraft(emptySegmentDraft()) }
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

  const submitPin = async () => {
    if (newPin.trim().length < 4) {
      setPinError('رمز الرحلة يجب أن يكون 4 خانات على الأقل.')
      return
    }
    setPinError(null)
    const ok = await onResetPin(trip.id, newPin.trim())
    if (ok) setNewPin('')
  }

  const submitDelete = async () => {
    const ok = await onDeleteTrip(trip.id)
    if (ok) onDeleted()
  }

  // مؤشّر إرشادي فقط. المرجع الحقيقي هو فحص الخادم قبل الحذف مباشرةً: القائمة
  // هنا لا تعرف عدد المصاريف/المسافرين (لا تُقرأ في هذه الشاشة)، وحتى لو عرفت
  // لكانت لقطة قديمة قد يضيف عليها جهاز آخر بين العرض والضغط.
  const hasItinerary = trip.itinerary.length > 0

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(({ key, label, Icon }) => (
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

      {activeTab === 'bank' && (
        <form
          onSubmit={e => { e.preventDefault(); void saveNameAndBank() }}
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

          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600" /> تفاصيل الحساب البنكي
          </h3>
          <p className="text-xs text-slate-500 -mt-2">
            تظهر لكل أعضاء هذه الرحلة في بطاقة التحويل، ويمكنهم نسخها أو مشاركتها.
          </p>

          <div>
            <label className={labelClass} htmlFor="bank-name">اسم البنك</label>
            <input
              id="bank-name"
              type="text"
              value={bankForm.bankName}
              onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="bank-beneficiary">اسم المستفيد</label>
            <input
              id="bank-beneficiary"
              type="text"
              value={bankForm.beneficiary}
              onChange={e => setBankForm({ ...bankForm, beneficiary: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="bank-iban">رقم الآيبان (IBAN)</label>
            <input
              id="bank-iban"
              type="text"
              dir="ltr"
              value={bankForm.iban}
              onChange={e => setBankForm({ ...bankForm, iban: e.target.value })}
              placeholder="SA0000000000000000000000"
              className={`${inputClass} text-right tabular-nums`}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">تُحذف المسافات تلقائياً عند الحفظ.</p>
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
          </div>

          <hr className="border-slate-100" />

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isSaving || !bankDirty}
              className="flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ التغييرات
            </button>
            {bankDirty && (
              <button
                type="button"
                onClick={() => { setNameForm(trip.name); setBankForm(trip.bankDetails) }}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                تراجع
              </button>
            )}
          </div>
        </form>
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
                  onClick={() => void onSaveItinerary(trip.id, workingItinerary)}
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
                          <p className="text-sm font-bold text-slate-800 truncate">{segment.identifier}</p>
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
                          aria-label={`تعديل ${segment.identifier}`}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-500 hover:text-teal-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkingItinerary(prev => prev.filter(s => s.id !== segment.id))}
                          aria-label={`حذف ${segment.identifier}`}
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
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'members' && (
        <>
          {/* 🆕 دعوة بنقرة واحدة — رابط يمنح عضوية فورية بلا إدخال رمز الرحلة
              يدوياً. لا يستبدل الرمز (يبقى فعّالاً دائماً)؛ طريقة دخول إضافية. */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-teal-600" /> دعوة أعضاء — بنقرة واحدة
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              رابط يدخل به المدعوّ إلى الرحلة مباشرة بلا حاجة لرمز الرحلة. رابط واحد نشط فقط لكل
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

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Plus className="w-4 h-4 text-teal-600" /> أو شارك رمز الرحلة يدوياً
          </h3>

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="bg-white border border-slate-200 rounded-xl p-2 shrink-0">
              <QrCode value={inviteUrl} size={168} />
            </div>

            <div className="min-w-0 flex-1 w-full space-y-2.5">
              <p className="text-xs text-slate-600 leading-relaxed">
                امسح الرمز أو شارك الرابط، ثم أعطِ المدعوّ رمز الدخول.
              </p>

              <p
                dir="ltr"
                className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-600 break-all"
              >
                {inviteUrl}
              </p>

              {/* ⚠️ الرمز ليس داخل الـ QR، وليس ذلك نقصاً: الخادم لا يملكه أصلاً
                  (يُخزَّن مُجزَّأً ولا يُسترجع). ولإدراجه يلزم أن يكتبه المسؤول
                  هنا ثم يُدفن في صورة تُعاد مشاركتها — أي تحويل الرابط والرمز من
                  عاملين منفصلين إلى أثر واحد يُلتقط بصورة شاشة. الفصل مقصود. */}
              <p className="text-[11px] text-slate-400">
                الرابط وحده لا يكفي للدخول — رمز الرحلة يبقى منفصلاً عنه عمداً.
              </p>

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                >
                  {linkCopied ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {linkCopied ? 'نُسخ' : 'نسخ الرابط'}
                </button>
                <button
                  type="button"
                  onClick={downloadQr}
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> تنزيل الرمز
                </button>
              </div>
            </div>
          </div>

          {/* نسخة مخفية بمعرّف ثابت للتنزيل — العنصر المعروض داخل تخطيط مرن،
              وإسناد معرّف له يخلط العرض بالتصدير. */}
          <div className="hidden">
            <QrCode value={inviteUrl} size={512} id={`qr-${trip.id}`} />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-600" /> أعضاء الرحلة
              {members && <span className="text-xs font-normal text-slate-400">({members.length})</span>}
            </h3>
          </div>

          {/* ⚠️ التأخير يُقال هنا لا يُخفى: العضوية تُقرأ من التوكن وهو صالح ٦٠
              دقيقة، فالإزالة لا تُغلق الباب فوراً. مسؤول يظنّها فورية قد يعتمد
              عليها في حالة تسرّب — والصمت هنا أسوأ من القيد نفسه. */}
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
            <p className="font-bold">الإزالة قد تستغرق حتى ساعة لتصبح فعّالة.</p>
            <p>
              جلسة العضو صالحة ٦٠ دقيقة، والصلاحية تُقرأ منها. لقطع الوصول فوراً غيّر رمز
              الرحلة — لكن ذلك يُخرج كل الأعضاء ويطالبهم بالرمز الجديد.
            </p>
          </div>

          {membersError && (
            <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
              تعذّر جلب قائمة الأعضاء. القراءة متاحة للمسؤول أو منظّم الرحلة — جرّب تسجيل الخروج والدخول لتحديث صلاحيتك.
            </p>
          )}

          {!members && !membersError && (
            <div className="flex items-center justify-center gap-2 text-slate-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-bold">جارٍ جلب الأعضاء...</span>
            </div>
          )}

          {members?.length === 0 && (
            <EmptyState
              Icon={Users}
              title="لا أحد في السجلّ بعد"
              description="يُسجَّل العضو تلقائياً عند إدخاله رمز الرحلة. ومن انضمّ قبل إضافة السجلّ يظهر بعد تشغيل سكربت الترحيل."
            />
          )}

          {members && members.length > 0 && (
            <div className="space-y-2">
              {members.map(m => {
                const isConfirming = removingUid === m.uid
                return (
                  <div
                    key={m.uid}
                    className={`rounded-xl border p-3 transition-colors ${
                      isConfirming ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate flex items-center gap-1.5">
                          {m.displayName || m.email || 'عضو بجلسة مجهولة'}
                          {/* 🆕 المرحلة ٣ — شارة الدور تظهر للجميع (منظّم يقرأ السجلّ أيضاً)،
                              لكن زرّ تغييره أدناه للمسؤول العالمي وحده. */}
                          {m.role === 'organizer' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full shrink-0">
                              <ShieldCheck className="w-3 h-3" /> منظّم
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{m.uid}</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {/* غياب joinedAt يُعرض «غير معروف» لا 1970: السطور
                              المُرحَّلة لا تعرف التاريخ، ولا مكان يحفظه. */}
                          {m.joinedAt
                            ? `انضمّ: ${new Date(m.joinedAt).toLocaleDateString(DT_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : 'تاريخ الانضمام غير معروف (سطر مُرحَّل)'}
                          {m.mergedFrom && ' · نُقلت عضويته من جلسة سابقة'}
                        </p>
                      </div>

                      {!isConfirming && (
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

                    {isConfirming && (
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
            </div>
          )}
          </div>
        </>
      )}

      {activeTab === 'backup' && (
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
            لا يشمل رمز الدخول (PIN) — يبقى محظوراً على العميل دائماً تحت أي ظرف — ولا يعيد وصول
            الأعضاء عند استعادته لاحقاً، لأن العضوية تعيش في حساب كل عضو لا في هذا الملف.
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

      {activeTab === 'pin' && (
        <form
          onSubmit={e => { e.preventDefault(); void submitPin() }}
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-600" /> تغيير رمز الدخول
          </h3>

          <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1.5">
            <p className="font-bold">تغيير الرمز يُخرج كل الأعضاء الحاليين.</p>
            <p>
              سيُطلب من كل عضو إدخال الرمز الجديد مرة واحدة عند فتح الرحلة. لا تفعل هذا أثناء الرحلة
              إلا لسبب — مثل تسرّب الرمز لغير المشاركين.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="reset-pin">الرمز الجديد</label>
            <input
              id="reset-pin"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              placeholder="4 خانات فأكثر"
              dir="ltr"
              className={`${inputClass} text-right tabular-nums`}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              يُخزَّن مُجزَّأً (hash) على الخادم — لا يمكن استرجاعه لاحقاً، فاحفظه عند تعيينه.
            </p>
          </div>

          {pinError && (
            <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
              {pinError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving || !newPin.trim()}
            className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            تغيير الرمز
          </button>
        </form>
      )}

      {activeTab === 'danger' && (
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
              يُحذف مستند الرحلة ورمز دخولها معاً. الحذف متاح <span className="font-bold">للرحلات الفارغة فقط</span> —
              أي التي لا تحوي أي مسافر أو مصروف — حمايةً للسجلات المالية وسجلات الإيداع
              التي لا يمكن استرجاعها.
            </p>
            <p>بعد الحذف يصبح المعرّف <span dir="ltr" className="font-mono">{trip.id}</span> متاحاً لإنشاء رحلة جديدة به.</p>
          </div>

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
    </div>
  )
}
