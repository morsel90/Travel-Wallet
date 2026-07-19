import { useState, useEffect, useMemo } from 'react'
import { FALLBACK_RATES, CURRENCY_LABELS, buildCurrencyMap } from '../constants'
import type { CurrencyMap } from '../types'

// ─── useExchangeRates ─────────────────────────────────────────────────────────
// يجلب أسعار الصرف الحية مقابل الريال عند التحميل، ويبني خريطة العملات (CURRENCIES).
// عند تعذّر الجلب تبقى FALLBACK_RATES مستخدمة. CURRENCIES يُعاد حسابه عند تغيّر rates.
export interface UseExchangeRates {
  rates: Record<string, number>
  ratesUpdatedAt: Date | null
  CURRENCIES: CurrencyMap
}

export function useExchangeRates(): UseExchangeRates {
  const [rates,          setRates]          = useState<Record<string, number>>(FALLBACK_RATES)
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('https://open.er-api.com/v6/latest/SAR')
      .then(r => r.json())
      .then((data: { result: string; rates: Record<string, number> }) => {
        if (cancelled || data?.result !== 'success') return
        // 🆕 نبني السعر لكل عملة معرّفة في CURRENCY_LABELS (~160) لا للاحتياطية
        // فقط — حتى تظهر القائمة الكاملة بعد وصول الأسعار الحية. أي عملة لا
        // يوفّرها المزوّد تُتجاهل هنا وتبقى مستبعَدة من الخريطة (buildCurrencyMap).
        const updated: Record<string, number> = { SAR: 1 }
        Object.keys(CURRENCY_LABELS).forEach(code => {
          if (code === 'SAR') return
          const perSAR = data.rates[code]
          if (perSAR) updated[code] = +(1 / perSAR).toFixed(4)
        })
        setRates(prev => ({ ...prev, ...updated }))
        setRatesUpdatedAt(new Date())
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const CURRENCIES = useMemo(() => buildCurrencyMap(rates), [rates])

  return { rates, ratesUpdatedAt, CURRENCIES }
}
