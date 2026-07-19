// 🆕 دمج أسماء فئات Tailwind بشكل مشروط — أداة صغيرة تتجاهل القيم الزائفة
// (false/null/undefined) وتصل الباقي بمسافة. تكفي لحالاتنا دون الحاجة لـ clsx.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
