// ─── عقود الدوال السحابية ─────────────────────────────────────────────────────
//
// 🆕 كل دالة في functions/index.js يستدعيها العميل، بطلبها وردّها، في ملف واحد
// يقابل ذلك الملف. كانت موزّعة على خمسة خطافات — وعقد updateMyTravelerName
// مكرّراً حرفياً في اثنين منها، فتعديله في أحدهما يترك الآخر يَعِد بشكل قديم.
//
// ⚠️ هذه **وعود لا ضمانات**: الخادم لا يقرأ هذا الملف. من يغيّر ما تقرؤه أو
// تُعيده دالة في functions/index.js يغيّره هنا في نفس الـ PR.
//
// `callable(name)` هي الطريق الوحيد للاستدعاء: الاسم مقيّد بمفاتيح
// CallableContracts، فالطلب والردّ يُستنتجان منه. قبلها كان الاسم نصّاً حرّاً
// والنوعان يُكتبان يدوياً بجانبه — لا شيء يمنع اسماً بخطأ إملائي ولا زوجَ
// أنواع لا يخصّ هذه الدالة.
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import type { DepositMode, PeriodKey, RolloverResult } from '../types'

// ── إدارة الرحلات (useTripAdminActions) ─────────────────────────────────────

export interface ManageTripRequest {
  mode: 'create' | 'delete'
  tripId: string
  name: string
}
export interface ManageTripResponse { success: boolean; tripId: string }

// 🆕 'remove' (المسؤول أو منظّم الرحلة) و'setRole' (المسؤول العالمي حصراً —
// المرحلة ٣، انظر functions/index.js)
export type ManageMemberRequest =
  | { mode: 'remove'; tripId: string; uid: string }
  | { mode: 'setRole'; tripId: string; uid: string; role: 'organizer' | 'member' }
export interface ManageMemberResponse {
  success: boolean
  uid: string
  tripId: string
  /** false إن لم يكن عضواً في الـ claims أصلاً — نُظِّف سطر السجلّ فقط. (mode: 'remove' فقط) */
  claimRemoved?: boolean
  /** true إن كان المستهدَف مسؤولاً: صلاحيته عالمية ولا تمرّ بعضوية الرحلة. (mode: 'remove' فقط) */
  stillHasAccess?: boolean
}

// 🆕 'create' (يحذف أي رابط سابق لنفس الرحلة وينشئ توكناً جديداً) و'revoke'
// (يحذف الرابط النشط بلا استبدال). كلاهما للمسؤول أو منظّم *هذه* الرحلة؛ الفحص
// الحقيقي خادمي بالكامل في manageInvite.
export interface ManageInviteRequest { mode: 'create' | 'revoke'; tripId: string }
export interface ManageInviteResponse { success: boolean; token?: string }

// 🆕 نموذج الهوية الهجين. الفحص الحقيقي (المسافر غير مربوط بالفعل، والحساب
// المستهدَف غير مربوط بمسافر آخر) خادمي بالكامل.
export interface LinkTravelerAccountRequest { tripId: string; travelerId: number; targetUid: string }
export interface LinkTravelerAccountResponse { success: boolean; tripId: string; travelerId: number; targetUid: string }

// 🆕 docs/PLAN-backup-recovery.md المرحلة ٢. backup: unknown عمداً — الشكل
// الحقيقي (TripBackup) يُتحقَّق منه خادمياً بالكامل (Admin SDK يتجاوز القواعد)،
// فلا قيمة في تضييق النوع هنا فقط ليُخدَع لاحقاً بملف عُدِّل يدوياً بشكل يطابق
// TripBackup ظاهرياً لكنه فاسد فعلياً.
export interface RestoreTripRequest { tripId: string; backup: unknown }
export interface RestoreTripResponse {
  success: boolean
  tripId: string
  restored: { travelers: number; expenses: number; depositLogs: number }
}

// ── الانضمام والاسم (useInviteJoin، useSyncTravelerNameFromProfile) ─────────

export interface JoinViaInviteRequest { inviteToken: string }
export interface JoinViaInviteResponse {
  success: boolean
  tripId: string
  // 🆕 صحيحة فقط حين زوّدت joinViaInvite ملف مسافر جديداً بلا اسم عرض حقيقي —
  // انظر تعليقها في functions/index.js. اختيارية للتوافق مع نشر خادمي أقدم
  // (لا يرسلها بعد) — غيابها يُعامَل كـ false، أي لا نموذج اسم.
  needsName?: boolean
}

export interface UpdateMyTravelerNameRequest { tripId: string; name: string }
export interface UpdateMyTravelerNameResponse { success: boolean }

// ── الدفتر (useSettlementActions، useLongTermActions) ───────────────────────

/** يطابق ما تقرأه recordSettlement في functions/index.js حرفاً بحرف. */
export interface RecordSettlementRequest {
  tripId: string
  fromId: number
  toId: number
  amount: number
}
export interface RecordSettlementResponse {
  success: boolean
  tripId: string
  fromId: number
  toId: number
  /** المبلغ كما سجّله الخادم بعد التقريب — لا كما أرسله العميل. */
  amount: number
}

/** 🆕 يطابق ما تقرأه recordDeposit في functions/index.js — مسار المنظّم للمودَع. */
export interface RecordDepositRequest {
  tripId: string
  travelerId: number
  mode: DepositMode
  amount: number
  reason: string | null
}
export interface RecordDepositResponse {
  success: boolean
  tripId: string
  travelerId: number
  previousDeposited: number
  newDeposited: number
}

export interface CloseMonthRequest { tripId: string; period: PeriodKey }

export interface ExitTravelerRequest { tripId: string; travelerId: number; settle: boolean }
export interface ExitTravelerResponse {
  success: boolean
  tripId: string
  travelerId: number
  /** المبلغ الذي سُوّي فعلاً (صفر إن كان الحساب مسوّى أصلاً). */
  settledAmount: number
  direction: 'credit' | 'debt' | 'settled'
}

// ── السجلّ ───────────────────────────────────────────────────────────────────

/** اسم كل دالة → [طلبها، ردّها]. المفاتيح هي أسماء التصدير في functions/index.js. */
export interface CallableContracts {
  manageTrip: [ManageTripRequest, ManageTripResponse]
  manageMember: [ManageMemberRequest, ManageMemberResponse]
  manageInvite: [ManageInviteRequest, ManageInviteResponse]
  linkTravelerAccount: [LinkTravelerAccountRequest, LinkTravelerAccountResponse]
  restoreTrip: [RestoreTripRequest, RestoreTripResponse]
  joinViaInvite: [JoinViaInviteRequest, JoinViaInviteResponse]
  updateMyTravelerName: [UpdateMyTravelerNameRequest, UpdateMyTravelerNameResponse]
  recordSettlement: [RecordSettlementRequest, RecordSettlementResponse]
  recordDeposit: [RecordDepositRequest, RecordDepositResponse]
  closeMonth: [CloseMonthRequest, RolloverResult]
  exitTraveler: [ExitTravelerRequest, ExitTravelerResponse]
}

export type CallableName = keyof CallableContracts
export type CallableRequest<N extends CallableName> = CallableContracts[N][0]
export type CallableResponse<N extends CallableName> = CallableContracts[N][1]

/** دالة سحابية جاهزة للاستدعاء، بطلبها وردّها من السجلّ أعلاه. */
export function callable<N extends CallableName>(name: N) {
  return httpsCallable<CallableRequest<N>, CallableResponse<N>>(functions, name)
}
