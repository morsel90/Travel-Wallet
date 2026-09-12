// @vitest-environment node
//
// 🔴 حارس تقسيم الحزم — يحرس خللاً **صامتاً في البناء**.
//
// `manualChunks` في vite.config.js يفحص المسار الكامل لكل وحدة بـ
// `id.includes(...)`، وترتيب الشروط فيه جزء من المنطق لا تجميل: شرط
// `react` يلتقط `react-virtuoso` و`motion/dist/es/react.mjs` معاً كنصّ
// فرعي. فلو سبق فرعَ `ui-vendor` لابتلع كليهما وبقي ذلك الفرع شبه ميت —
// وهو ما كان يحدث فعلاً مع `react-virtuoso` قبل ترقية motion.
//
// ⚠️ وما يجعل هذا الحارس ضرورياً أن **البناء ينجح في الحالتين**: لا خطأ،
// ولا تحذير، ولا اختبار ساقط — فقط حزمتان تُخزَّنان مؤقتاً بشكل أسوأ.
// التعليق التحذيري في الإعداد وحده لا يمنع انحداراً، وهذا يمنعه.
//
// يستورد الإعداد الحقيقي لا نسخة منه: نسخةٌ ثانية من المنطق كانت ستمرّ
// خضراء بينما الإعداد الفعلي منحرف.
import { describe, it, expect } from 'vitest'
import viteConfig from '../../vite.config.js'

type ManualChunks = (id: string) => string | undefined

function getManualChunks(): ManualChunks {
  const factory = viteConfig as unknown as (env: {
    mode: string
    command: string
  }) => { build: { rollupOptions: { output: { manualChunks: ManualChunks } } } }

  const config = factory({ mode: 'production', command: 'build' })
  return config.build.rollupOptions.output.manualChunks
}

describe('manualChunks — تقسيم حزم البائعين', () => {
  const manualChunks = getManualChunks()
  const nm = (p: string) => `/project/node_modules/${p}`

  it('⚠️ مدخل motion يذهب إلى ui-vendor رغم أن مساره يحوي «react»', () => {
    // هذا هو الانحدار بعينه: `motion/dist/es/react.mjs`. لو عاد شرط
    // react ليسبق ui-vendor، عاد هذا السطر إلى 'react-vendor' صامتاً.
    expect(manualChunks(nm('motion/dist/es/react.mjs'))).toBe('ui-vendor')
  })

  it('react-virtuoso يذهب إلى ui-vendor رغم أن اسمه يبدأ بـ«react»', () => {
    expect(manualChunks(nm('react-virtuoso/dist/index.mjs'))).toBe('ui-vendor')
  })

  it('lucide-react يذهب إلى ui-vendor', () => {
    expect(manualChunks(nm('lucide-react/dist/esm/icons/plus.js'))).toBe('ui-vendor')
  })

  it('framer-motion (التنفيذ الفعلي تحت motion) يذهب إلى ui-vendor', () => {
    expect(manualChunks(nm('framer-motion/dist/es/index.mjs'))).toBe('ui-vendor')
  })

  it('react وreact-dom وحدهما يذهبان إلى react-vendor', () => {
    expect(manualChunks(nm('react/index.js'))).toBe('react-vendor')
    expect(manualChunks(nm('react-dom/client.js'))).toBe('react-vendor')
  })

  it('فايربيس يذهب إلى firebase-sdk، وله الأسبقية على كل ما سواه', () => {
    expect(manualChunks(nm('firebase/app/dist/index.mjs'))).toBe('firebase-sdk')
    expect(manualChunks(nm('@firebase/firestore/dist/index.esm.js'))).toBe('firebase-sdk')
  })

  it('كود التطبيق نفسه لا يُقسَّم يدوياً', () => {
    expect(manualChunks('/project/src/App.tsx')).toBeUndefined()
    expect(manualChunks('/project/src/components/Modal.tsx')).toBeUndefined()
  })
})
