import { useState, useEffect, useCallback } from 'react'
import { onSnapshot, setDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { userProfileDoc } from '../firestore'
import type { BankDetails, UserProfile } from '../types'

// ─── useUserProfile ─────────────────────────────────────────────────────────
// 🆕 بروفايل المستخدم العام (users/{uid}) — مستقل عن أي رحلة، وهو **المصدر
// الوحيد** لبيانات بنك المستخدم؛ أي رحلة ينظّمها تقرأ منه حيّاً (انظر
// useOrganizerBankDetails وdocs/DECISIONS.md). قراءة وكتابة في نفس الملف عمداً
// بخلاف useTripConfig/useTripAdminActions المنفصلين: هذا مستند صغير مستقل
// الاستهلاك (شاشة بروفايل واحدة فقط)، فلا يبرر فصلاً كالذي تحتاجه إعدادات
// الرحلة متعددة المستهلكين.

const EMPTY_BANK_DETAILS: BankDetails = { bankName: '', beneficiary: '', iban: '' }
const FALLBACK_PROFILE: UserProfile = { displayName: '', bankDetails: EMPTY_BANK_DETAILS }

export function useUserProfile(user: User | null) {
  const [profile, setProfile] = useState<UserProfile>(FALLBACK_PROFILE)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!user) {
      setProfile(FALLBACK_PROFILE)
      return
    }

    const unsub = onSnapshot(
      userProfileDoc(user.uid),
      snap => {
        if (!snap.exists()) {
          setProfile(FALLBACK_PROFILE)
          return
        }

        const data = snap.data() as {
          displayName?: unknown
          bankDetails?: Partial<BankDetails>
          lastTripCreatedAt?: unknown
        }

        setProfile({
          displayName: typeof data.displayName === 'string' ? data.displayName : '',
          bankDetails: {
            bankName:    data.bankDetails?.bankName    ?? EMPTY_BANK_DETAILS.bankName,
            beneficiary: data.bankDetails?.beneficiary ?? EMPTY_BANK_DETAILS.beneficiary,
            iban:        data.bankDetails?.iban        ?? EMPTY_BANK_DETAILS.iban,
          },
          lastTripCreatedAt: typeof data.lastTripCreatedAt === 'number' ? data.lastTripCreatedAt : undefined,
        })
      },
      err => {
        console.error('تعذّرت قراءة بروفايل المستخدم، سيُستخدم الافتراضي:', err)
        setProfile(FALLBACK_PROFILE)
      }
    )

    return unsub
  }, [user])

  // merge: true — انظر تعليق isValidUserProfile في firestore.rules: الحفظ من
  // هذه الشاشة لا يلمس lastTripCreatedAt (خادمي حصراً) فيبقى كما هو بعد الدمج.
  const saveProfile = useCallback(async (patch: { displayName: string; bankDetails: BankDetails }) => {
    if (!user) return
    setIsSaving(true)
    try {
      await setDoc(userProfileDoc(user.uid), patch, { merge: true })
    } finally {
      setIsSaving(false)
    }
  }, [user])

  return { profile, isSaving, saveProfile }
}
