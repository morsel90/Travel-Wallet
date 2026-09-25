// 🆕 مشاركة رابط دعوة بنقرة واحدة — مستخرجة من TripDetailPanel لأن الزرّ صار
// في موضعين: تبويب «المسافرون» في إدارة الرحلة، وقسم المسافرين في الشاشة
// الرئيسية نفسها. السبب: أول منظّم رحلة حقيقي أنشأ رحلته ولم يجد طريقة لإضافة
// أحد — الرابط كان مدفوناً ثلاث طبقات (اسم الرحلة ← «المزيد» ← «إدارة الرحلة»
// ← «المسافرون»)، والشاشة الرئيسية لا تعرض له شيئاً.
import { useState } from 'react'
import type { ToastMessage } from '../types'

interface UseShareInviteArgs {
  tripId: string
  tripName: string
  onCreateInvite: (tripId: string) => Promise<string | null>
  showToast: (msg: ToastMessage) => void
}

export function useShareInvite({ tripId, tripName, onCreateInvite, showToast }: UseShareInviteArgs) {
  // توكن هذه الجلسة فقط (لا قراءة من الخادم لمعرفة رابط نشط سابق؛ العقد الوحيد
  // المتاح هو create/revoke — انظر manageInvite في functions/index.js). يُحفظ
  // مع معرّف رحلته: توكن رحلة أخرى لا يُشارَك هنا، بلا useEffect لتصفيره.
  const [saved, setSaved] = useState<{ tripId: string; token: string } | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [copied, setCopied] = useState(false)
  const token = saved?.tripId === tripId ? saved.token : null

  const message = (t: string) =>
    `أهلاً! أدعوك للانضمام إلى رحلتنا ✈️ ${tripName}. انقر على الرابط التالي للدخول مباشرة: ` +
    `${window.location.origin}${window.location.pathname}?invite=${t}`

  // Web Share API إن دعمها الجهاز، وإلا نسخ الرسالة كاملة للحافظة. ⚠️ لا await
  // قبل navigator.share() إن كان لدينا توكن مسبقاً: بعض المتصفحات (Safari
  // تحديداً) ترفض share() بعد فجوة زمنية طويلة منذ ضغطة المستخدم — لذا الزر
  // يبقى معطّلاً (isPreparing) حتى يجهز التوكن.
  const share = async () => {
    let t = token
    if (!t) {
      setIsPreparing(true)
      t = await onCreateInvite(tripId)
      setIsPreparing(false)
      if (!t) return // توست الخطأ عُرض بالفعل من onCreateInvite
      setSaved({ tripId, token: t })
    }

    if (navigator.share) {
      try {
        await navigator.share({ text: message(t) })
      } catch {
        // المستخدم ألغى صفحة المشاركة، أو فشلت لسبب لا يستحق تنبيهاً
      }
      return
    }

    try {
      await navigator.clipboard.writeText(message(t))
      setCopied(true)
      showToast({ text: 'نُسخت رسالة الدعوة — الصقها لمن تريد دعوته.', type: 'success' })
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // نادر: تعذّر الوصول للحافظة (صلاحيات المتصفح)
    }
  }

  /** بعد إبطال الرابط خادمياً — المشاركة التالية تطلب توكناً جديداً. */
  const forget = () => setSaved(null)

  return { share, isPreparing, copied, forget }
}
