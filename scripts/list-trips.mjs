// scripts/list-trips.mjs
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadServiceAccount } from './serviceAccount.mjs'

const serviceAccount = loadServiceAccount()

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

async function main() {
  try {
    const snapshot = await db.collection('trips').get()
    
    if (snapshot.empty) {
      console.log('⚠️ لا توجد أي رحلات مسجلة في قاعدة البيانات حالياً.')
      return
    }

    console.log('📌 الرحلات الموجودة في قاعدة البيانات:')
    console.log('--------------------------------------------------')
    
    snapshot.forEach(doc => {
      const data = doc.data()
      console.log(`معرّف الرحلة (TRIP_ID): ${doc.id}`)
      console.log(`اسم الرحلة: ${data.name}`)
      console.log('--------------------------------------------------')
    })
  } catch (error) {
    console.error('❌ حدث خطأ أثناء جلب البيانات:', error)
  }
}

main()