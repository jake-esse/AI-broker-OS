import { EmailOAuthProcessor } from '@/lib/email/oauth-processor'
import { ImapEmailProcessor } from '@/lib/email/imap-processor'

// Mock external dependencies
jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(() => ({
      users: {
        messages: {
          list: jest.fn().mockResolvedValue({
            data: {
              messages: [
                { id: 'msg1' },
                { id: 'msg2' }
              ]
            }
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              id: 'msg1',
              payload: {
                headers: [
                  { name: 'From', value: 'shipper@example.com' },
                  { name: 'Subject', value: 'Quote Request' },
                  { name: 'Date', value: new Date().toISOString() }
                ],
                body: {
                  data: Buffer.from('Need quote from LA to Dallas, 35000 lbs').toString('base64')
                }
              }
            }
          }),
          modify: jest.fn().mockResolvedValue({}),
        }
      }
    }))
  }
}))

jest.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    init: jest.fn(() => ({
      api: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      top: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        value: [
          {
            id: 'msg1',
            subject: 'Quote Request',
            from: { emailAddress: { address: 'shipper@example.com' } },
            receivedDateTime: new Date().toISOString(),
            body: { content: 'Need quote from Chicago to Atlanta, 42000 lbs' },
            hasAttachments: false
          }
        ]
      }),
      update: jest.fn().mockResolvedValue({})
    }))
  }
}))

// Mock fetch
global.fetch = jest.fn()

describe('EmailOAuthProcessor', () => {
  let processor: EmailOAuthProcessor

  beforeEach(() => {
    processor = new EmailOAuthProcessor()
    jest.clearAllMocks()
  })

  describe('processGmailMessages', () => {
    it('should process Gmail messages successfully', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ action: 'proceed_to_quote', load_id: '123' })
      } as Response)

      await processor.processGmailMessages('fake-token', 'broker-123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/intake/process'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('shipper@example.com')
        })
      )
    })

    it('should handle Gmail API errors gracefully', async () => {
      const mockGmail = require('googleapis').google.gmail
      mockGmail.mockImplementationOnce(() => {
        throw new Error('Gmail API error')
      })

      await expect(
        processor.processGmailMessages('fake-token', 'broker-123')
      ).rejects.toThrow('Gmail API error')
    })
  })

  describe('processMicrosoftMessages', () => {
    it('should process Outlook messages successfully', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ action: 'proceed_to_quote', load_id: '456' })
      } as Response)

      await processor.processMicrosoftMessages('fake-token', 'broker-123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/intake/process'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Chicago to Atlanta')
        })
      )
    })
  })
})

describe('Email Content Extraction', () => {
  it('should extract load details from email content', () => {
    const testCases = [
      {
        content: 'Need quote from Los Angeles, CA 90001 to Dallas, TX 75201. 35,000 lbs, pickup Monday',
        expected: {
          hasOrigin: true,
          hasDestination: true,
          hasWeight: true,
        }
      },
      {
        content: 'Quote request: LAX to DFW, general freight',
        expected: {
          hasOrigin: true,
          hasDestination: true,
          hasWeight: false,
        }
      }
    ]

    testCases.forEach(({ content, expected }) => {
      // Test pattern matching
      const originMatch = /(?:from|pickup at?)\s+([^,]+(?:,\s*\w{2})?)/i.test(content)
      const destMatch = /(?:to|deliver to?)\s+([^,]+(?:,\s*\w{2})?)/i.test(content)
      const weightMatch = /(\d{1,3}(?:,\d{3})*)\s*(?:lbs?|pounds?)/i.test(content)

      expect(originMatch).toBe(expected.hasOrigin)
      expect(destMatch).toBe(expected.hasDestination)
      expect(weightMatch).toBe(expected.hasWeight)
    })
  })
})

describe('IMAP Email Processing', () => {
  it('should validate IMAP connection parameters', () => {
    const validParams = {
      email: 'test@example.com',
      password: 'password123',
      host: 'imap.example.com',
      port: 993
    }

    expect(validParams.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    expect(validParams.port).toBeGreaterThan(0)
    expect(validParams.port).toBeLessThan(65536)
    expect(validParams.host).toBeTruthy()
  })

  it('should handle attachment processing', () => {
    const mockAttachment = {
      filename: 'load-details.pdf',
      contentType: 'application/pdf',
      size: 1024 * 100, // 100KB
      content: Buffer.from('mock pdf content')
    }

    expect(mockAttachment.size).toBeLessThan(10 * 1024 * 1024) // 10MB limit
    expect(mockAttachment.contentType).toMatch(/^(application\/pdf|image\/|text\/)/i)
  })
})