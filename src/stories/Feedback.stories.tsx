// قصص العناصر التي تُعرض لحظياً في التطبيق (toast، حالات فارغة، هياكل تحميل).
// كلها تعمل بـ props فقط بلا سياق — وأغلبها يظهر لثوانٍ معدودة في الاستخدام
// الفعلي، وهو تحديداً ما يجعل مراجعتها هنا مفيدة.
import type { Meta, StoryObj } from '@storybook/react-vite'
import Toast from '../components/Toast'
import EmptyState from '../components/EmptyState'
import { Users, Receipt, Route, Plus } from '../icons'
import { describeWriteError } from '../utils/writeErrors'

const meta = {
  title: 'التغذية الراجعة/Toast',
  component: Toast,
} satisfies Meta<typeof Toast>

export default meta
type Story = StoryObj<typeof meta>

export const مصروف_جديد: Story = {
  args: { message: { text: 'تم تسجيل المصروف', type: 'new' } },
}

export const حفظ_تعديل: Story = {
  args: { message: { text: 'تم حفظ التعديلات', type: 'edit' } },
}

/** نجاح مع تراجع — النمط المستخدم بعد نقل عنصر لسلة المهملات. */
export const نجاح_مع_تراجع: Story = {
  args: {
    message: {
      text: 'تم نقل المصروف إلى سلة المهملات',
      type: 'success',
      onUndo: () => console.log('[story] تراجع'),
    },
  },
}

/**
 * رفض من الخادم لسبب لن يتغيّر (صلاحيات): الرسالة تذكر السبب الحقيقي وتوضّح
 * أن المصروف لم يُسجَّل — ولا تعرض زر إعادة المحاولة، لأن تكرارها يفشل بنفس
 * الطريقة. النص هنا مولَّد من describeWriteError نفسها لا مكتوب يدوياً.
 */
export const خطأ_بلا_إعادة_محاولة: Story = {
  args: {
    message: {
      text: describeWriteError(Object.assign(new Error(''), { code: 'permission-denied' }), 'create').text,
      type: 'error',
    },
  },
}

/**
 * 🆕 تحذير ما بعد دمج الحساب (utils/mergeNotice.ts) — أطول رسالة نجاح في
 * التطبيق حالياً، فتُستخدم هنا لفحص التفاف النص على شاشة ضيقة (Toast.tsx لا
 * يحدّ عرضه بـ max-width، فطول الرسالة هو الاختبار الحقيقي).
 */
export const تحذير_دمج_الحساب: Story = {
  args: {
    message: {
      text: 'تم ربط حسابك ونُقلت رحلاتك. مصاريف سجّلتَها قبل الربط ستبقى ظاهرة، لكن لن تستطيع تعديلها أو حذفها بنفسك بعد الآن — المسؤول وحده يستطيع ذلك.',
      type: 'success',
    },
  },
}

/** انقطاع مؤقت: هنا فقط يُعرض زر إعادة المحاولة. */
export const خطأ_مع_إعادة_محاولة: Story = {
  args: {
    message: {
      text: describeWriteError(Object.assign(new Error(''), { code: 'unavailable' }), 'create').text,
      type: 'error',
      onRetry: () => console.log('[story] إعادة المحاولة'),
    },
  },
}

/** تجاوز حدّ المصروف الواحد كل ثانية. */
export const خطأ_حد_المعدل: Story = {
  args: {
    message: {
      text: describeWriteError(Object.assign(new Error(''), { code: 'resource-exhausted' }), 'create').text,
      type: 'error',
    },
  },
}

// ─── الحالات الفارغة ─────────────────────────────────────────────────────────

type EmptyStory = StoryObj<typeof EmptyState>

export const فارغ_لا_مسافرون: EmptyStory = {
  render: () => (
    <EmptyState
      Icon={Users}
      title="لا يوجد مسافرون بعد"
      description="أضف المسافرين المشاركين في الرحلة لتتمكّن من توزيع المصاريف وحساب من يدين لمن."
      actionLabel="إضافة أول مسافر"
      onAction={() => console.log('[story] إضافة مسافر')}
      ActionIcon={Plus}
    />
  ),
}

export const فارغ_لا_مصاريف: EmptyStory = {
  render: () => (
    <EmptyState
      Icon={Receipt}
      title="لا توجد مصاريف بعد"
      description="ابدأ بتسجيل أول مصروف للرحلة، وسيتولّى التطبيق حساب حصة كل مسافر تلقائياً."
      actionLabel="سجّل أول مصروف"
      onAction={() => console.log('[story] تسجيل مصروف')}
      ActionIcon={Plus}
    />
  ),
}

/** حالة فارغة بلا زر إجراء — تُستخدم حين لا يملك العضو صلاحية الإضافة. */
export const فارغ_بلا_إجراء: EmptyStory = {
  render: () => (
    <EmptyState
      Icon={Route}
      title="لا يوجد مسار بعد"
      description="أضف رحلات الطيران أو التنقلات البرية ليظهر للمسافرين المقطع القادم وموعده."
    />
  ),
}
