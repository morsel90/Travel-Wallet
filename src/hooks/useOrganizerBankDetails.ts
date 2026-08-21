import { useState, useEffect } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { userProfileDoc } from '../firestore'
import type { BankDetails } from '../types'

// ─── useOrganizerBankDetails ────────────────────────────────────────────────
// 🆕 قراءة حيّة، للعرض فقط، لبيانات بنك منظّم الرحلة الحالية — من
// users/{organizerUid} مباشرة. هذا هو المصدر الوحيد لبيانات البنك المعروضة
// داخل الرحلة (BankDetailsCard في Misc.tsx)؛ لا نسخة على مستند الرحلة نفسها.
// انظر docs/DECISIONS.md.
//
// ⚠️ بلا دالة كتابة عمداً — بخلاف useUserProfile المخصّصة لصاحب الحساب نفسه،
// هذا الخطاف يقرأ ملف *شخص آخر* (المنظّم)، وlا كتابة عليه تُتاح إلا لصاحبه —
// انظر firestore.rules: allow write شرطه request.auth.uid == userId حصراً.
//
// organizerUid قد يكون undefined (رحلة قديمة بلا منظّم معروف، انظر
// docs/DECISIONS.md) — عندها لا اشتراك أصلاً، وbankDetails تبقى null فوراً.

interface OrganizerBankDetailsResult {
  bankDetails: BankDetails | null
  displayName: string | null
  loading: boolean
}

const EMPTY_RESULT: OrganizerBankDetailsResult = { bankDetails: null, displayName: null, loading: false }

export function useOrganizerBankDetails(organizerUid: string | undefined): OrganizerBankDetailsResult {
  const [result, setResult] = useState<OrganizerBankDetailsResult>(EMPTY_RESULT)

  useEffect(() => {
    if (!organizerUid) {
      setResult(EMPTY_RESULT)
      return
    }

    setResult({ bankDetails: null, displayName: null, loading: true })

    const unsub = onSnapshot(
      userProfileDoc(organizerUid),
      snap => {
        if (!snap.exists()) {
          setResult({ bankDetails: null, displayName: null, loading: false })
          return
        }

        const data = snap.data() as { displayName?: unknown; bankDetails?: Partial<BankDetails> }
        const bankName    = data.bankDetails?.bankName?.trim()    ?? ''
        const beneficiary = data.bankDetails?.beneficiary?.trim() ?? ''
        const iban         = data.bankDetails?.iban?.trim()        ?? ''
        // بروفايل موجود لكن بلا أي حقل بنك مُعبَّأ فعلياً — نفس معنى "لا بيانات".
        const hasBankDetails = !!(bankName || beneficiary || iban)

        setResult({
          bankDetails: hasBankDetails ? { bankName, beneficiary, iban } : null,
          displayName: typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : null,
          loading: false,
        })
      },
      err => {
        console.error('تعذّرت قراءة بيانات بنك المنظّم:', err)
        setResult({ bankDetails: null, displayName: null, loading: false })
      }
    )

    return unsub
  }, [organizerUid])

  return result
}
