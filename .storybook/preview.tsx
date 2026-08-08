import type { Preview, Decorator } from '@storybook/react-vite'

// 🆕 أساسيات التطبيق المفقودة في Storybook افتراضياً:
//
// 1. Tailwind — بدون استيراد index.css تُعرض كل المكوّنات بلا أي تنسيق (فئات
//    Tailwind مجرد أسماء بلا قواعد)، فتبدو مكسورة ويُظن أن العطل في المكوّن.
//    الملف يحوي أيضاً تعريف animate-fadeIn وإصلاحات Safari وأنماط الطباعة.
//
// 2. الاتجاه — index.html يضع dir="rtl" lang="ar" على <html>، وStorybook يعرض
//    داخل iframe مستقل لا يرث ذلك. بدونه ينقلب كل تخطيط أفقي (البطاقات،
//    الأشرطة، أماكن الأيقونات) ويصبح ما تراه في القصة مختلفاً عمّا يراه المستخدم.
import '../src/index.css'

// الخلفية الافتراضية تطابق خلفية التطبيق (bg-slate-50) — على أبيض ناصع تختفي
// حدود البطاقات البيضاء وظلالها الخفيفة، فيبدو التصميم مسطّحاً بلا سبب.
const withRtl: Decorator = Story => (
  <div dir="rtl" lang="ar" className="bg-slate-50 p-4 min-h-[120px]">
    <Story />
  </div>
)

const preview: Preview = {
  decorators: [withRtl],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      options: {
        app:   { name: 'خلفية التطبيق', value: '#f8fafc' }, // slate-50
        white: { name: 'أبيض', value: '#ffffff' },
        dark:  { name: 'داكن', value: '#0f172a' },
      },
    },
    // أحجام تقارب الاستخدام الفعلي: التطبيق يُستعمل على الجوال أساساً أثناء السفر
    viewport: {
      options: {
        mobile:  { name: 'جوال',  styles: { width: '390px', height: '844px' } },
        tablet:  { name: 'لوحي',  styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'مكتبي', styles: { width: '1280px', height: '900px' } },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'app' },
  },
}

export default preview
