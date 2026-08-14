// ⚠️ ما يمكن اختباره هنا وما لا يمكن — اقرأ قبل الإضافة.
//
// لا يوجد ماسح ضوئي في بيئة الاختبار، فلا سبيل لإثبات أن الرمز **يُقرأ** فعلاً؛
// الحكم النهائي على ذلك لمسحة بجوّال. ما تثبته هذه الاختبارات هو الخصائص
// البنيوية التي إن انكسرت صار الرمز غير قابل للقراءة قطعاً — وهي بالضبط ما
// ينكسر عند العبث بالمكوّن (تغيير الهامش، أو الألوان، أو حجم الوحدة).
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import QrCode from './QrCode'

const svgOf = (value: string, props: Record<string, unknown> = {}) => {
  const { container } = render(<QrCode value={value} {...props} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('لم يُرسم أي svg')
  return svg
}

describe('QrCode — البنية', () => {
  it('يرسم مساراً واحداً لا آلاف المستطيلات', () => {
    const svg = svgOf('https://example.com/?trip=abc')
    expect(svg.querySelectorAll('path')).toHaveLength(1)
    expect(svg.querySelectorAll('rect')).toHaveLength(1) // الخلفية البيضاء فقط
    expect(svg.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(100)
  })

  // ⚠️ الهامش الهادئ ليس تجميلاً: المواصفة توصي بأربع وحدات، وبدونه تفشل ماسحات
  // كثيرة في تحديد حدود الرمز. viewBox = عدد الوحدات + ضعف الهامش.
  it('يترك الهامش الهادئ حول الشبكة', () => {
    const withMargin = svgOf('x', { margin: 4 }).getAttribute('viewBox')
    const without = svgOf('x', { margin: 0 }).getAttribute('viewBox')
    const side = (vb: string | null) => Number(vb?.split(' ')[2])
    expect(side(withMargin) - side(without)).toBe(8)
  })

  it('يكبر الرمز مع طول النص — اختيار الإصدار تلقائي', () => {
    const side = (v: string) => Number(svgOf(v).getAttribute('viewBox')?.split(' ')[2])
    expect(side('a'.repeat(200))).toBeGreaterThan(side('a'))
  })

  // التباين شرط للقراءة: خلفية فاتحة ووحدات داكنة. عكسهما أو تقاربهما يُنتج
  // رمزاً يبدو سليماً ولا يُمسح.
  it('يحافظ على تباين الخلفية والوحدات', () => {
    const svg = svgOf('https://example.com')
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#ffffff')
    expect(svg.querySelector('path')?.getAttribute('fill')).toBe('#0f172a')
  })

  it('يحمل xmlns ليبقى صالحاً بعد التصدير كملف مستقل', () => {
    // بدونه ملف الـ SVG المنزَّل لا يُفتح كصورة خارج المتصفح.
    expect(svgOf('x').getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
  })

  it('يصف نفسه لقارئ الشاشة بالرابط الذي يحمله', () => {
    const svg = svgOf('https://example.com/?trip=abc')
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toContain('https://example.com/?trip=abc')
  })
})
