// 🆕 تنظيف لمرة واحدة: أثر الوصول إلى رحلات حُذفت قبل أن يتولّاه الحذف نفسه.
//
// حتى 2026-09-19 كان manageTrip (mode=delete) يحذف الرحلة وبياناتها ويترك خلفه:
//   • عضويتها في custom claims الحسابات (`trips: { [tripId]: true }`) — 218
//     حساباً لـ travelapp-87206 وحدها، أغلبها من حقبة رمز الرحلة (PIN).
//   • روابط دعوتها في tripInvites.
//   • قيدها في users/{uid}.organizesTripIds.
// والخطر في الأول: isMember() في القواعد تقرأ الـclaim وحده، وشاشة الحذف تقول
// إن المعرّف يصبح متاحاً لرحلة جديدة — فرحلةٌ جديدة بالمعرّف نفسه كانت ستُفتح
// فوراً لكل حامل عضوية القديمة. الحذف صار يُزيل هذا كله (revokeDeletedTripAccess
// في functions/index.js)؛ هذا السكربت يُزيل ما سبقه.
//
// «محذوفة» = معرّفٌ يظهر في claim أو دعوة أو organizesTripIds، ولا مستند له في
// trips/. لا يلمس أي عضوية لرحلة موجودة.
//
// الاستخدام:
//   node scripts/cleanup-deleted-trip-access.mjs           ← تجربة: يعرض ولا يكتب
//   node scripts/cleanup-deleted-trip-access.mjs --apply   ← ينفّذ
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { loadServiceAccount } from './serviceAccount.mjs'

const serviceAccount = loadServiceAccount()
initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth()
const db = getFirestore()
const APPLY = process.argv.includes('--apply')

console.log(`المشروع: ${serviceAccount.project_id} — ${APPLY ? '⚠️ تنفيذ فعلي' : 'تجربة فقط (أضف --apply للتنفيذ)'}`)

// ── ١. كل الحسابات وعضوياتها ────────────────────────────────────────────────
const users = []
let pageToken
do {
  const page = await auth.listUsers(1000, pageToken)
  users.push(...page.users)
  pageToken = page.pageToken
} while (pageToken)

const invites = (await db.collection('tripInvites').get()).docs
const profiles = (await db.collection('users').get()).docs

// ── ٢. المعرّفات المرشّحة، ثم أيّها لا مستند له ─────────────────────────────
const candidates = new Set()
for (const u of users) Object.keys(u.customClaims?.trips ?? {}).forEach((id) => candidates.add(id))
for (const i of invites) if (typeof i.data().tripId === 'string') candidates.add(i.data().tripId)
for (const p of profiles) (p.data().organizesTripIds ?? []).forEach((id) => candidates.add(id))

const deleted = new Set()
for (const id of candidates) {
  if (!(await db.collection('trips').doc(id).get()).exists) deleted.add(id)
}
console.log(`رحلات موجودة في الإشارات: ${candidates.size} — محذوفة منها: ${deleted.size}`)

// ── ٣. الحصر ────────────────────────────────────────────────────────────────
const staleUsers = users.filter((u) => Object.keys(u.customClaims?.trips ?? {}).some((id) => deleted.has(id)))
const staleInvites = invites.filter((i) => deleted.has(i.data().tripId))
const staleProfiles = profiles.filter((p) => (p.data().organizesTripIds ?? []).some((id) => deleted.has(id)))

for (const id of deleted) {
  const n = users.filter((u) => id in (u.customClaims?.trips ?? {})).length
  const inv = invites.filter((i) => i.data().tripId === id).length
  const org = profiles.filter((p) => (p.data().organizesTripIds ?? []).includes(id)).length
  console.log(`  ${id}: ${n} حساباً، ${inv} دعوة، ${org} بروفايل منظّم`)
}
console.log(`المجموع: ${staleUsers.length} حساباً، ${staleInvites.length} دعوة، ${staleProfiles.length} بروفايل`)

if (!APPLY) {
  console.log('لم يُكتب شيء.')
  process.exit(0)
}

// ── ٤. التنفيذ — عضويات الرحلات المحذوفة وحدها، وكل ما عداها كما هو ────────
for (const u of staleUsers) {
  const trips = Object.fromEntries(Object.entries(u.customClaims.trips).filter(([id]) => !deleted.has(id)))
  await auth.setCustomUserClaims(u.uid, { ...u.customClaims, trips })
}
await Promise.all(staleInvites.map((i) => i.ref.delete()))
await Promise.all(staleProfiles.map((p) =>
  p.ref.update({ organizesTripIds: FieldValue.arrayRemove(...[...deleted].filter((id) => (p.data().organizesTripIds ?? []).includes(id))) }),
))
console.log(`✔ نُظّف: ${staleUsers.length} حساباً، ${staleInvites.length} دعوة، ${staleProfiles.length} بروفايل`)
process.exit(0)
