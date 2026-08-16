// 🆕 واجهة إدارة الرحلات — شاشة كاملة على نمط ReportsView، للمسؤول فقط.
// تستبدل السكربتات اليدوية: create-trip.mjs (إنشاء رحلة/رمز)، add-flights.mjs
// (المسار)، list-trips.mjs (عرض الرحلات).
//
// شاشتان: قائمة كل الرحلات، وتفاصيل رحلة مختارة. المسؤول يعدّل أي رحلة من
// مكانه — قواعد Firestore تشترط isAdmin() ولا تشير للرحلة النشطة إطلاقاً.
//
// ⚠️ «فتح الرحلة» يعيد تحميل الصفحة على ‎?trip=X، لأن TRIP_ID يُحسب مرة واحدة
// عند تحميل الوحدة (انظر utils/tripId.ts). لا حاجة لفتحها لمجرد التعديل؛
// الفتح فقط لرؤية مصاريف تلك الرحلة وأعضائها.
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  X, Settings, Plus, ArrowRight, ExternalLink, Luggage, Route, Loader2, AlertTriangle,
} from '../../icons'
import TripDetailPanel from './TripDetailPanel'
import NewTripForm from './NewTripForm'
import EmptyState from '../EmptyState'
import { tripUrl } from '../../utils/tripId'
import type { TripSummary } from '../../hooks/useAllTrips'
import type { BankDetails, TripStatus } from '../../types'

interface TripAdminViewProps {
  currentTripId: string
  trips: TripSummary[]
  loading: boolean
  error: string | null
  isSaving: boolean
  onSaveTripName: (tripId: string, name: string) => Promise<boolean>
  onSaveBankDetails: (tripId: string, details: BankDetails) => Promise<boolean>
  onSaveItinerary: (tripId: string, itinerary: TripSummary['itinerary']) => Promise<boolean>
  onCreateTrip: (tripId: string, name: string, pin: string) => Promise<boolean>
  onResetPin: (tripId: string, pin: string) => Promise<boolean>
  onSaveTripStatus: (tripId: string, status: TripStatus) => Promise<boolean>
  onDeleteTrip: (tripId: string) => Promise<boolean>
  /** 🆕 إزالة عضو من الرحلة — تمرّ إلى TripDetailPanel كما هي. */
  onRemoveMember: (tripId: string, uid: string) => Promise<boolean>
  /** 🆕 تنزيل نسخة JSON احتياطية — docs/PLAN-backup-recovery.md المرحلة ١. */
  onExportBackup: (trip: TripSummary) => Promise<boolean>
  onClose: () => void
}

export default function TripAdminView({
  currentTripId, trips, loading, error, isSaving,
  onSaveTripName, onSaveBankDetails, onSaveItinerary, onCreateTrip, onResetPin,
  onSaveTripStatus, onDeleteTrip, onRemoveMember, onExportBackup, onClose,
}: TripAdminViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // نقرأ الرحلة المختارة من القائمة الحيّة في كل رسم — لا نسخة محلية، حتى
  // ينعكس أي تعديل محفوظ فوراً بدل بقاء اللوحة على بيانات قديمة.
  const selected = selectedId ? trips.find(t => t.id === selectedId) ?? null : null

  return (
    <motion.div
      className="fixed inset-0 z-[9998] bg-slate-50 overflow-y-auto"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <header className="sticky top-0 z-10 bg-teal-700 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {selected ? (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="رجوع لقائمة الرحلات"
                className="p-2 -mr-2 rounded-xl hover:bg-teal-800/60 text-teal-50 transition-colors shrink-0"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <Settings className="w-6 h-6 text-teal-100 shrink-0" />
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-lg truncate">
                {selected ? selected.name : 'إدارة الرحلات'}
              </h1>
              <p className="text-[11px] text-teal-100 truncate" dir="ltr">
                {selected ? selected.id : `${trips.length} رحلة`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق إدارة الرحلات"
            className="p-2 rounded-xl bg-teal-800/60 hover:bg-teal-800 text-teal-50 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5 pb-24">
        {error && (
          <div className="bg-rose-100 text-rose-800 p-4 rounded-xl text-sm border border-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 text-slate-500 py-12">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-bold">جارٍ تحميل الرحلات...</span>
          </div>
        )}

        {!loading && selected && (
          <TripDetailPanel
            trip={selected}
            isSaving={isSaving}
            onSaveTripName={onSaveTripName}
            onSaveBankDetails={onSaveBankDetails}
            onSaveItinerary={onSaveItinerary}
            onResetPin={onResetPin}
            onSaveTripStatus={onSaveTripStatus}
            onDeleteTrip={onDeleteTrip}
            onRemoveMember={onRemoveMember}
            onExportBackup={onExportBackup}
            // الرحلة لم تعد موجودة — نعود للقائمة بدل إبقاء لوحة تشير لمستند محذوف
            onDeleted={() => setSelectedId(null)}
          />
        )}

        {!loading && !selected && (
          <>
            {!isCreating && (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full border-2 border-dashed border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 rounded-2xl p-4 flex items-center justify-center gap-3 text-slate-500 hover:text-teal-600 transition-all bg-white/40 group min-h-[68px]"
              >
                <span className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-teal-100 flex items-center justify-center text-slate-600 group-hover:text-teal-700 transition-colors shrink-0 shadow-sm">
                  <Plus className="w-4 h-4" />
                </span>
                <span className="text-sm font-bold">إنشاء رحلة جديدة</span>
              </button>
            )}

            {isCreating && (
              <NewTripForm
                existingIds={trips.map(t => t.id)}
                isSaving={isSaving}
                onCreate={onCreateTrip}
                onCancel={() => setIsCreating(false)}
              />
            )}

            {trips.length === 0 && !isCreating ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <EmptyState
                  Icon={Luggage}
                  title="لا توجد رحلات بعد"
                  description="أنشئ أول رحلة وشارك رابطها ورمزها مع المسافرين معك."
                  actionLabel="إنشاء رحلة"
                  onAction={() => setIsCreating(true)}
                  ActionIcon={Plus}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {trips.map(trip => {
                  const isCurrent = trip.id === currentTripId
                  return (
                    <div
                      key={trip.id}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(trip.id)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-right group"
                      >
                        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-teal-100 text-teal-700 shrink-0">
                          <Luggage className="w-5 h-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-slate-800 truncate group-hover:text-teal-700 transition-colors">
                              {trip.name}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full shrink-0">
                                مفتوحة الآن
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span dir="ltr" className="truncate">{trip.id}</span>
                            {trip.itinerary.length > 0 && (
                              <span className="flex items-center gap-1 shrink-0">
                                <Route className="w-3 h-3" /> {trip.itinerary.length}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedId(trip.id)}
                          className="text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                        >
                          تعديل
                        </button>
                        {!isCurrent && (
                          <a
                            href={tripUrl(trip.id)}
                            className="flex items-center gap-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> فتح
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </motion.div>
  )
}
