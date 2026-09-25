// 🆕 هل ما كُتب في «اسم البنك» محفظة رقمية في الحقيقة؟ أول منظّم حقيقي سجّل
// «برق» كبنك: المحافظ الرقمية تُسوَّق كبنوك، والاختيار بين «حساب بنكي» و«محفظة
// رقمية» لا يفيد من لا يعرف في أيّ خانة تقع محفظته. الفحص هنا تنبيه لا منع —
// القائمة ليست حصرية، والغاية التقاط الأشيع لا كل محفظة.
const WALLET_KEYWORDS = [
  'برق', 'barq',
  // «stc pay» تحديداً لا «stc» وحدها: STC Bank بنك فعلاً وله آيبان.
  'stc pay', 'stcpay', 'اس تي سي باي', 'إس تي سي باي',
  'urpay', 'يو ار باي', 'يور باي',
  'mobily pay', 'موبايلي باي',
  'محفظ', 'wallet',
]

export function looksLikeWallet(bankName: string): boolean {
  const n = bankName.trim().toLowerCase()
  if (!n) return false
  return WALLET_KEYWORDS.some(k => n.includes(k))
}
