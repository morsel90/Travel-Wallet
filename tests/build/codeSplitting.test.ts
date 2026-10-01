// @vitest-environment node
//
// 🔴 حارس تقسيم الحزم — يحرس خللاً **صامتاً في البناء**.
//
// ⚠️ ما يجعل هذا الحارس ضرورياً أن **البناء ينجح في كل الحالات**: لا خطأ،
// ولا تحذير، ولا اختبار ساقط — فقط حزم تُخزَّن مؤقتاً بشكل أسوأ. رُصد ذلك
// مرتين: مع manualChunks (شرط `react` ابتلع `react-virtuoso` و
// `motion/dist/es/react.mjs` كنصّ فرعي)، ومع codeSplitting.groups (ui-vendor
// حين سبقت react-vendor سحبت react نفسها، لأن المجموعة تسحب اعتماديات ما
// تلتقطه).
//
// يستورد الإعداد الحقيقي لا نسخة منه: نسخةٌ ثانية من المنطق كانت ستمرّ
// خضراء بينما الإعداد الفعلي منحرف.
import { describe, it, expect } from 'vitest'
import viteConfig from '../../vite.config.js'

interface Group { name: string; test: RegExp }

function getGroups(): Group[] {
  const factory = viteConfig as unknown as (env: { mode: string; command: string }) => {
    build: { rolldownOptions: { output: { codeSplitting: { groups: Group[] } } } }
  }
  return factory({ mode: 'production', command: 'build' }).build.rolldownOptions.output.codeSplitting.groups
}

describe('codeSplitting — تقسيم حزم البائعين', () => {
  const groups = getGroups()
  // أول مجموعة تطابق بترتيب الإعلان — نفس ما يفعله Rolldown بلا priority.
  const chunkOf = (id: string) => groups.find(g => g.test.test(id))?.name
  const nm = (p: string) => `/project/node_modules/${p}`

  it('⚠️ مدخل motion يذهب إلى ui-vendor رغم أن مساره يحوي «react»', () => {
    expect(chunkOf(nm('motion/dist/es/react.mjs'))).toBe('ui-vendor')
  })

  it('react-virtuoso يذهب إلى ui-vendor رغم أن اسمه يبدأ بـ«react»', () => {
    expect(chunkOf(nm('react-virtuoso/dist/index.mjs'))).toBe('ui-vendor')
  })

  it('lucide-react يذهب إلى ui-vendor', () => {
    expect(chunkOf(nm('lucide-react/dist/esm/icons/plus.js'))).toBe('ui-vendor')
  })

  it('framer-motion (التنفيذ الفعلي تحت motion) يذهب إلى ui-vendor', () => {
    expect(chunkOf(nm('framer-motion/dist/es/index.mjs'))).toBe('ui-vendor')
  })

  it('react وreact-dom وحدهما يذهبان إلى react-vendor', () => {
    expect(chunkOf(nm('react/index.js'))).toBe('react-vendor')
    expect(chunkOf(nm('react-dom/client.js'))).toBe('react-vendor')
  })

  it('⚠️ react-vendor مُعلَنة قبل ui-vendor — وإلا سحبت ui-vendor react مع motion', () => {
    const names = groups.map(g => g.name)
    expect(names.indexOf('react-vendor')).toBeLessThan(names.indexOf('ui-vendor'))
  })

  it('فايربيس يذهب إلى firebase-sdk', () => {
    expect(chunkOf(nm('firebase/app/dist/index.mjs'))).toBe('firebase-sdk')
    expect(chunkOf(nm('@firebase/firestore/dist/index.esm.js'))).toBe('firebase-sdk')
  })

  it('كود التطبيق نفسه لا يُقسَّم يدوياً', () => {
    expect(chunkOf('/project/src/App.tsx')).toBeUndefined()
    expect(chunkOf('/project/src/components/Modal.tsx')).toBeUndefined()
  })
})
