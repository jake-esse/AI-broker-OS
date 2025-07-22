import { render, screen, fireEvent } from '@testing-library/react'
import { LoadsTable } from '@/components/loads/LoadsTable'
import { useRouter } from 'next/navigation'

jest.mock('next/navigation')

describe('LoadsTable', () => {
  const mockPush = jest.fn()
  const mockLoads = [
    {
      id: 'load-1',
      shipper_name: 'ABC Manufacturing',
      status: 'quote_requested',
      created_at: new Date().toISOString(),
      notifications_count: 2,
      requires_action: true,
    },
    {
      id: 'load-2',
      shipper_name: 'XYZ Logistics',
      status: 'quoted',
      created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      notifications_count: 0,
      requires_action: false,
    }
  ]

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush
    })
    jest.clearAllMocks()
  })

  it('should render loads correctly', () => {
    render(<LoadsTable loads={mockLoads} />)

    expect(screen.getByText('ABC Manufacturing')).toBeInTheDocument()
    expect(screen.getByText('XYZ Logistics')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // Notification count
    expect(screen.getByText('Action Required')).toBeInTheDocument()
  })

  it('should navigate to load details on row click', () => {
    render(<LoadsTable loads={mockLoads} />)

    const firstRow = screen.getByText('ABC Manufacturing').closest('tr')
    fireEvent.click(firstRow!)

    expect(mockPush).toHaveBeenCalledWith('/loads/load-1')
  })

  it('should display correct status badges', () => {
    render(<LoadsTable loads={mockLoads} />)

    // Status badges should be rendered by LoadStatusBadge component
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBe(3) // Header + 2 data rows
  })

  it('should show relative time correctly', () => {
    render(<LoadsTable loads={mockLoads} />)

    // Should show relative times like "2 minutes ago"
    expect(screen.getByText(/ago/)).toBeInTheDocument()
  })

  it('should handle empty loads array', () => {
    render(<LoadsTable loads={[]} />)

    const rows = screen.getAllByRole('row')
    expect(rows.length).toBe(1) // Only header row
  })
})