import { POST } from '@/app/api/intake/process/route'
import { NextRequest } from 'next/server'

// Mock IntakeAgent
jest.mock('@/lib/agents/intake', () => ({
  IntakeAgent: jest.fn().mockImplementation(() => ({
    process_quote_request: jest.fn().mockResolvedValue({
      action: 'proceed_to_quote',
      confidence_score: 0.95,
      load_data: {
        reference_number: 'TEST-001',
        shipper_name: 'Test Shipper',
        shipper_email: 'shipper@test.com',
        origin_city: 'Los Angeles',
        origin_state: 'CA',
        origin_zip: '90001',
        dest_city: 'Dallas',
        dest_state: 'TX',
        dest_zip: '75201',
        pickup_date: '2024-02-15',
        commodity: 'General Freight',
        weight_lbs: 35000,
        equipment_type: 'Dry Van'
      },
      analysis_summary: 'All required load details extracted successfully.'
    })
  }))
}))

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: 'load-123' },
      error: null
    })
  }))
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabase))
}))

describe('POST /api/intake/process', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create a load when all details are complete', async () => {
    const request = new NextRequest('http://localhost:3000/api/intake/process', {
      method: 'POST',
      body: JSON.stringify({
        email_id: 'email-123',
        broker_id: 'broker-123',
        channel: 'oauth_gmail',
        content: 'Need quote from LA to Dallas, 35000 lbs',
        raw_data: {
          from: 'shipper@test.com',
          subject: 'Quote Request'
        }
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.action).toBe('proceed_to_quote')
    expect(data.load_id).toBe('load-123')
    expect(mockSupabase.from).toHaveBeenCalledWith('loads')
  })

  it('should request clarification when details are missing', async () => {
    // Mock IntakeAgent to return clarification needed
    const { IntakeAgent } = require('@/lib/agents/intake')
    IntakeAgent.mockImplementationOnce(() => ({
      process_quote_request: jest.fn().mockResolvedValue({
        action: 'request_clarification',
        missing_fields: ['weight_lbs', 'pickup_date'],
        clarification_message: 'Please provide the weight and pickup date for your shipment.'
      })
    }))

    const request = new NextRequest('http://localhost:3000/api/intake/process', {
      method: 'POST',
      body: JSON.stringify({
        email_id: 'email-456',
        broker_id: 'broker-123',
        channel: 'oauth_gmail',
        content: 'Need quote from LA to Dallas',
        raw_data: {
          from: 'shipper@test.com',
          subject: 'Quote Request'
        }
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.action).toBe('request_clarification')
    expect(data.missing_fields).toContain('weight_lbs')
    expect(data.missing_fields).toContain('pickup_date')
  })

  it('should handle spam/invalid requests', async () => {
    const { IntakeAgent } = require('@/lib/agents/intake')
    IntakeAgent.mockImplementationOnce(() => ({
      process_quote_request: jest.fn().mockResolvedValue({
        action: 'ignore',
        reason: 'Content appears to be spam or unrelated to freight'
      })
    }))

    const request = new NextRequest('http://localhost:3000/api/intake/process', {
      method: 'POST',
      body: JSON.stringify({
        broker_id: 'broker-123',
        channel: 'oauth_gmail',
        content: 'Buy cheap watches now!',
        raw_data: {}
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.action).toBe('ignore')
    expect(data.reason).toBeTruthy()
  })

  it('should handle database errors gracefully', async () => {
    mockSupabase.from.mockImplementationOnce(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: new Error('Database connection failed')
      })
    }))

    const request = new NextRequest('http://localhost:3000/api/intake/process', {
      method: 'POST',
      body: JSON.stringify({
        broker_id: 'broker-123',
        channel: 'oauth_gmail',
        content: 'Need quote',
        raw_data: {}
      })
    })

    const response = await POST(request)
    
    expect(response.status).toBe(500)
  })
})

describe('Email to Load Conversion', () => {
  it('should preserve all email metadata when creating load', async () => {
    const emailData = {
      email_id: 'email-789',
      broker_id: 'broker-123',
      channel: 'imap_email',
      content: 'Complete load details here...',
      raw_data: {
        from: 'important.shipper@company.com',
        to: 'quotes@broker.com',
        subject: 'Urgent: Quote needed for tomorrow',
        messageId: '<unique-message-id@company.com>',
        date: new Date().toISOString()
      }
    }

    const request = new NextRequest('http://localhost:3000/api/intake/process', {
      method: 'POST',
      body: JSON.stringify(emailData)
    })

    await POST(request)

    // Verify email metadata is preserved in load creation
    expect(mockSupabase.from).toHaveBeenCalledWith('loads')
    const insertCall = mockSupabase.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(insertCall.source_email_id).toBe('email-789')
    expect(insertCall.channel).toBe('imap_email')
    expect(insertCall.raw_request).toBe(emailData.content)
  })
})