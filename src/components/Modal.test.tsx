// 🆕 H3 من تدقيق الإصدار: كل نوافذ التطبيق كانت غير قابلة للاستخدام بلوحة
// المفاتيح. الإغلاق بالنقر على الخلفية أو السحب — وكلاهما يحتاج مؤشراً — فمن
// يستخدم لوحة المفاتيح وحدها كان يفتح نافذة ولا يجد منها مخرجاً.
//
// ⚠️ هذه الاختبارات تفحص **السلوك** لا وجود السمات: أن Escape يُغلق فعلاً، وأن
// Tab لا يخرج، وأن التركيز يعود. سمةٌ مكتوبة بلا سلوك تمرّ في مراجعة الكود
// وتفشل عند أول مستخدم.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal, ConfirmModal } from './Modal'

const onClose = vi.fn()

beforeEach(() => { vi.clearAllMocks() })

const openModal = (children: React.ReactNode = <button>زر داخلي</button>) =>
  render(<Modal onClose={onClose} label="نافذة اختبار">{children}</Modal>)

describe('Modal — التعريف لقارئ الشاشة', () => {
  it('يُعرَّف كحوار باسمه، ويعلن أن ما خلفه غير متاح', () => {
    openModal()
    const dialog = screen.getByRole('dialog', { name: 'نافذة اختبار' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })
})

describe('Modal — لوحة المفاتيح', () => {
  // المخرج الوحيد المتاح بلا مؤشر. غيابه كان يعني نافذة بلا باب.
  it('Escape يُغلق النافذة', () => {
    openModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('مفتاح آخر لا يُغلقها', () => {
    openModal()
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Modal — التركيز', () => {
  it('ينتقل التركيز إلى داخل النافذة عند فتحها', () => {
    openModal(<button>أول زر</button>)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'أول زر' }))
  })

  it('تُركَّز الحاوية نفسها حين لا يوجد داخلها عنصر تفاعلي', () => {
    openModal(<p>نص فقط</p>)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  // ⚠️ الالتفاف هو ما يجعل الحصر حصراً: بدونه يقفز Tab من آخر عنصر إلى واجهة
  // المتصفح ثم إلى الصفحة المغطّاة خلف النافذة — وهي مرئية بصرياً كأنها معطّلة.
  it('Tab من آخر عنصر يلتفّ إلى أوّله', () => {
    openModal(<><button>الأول</button><button>الأخير</button></>)
    const first = screen.getByRole('button', { name: 'الأول' })
    const last  = screen.getByRole('button', { name: 'الأخير' })

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('Shift+Tab من أول عنصر يلتفّ إلى آخره', () => {
    openModal(<><button>الأول</button><button>الأخير</button></>)
    const first = screen.getByRole('button', { name: 'الأول' })
    const last  = screen.getByRole('button', { name: 'الأخير' })

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  // ⚠️ هذا ما يجعل النافذة قابلة للاستخدام مرتين: بلا إعادة التركيز يسقط إلى
  // <body>، فيبدأ المستخدم التنقّل من أول الصفحة بعد كل إغلاق.
  it('يعود التركيز إلى العنصر الذي فتح النافذة بعد إغلاقها', () => {
    const opener = document.createElement('button')
    opener.textContent = 'افتح'
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = openModal()
    expect(document.activeElement).not.toBe(opener)

    unmount()
    expect(document.activeElement).toBe(opener)

    opener.remove()
  })

  it('لا ينفجر إن أُزيل فاتح النافذة من الصفحة قبل إغلاقها', () => {
    // يحدث فعلاً: تُفتح نافذة تأكيد حذف مسافر من زر داخل بطاقته، ثم تختفي البطاقة.
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = openModal()
    opener.remove()

    expect(() => unmount()).not.toThrow()
  })
})

describe('ConfirmModal', () => {
  it('يستعمل عنوانه اسماً للحوار', () => {
    render(<ConfirmModal title="حذف المسافر؟" onConfirm={vi.fn()} onCancel={onClose} />)
    expect(screen.getByRole('dialog', { name: 'حذف المسافر؟' })).toBeInTheDocument()
  })

  it('Escape يعادل «إلغاء» لا «تأكيد» — الافتراضي الآمن', () => {
    const onConfirm = vi.fn()
    render(<ConfirmModal title="حذف المسافر؟" onConfirm={onConfirm} onCancel={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ⚠️ الافتراضي في HTML هو submit، فزرٌّ بلا type داخل <form> يُرسله صامتاً.
  it('زرّاه من نوع button صراحةً', () => {
    render(<ConfirmModal title="حذف؟" onConfirm={vi.fn()} onCancel={onClose} />)
    for (const name of ['نعم، احذف', 'إلغاء']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('type', 'button')
    }
  })
})
