// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { canonicalAppUrl } from './canonicalUrl'

const at = (host: string, pathname = '/', search = '', hash = '') => ({ host, pathname, search, hash })
const PROD = 'travel-app-final-nu.vercel.app'

describe('canonicalAppUrl', () => {
  it('عنوان نشر فريد → الرابط نفسه على العنوان الأساسي', () => {
    expect(canonicalAppUrl(at('travel-app-final-esr0zv4fd-mohammed-alathim-s-projects.vercel.app'), PROD))
      .toBe('https://travel-app-final-nu.vercel.app/')
  })

  it('رابط الدعوة ينجو من الانتقال — المسار والاستعلام والمرساة كما هي', () => {
    expect(canonicalAppUrl(at('x-projects.vercel.app', '/', '?trip=Mdrsah&invite=abc123', '#top'), PROD))
      .toBe('https://travel-app-final-nu.vercel.app/?trip=Mdrsah&invite=abc123#top')
  })

  it('على العنوان الأساسي نفسه → null (لا رابط يعيد المستخدم إلى حيث هو)', () => {
    expect(canonicalAppUrl(at(PROD), PROD)).toBeNull()
  })

  it('بلا عنوان أساسي معرَّف (بناء محلي، E2E) → null', () => {
    expect(canonicalAppUrl(at('x-projects.vercel.app'), undefined)).toBeNull()
    expect(canonicalAppUrl(at('x-projects.vercel.app'), '')).toBeNull()
  })

  it.each(['localhost:5173', '127.0.0.1:4173', 'localhost'])('خادم محلي %s → null حتى لو عُرِّف العنوان', host => {
    expect(canonicalAppUrl(at(host), PROD)).toBeNull()
  })

  it('يقبل العنوان مكتوباً ببروتوكول أو شرطة ختامية', () => {
    expect(canonicalAppUrl(at('x-projects.vercel.app'), `https://${PROD}/`)).toBe(`https://${PROD}/`)
  })
})
