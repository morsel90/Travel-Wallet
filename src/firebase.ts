import { initializeApp } from 'firebase/app'
import { getAuth }       from 'firebase/auth'
import { getFunctions }  from 'firebase/functions'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            'AIzaSyBnvA4hC2BUbpTYhLaBXRsVDezTgN3EMxo',
  authDomain:        'travelapp-87206.firebaseapp.com',
  projectId:         'travelapp-87206',
  storageBucket:     'travelapp-87206.firebasestorage.app',
  messagingSenderId: '460826160004',
  appId:             '1:460826160004:web:fb7a839405dc4e46b60bd1',
  measurementId:     'G-96VP3T7P4M',
}

const app = initializeApp(firebaseConfig)

export const auth    = getAuth(app)

// 🆕 APP_ID الثابت السابق أُزيل من هنا — مسار بيانات كل رحلة أصبح ديناميكياً
// عبر TRIP_ID (انظر utils/tripId.ts وfirestore.ts) لدعم رحلات متعددة بنفس
// مشروع Firebase الواحد هذا (بدل مشروع/Bucket منفصل لكل رحلة).

// ⚠️ المنطقة هنا يجب أن تطابق تمامًا المنطقة المُعرَّفة في functions/index.js
// (region: 'us-central1' داخل onCall) وإلا فشلت استدعاءات verifyTripPin
export const functions = getFunctions(app, 'us-central1')

// التهيئة الحديثة لقاعدة البيانات مع تفعيل التخزين المؤقت (Offline Persistence)
// هذا يستبدل الدالة القديمة enableIndexedDbPersistence التي سيتم إلغاؤها
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager() // يدعم فتح التطبيق في عدة تبويبات في نفس الوقت
  })
})