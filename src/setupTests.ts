import '@testing-library/jest-dom'

// jsdom لا يُنفّذ window.scrollTo فعلياً — يسجّل تحذير "Not implemented" بدل
// ذلك. useAppCoordinator.ts يستدعيها عند الإقلاع (التفافاً على علة iOS Safari
// في safe-area-inset-top)، فبلا هذا الحشو يظهر التحذير في كل اختبار يُركِّب App.
window.scrollTo = () => {}