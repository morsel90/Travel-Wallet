// نقطة استيراد موحّدة للـ hooks
export { useAuth }             from './useAuth'
export { useAdminAuth }        from './useAdminAuth' // 🆕 حالة/منطق مصادقة المسؤول — استُخرج من App.tsx (يعرضه مكوّن AuthFlow)
export { useModals }           from './useModals'    // 🆕 حالة المودالات موحّدة في reducer واحد — استُخرجت من App.tsx
export { useExchangeRates }    from './useExchangeRates'
export { useExpenses }         from './useExpenses'
export { useTravelers }        from './useTravelers'
export { useBalances }         from './useBalances'
export { useFilteredExpenses } from './useFilteredExpenses' // ★ تمت إضافة هذا السطر
export { useDebounce }         from './useDebounce' // 🆕 أداة عامة لتأخير أي قيمة متغيّرة بسرعة (بحث، فلاتر...)
export { useOnlineStatus }     from './useOnlineStatus' // 🆕 حالة اتصال الشبكة (online/offline) — لبانر التنبيه العام
export { useCountdown }        from './useCountdown' // 🆕 عدّ تنازلي عام بالثواني (مثال: مهلة إعادة إرسال رابط استرداد كلمة المرور)
export { useExpenseActions }   from './useExpenseActions' // 🆕 منطق نموذج/عمليات المصروف كاملاً — استُخرج من App.tsx لتقليل حجمه
export { useTravelerActions }  from './useTravelerActions' // 🆕 منطق نموذج/عمليات المسافر كاملاً — استُخرج من App.tsx
export { useDepositActions }   from './useDepositActions'  // 🆕 منطق نموذج/عمليات الإيداع كاملاً — استُخرج من App.tsx
export { useTripConfig }       from './useTripConfig' // 🆕 إعدادات الرحلة النشطة (اسمها/منظّمها/مسارها) من Firestore — لدعم رحلات متعددة
export { useOrganizerBankDetails } from './useOrganizerBankDetails' // 🆕 قراءة حيّة لبيانات بنك منظّم الرحلة — المصدر الوحيد لعرضها
export { useTripAdminActions } from './useTripAdminActions' // 🆕 كتابة إعدادات أي رحلة (الاسم/المسار/الحالة) من واجهة الإدارة
export { useAllTrips }         from './useAllTrips' // 🆕 قائمة كل الرحلات — استعلام يرضيه isAdmin() وحده
export { useMyTrips }          from './useMyTrips'  // 🆕 رحلات المستخدم المنضم لها (شاشة «رحلاتي») — قراءة مستند كل رحلة على حدة
export { useTripMembers }      from './useTripMembers' // 🆕 أعضاء رحلة بعينها من السجلّ — للمسؤول وحده (الـ claims لا تُستعلَم)
export { useMyTripRole }       from './useMyTripRole'  // 🆕 «هل أنا منظّم هذه الرحلة؟» (المرحلة ٣) — قراءة ذاتية واحدة
export { useHeaderCollapse }   from './useHeaderCollapse' // 🆕 تتبّع اتجاه التمرير لتقليص/توسيع الهيدر (Sticky + Collapsible)
export { useInviteJoin }       from './useInviteJoin' // 🆕 انضمام فوري عبر رابط دعوة (?invite=TOKEN) — بديل بوابة الرمز اليدوية
export { useUserProfile }      from './useUserProfile' // 🆕 بروفايل المستخدم العام (اسم/بنك) — لتعبئة نموذج إنشاء رحلة تلقائياً
export { useSyncTravelerNameFromProfile } from './useSyncTravelerNameFromProfile' // 🆕 يزامن اسم مسافري مع بروفايلي بلا أي واجهة جديدة