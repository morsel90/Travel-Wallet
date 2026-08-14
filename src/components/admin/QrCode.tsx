// 🆕 رمز QR للرابط — مكوّن عرض بحت بلا أي حالة.
//
// ── لماذا اعتمادية هنا بينما الرسوم البيانية وXLSX مكتوبة يدوياً؟ ──────────────
// القاعدتان ١ و٢ ليستا منعاً عاماً للاعتماديات: recharts رُفض لأن الأشرطة
// HTML/CSS تؤدي الغرض، وSheetJS رُفض لأن OOXML لحاجتنا الضيقة صفحةُ كود. أما
// ترميز QR فخوارزمية حقيقية — تصحيح أخطاء Reed–Solomon على GF(256)، واختيار
// الإصدار والسعة، وأقنعة التعمية. وكتابتها يدوياً ممكنة لكن **صحتها لا تُثبت
// إلا بماسح ضوئي**: رمزٌ خاطئ بوحدة واحدة يبدو سليماً تماماً ولا يُقرأ. وهذا
// بعينه ما تحذّر منه القاعدة ١٨ (تحقّق من الحالة السالبة). فالاعتمادية هنا
// تشتري تحققاً لا نملكه، لا سطوراً نكسل عنها.
//
// ── لماذا path واحد لا 1089 مستطيلاً ──────────────────────────────────────────
// رابط رحلة نموذجي يعطي شبكة 33×33. رسم كل وحدة كـ <rect> يعني أكثر من ألف عقدة
// DOM لصورة ثابتة. نبني بدلها مساراً واحداً بأمر M/h/v لكل وحدة داكنة.
//
// ── الترميز ──────────────────────────────────────────────────────────────────
// ندخل بايتات ASCII مباشرة (stringToBytes الافتراضية Latin-1). وهذا كافٍ **دائماً**
// هنا لا مصادفةً: TRIP_ID_PATTERN في functions/index.js يحصر معرّف الرحلة في
// [a-zA-Z0-9_-]، والنطاق ASCII. فلا حاجة لنسخة qrcode_UTF8.
import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

interface QrCodeProps {
  /** النص المُرمَّز — رابط الرحلة هنا. */
  value: string
  /** طول الضلع بالبكسل (العرض = الارتفاع). */
  size?: number
  /** هامش هادئ بوحدات QR. المواصفة توصي بأربع، وأقلّ منها يُفشل بعض الماسحات. */
  margin?: number
  className?: string
  /** لالتقاط العقدة عند التصدير — انظر downloadQr في TripDetailPanel. */
  id?: string
}

export default function QrCode({ value, size = 200, margin = 4, className, id }: QrCodeProps) {
  const { path, extent } = useMemo(() => {
    // 0 = اختيار الإصدار تلقائياً بحسب الطول؛ 'M' تصحيح متوسط (~15%) وهو
    // الافتراضي المناسب لرمز يُعرض على شاشة أو يُطبع بحجم صغير.
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()

    const count = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col + margin},${row + margin}h1v1h-1z`
      }
    }
    return { path: d, extent: count + margin * 2 }
  }, [value, margin])

  return (
    <svg
      id={id}
      xmlns="http://www.w3.org/2000/svg"
      // ⚠️ viewBox بوحدات QR لا بالبكسل: الرسم يبقى حادّاً عند أي حجم عرض أو
      // طباعة، وهو سبب اختيار SVG على canvas أصلاً.
      viewBox={`0 0 ${extent} ${extent}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`رمز QR لرابط الرحلة: ${value}`}
      className={className}
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <path d={path} fill="#0f172a" />
    </svg>
  )
}
