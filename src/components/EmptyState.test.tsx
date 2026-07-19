import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmptyState from './EmptyState'
import { Inbox } from 'lucide-react'

describe('EmptyState Component', () => {
  it('renders the title and description correctly', () => {
    const testTitle = 'لا توجد مصاريف'
    const testDesc = 'لم تقم بإضافة أي مصاريف حتى الآن.'

    render(<EmptyState Icon={Inbox} title={testTitle} description={testDesc} />)

    expect(screen.getByText(testTitle)).toBeInTheDocument()
    expect(screen.getByText(testDesc)).toBeInTheDocument()
  })
})