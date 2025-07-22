# Week 4: Integration & Launch Prep

**Status**: TODO

## Day 1-2: Email Integration

### OAuth Email Processing

```typescript
// lib/email/oauth-processor.ts
import { OAuth2Client } from 'google-auth-library'
import { Client } from '@microsoft/microsoft-graph-client'
import { createClient } from '@supabase/supabase-js'
import { IntakeAgent } from '@/lib/agents/intake'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class EmailOAuthProcessor {
  async processGmailMessages(accessToken: string, brokerId: string) {
    const oauth2Client = new OAuth2Client()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    // Get unread messages
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const messages = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread'
    })
    
    for (const message of messages.data.messages || []) {
      const emailData = await this.extractEmailData(gmail, message.id)
      await this.processEmailForLoad(emailData, brokerId)
    }
  }
  
  async processMicrosoftMessages(accessToken: string, brokerId: string) {
    const graphClient = Client.init({
      authProvider: (done) => done(null, accessToken)
    })
    
    // Get unread messages
    const messages = await graphClient.api('/me/messages')
      .filter('isRead eq false')
      .get()
    
    for (const message of messages.value) {
      const emailData = await this.extractMicrosoftEmailData(message)
      await this.processEmailForLoad(emailData, brokerId)
    }
  }
  
  private async extractEmailData(gmail: any, messageId: string) {
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId
    })
    
    // Extract email details
    return {
      from: this.getHeaderValue(message.data.payload.headers, 'From'),
      to: this.getHeaderValue(message.data.payload.headers, 'To'),
      subject: this.getHeaderValue(message.data.payload.headers, 'Subject'),
      content: this.extractEmailBody(message.data.payload),
      messageId: message.data.id,
    }
  }
    
  
  private async processEmailForLoad(emailData: any, brokerId: string) {
    // Process with intake agent
    const intakeAgent = new IntakeAgent()
    const result = await intakeAgent.process_quote_request({
      broker_id: brokerId,
      channel: 'oauth_email',
      content: emailData.content,
      raw_data: emailData,
    })
    
    // Generate quote if complete
    if (result.action === 'proceed_to_quote') {
      // Trigger quote generation
      await fetch(`${process.env.NEXT_PUBLIC_URL}/api/quotes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          load_id: result.load_id,
          broker_id: brokerId,
        }),
      })
    }
  }
  
  private getHeaderValue(headers: any[], name: string): string {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase())
    return header ? header.value : ''
  }
  
  private extractEmailBody(payload: any): string {
    // Extract plain text or HTML body from email payload
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          return Buffer.from(part.body.data, 'base64').toString()
        }
      }
    } else if (payload.body.data) {
      return Buffer.from(payload.body.data, 'base64').toString()
    }
    return ''
  }
}
```

## Day 3-4: Testing & Quality Assurance

### Test Suite Creation

```typescript
// __tests__/quote-generation.test.ts
import { describe, it, expect } from '@jest/globals'
import { PricingEngine } from '@/lib/pricing-engine'
import { IntakeAgent } from '@/lib/agents/intake'

describe('Quote Generation', () => {
  const pricingEngine = new PricingEngine()
  const intakeAgent = new IntakeAgent()
  
  it('should extract load details from email', async () => {
    const emailContent = `
      Hi, I need a quote for a load:
      Pick up in Los Angeles, CA 90001 on Monday
      Deliver to Dallas, TX 75201 by Wednesday
      35,000 lbs of general freight
    `
    
    const result = await intakeAgent.extractLoadDetails(emailContent)
    
    expect(result.origin_city).toBe('Los Angeles')
    expect(result.origin_state).toBe('CA')
    expect(result.dest_city).toBe('Dallas')
    expect(result.weight_lbs).toBe(35000)
  })
  
  it('should generate accurate FTL quotes', () => {
    const loadData = {
      origin_zip: '90001',
      dest_zip: '75201',
      pickup_date: '2024-02-01',
      commodity: 'General Freight',
      weight_lbs: 35000,
    }
    
    const quote = pricingEngine.generate_quote(loadData)
    
    expect(quote.quoted_rate).toBeGreaterThan(0)
    expect(quote.confidence_score).toBeGreaterThan(0.5)
    expect(quote.quoted_rate).toBeGreaterThan(quote.market_rate)
  })
  
  it('should handle incomplete load data', async () => {
    const incompleteEmail = `
      Need a quote from LA to Dallas next week
    `
    
    const result = await intakeAgent.process_quote_request({
      content: incompleteEmail,
      broker_id: 'test-broker',
      channel: 'email',
    })
    
    expect(result.action).toBe('request_clarification')
    expect(result.missing_fields).toContain('weight_lbs')
    expect(result.missing_fields).toContain('pickup_date')
  })
})
```

### Load Testing Script

```python
# load_test.py
import asyncio
import aiohttp
import time
from datetime import datetime, timedelta

async def send_quote_request(session, index):
    """Send a single quote request"""
    
    load_data = {
        "origin_city": "Los Angeles",
        "origin_state": "CA",
        "origin_zip": "90001",
        "dest_city": "Dallas",
        "dest_state": "TX", 
        "dest_zip": "75201",
        "pickup_date": (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d"),
        "commodity": f"Test Load {index}",
        "weight_lbs": 35000
    }
    
    start_time = time.time()
    
    async with session.post(
        "https://your-app.vercel.app/api/quotes/generate",
        json=load_data,
        headers={"Authorization": f"Bearer {TEST_API_KEY}"}
    ) as response:
        result = await response.json()
        elapsed = time.time() - start_time
        
        return {
            "index": index,
            "status": response.status,
            "elapsed_time": elapsed,
            "quote": result.get("quoted_rate")
        }

async def load_test(num_requests=100):
    """Run load test with concurrent requests"""
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        for i in range(num_requests):
            task = send_quote_request(session, i)
            tasks.append(task)
            
            # Stagger requests slightly
            await asyncio.sleep(0.1)
        
        results = await asyncio.gather(*tasks)
        
        # Analyze results
        successful = [r for r in results if r["status"] == 200]
        avg_time = sum(r["elapsed_time"] for r in successful) / len(successful)
        
        print(f"Total Requests: {num_requests}")
        print(f"Successful: {len(successful)}")
        print(f"Average Response Time: {avg_time:.2f}s")
        print(f"Requests/Second: {len(successful) / (num_requests * 0.1):.2f}")

if __name__ == "__main__":
    asyncio.run(load_test(100))
```

## Day 5: Launch Preparation

### Production Checklist

#### 1. Environment Configuration
```bash
# Production environment variables
NODE_ENV=production
NEXT_PUBLIC_URL=https://app.yourdomain.com
SUPABASE_URL=your_production_url
SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_key

# Email configuration
RESEND_API_KEY=your_production_resend_key
EMAIL_FROM=quotes@yourdomain.com

# OAuth Email Integration (Already Implemented)
GOOGLE_CLIENT_ID=your_production_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_production_google_oauth_client_secret
MICROSOFT_CLIENT_ID=your_production_microsoft_oauth_client_id
MICROSOFT_CLIENT_SECRET=your_production_microsoft_oauth_client_secret
OAUTH_REDIRECT_URI=https://app.yourdomain.com/auth/oauth/callback

# AI Services
OPENAI_API_KEY=your_production_openai_key
ANTHROPIC_API_KEY=your_production_anthropic_key
REDUCTO_API_KEY=your_production_reducto_key

# Monitoring
SENTRY_DSN=your_sentry_dsn
POSTHOG_API_KEY=your_posthog_key
```

#### 2. Domain & DNS Setup
- Configure custom domain in Vercel
- Set up email domain in Resend for outbound emails
- Configure SPF, DKIM, DMARC records
- Configure OAuth redirect URIs in Google Cloud Console and Azure AD

#### 3. Security Hardening
- Enable Row Level Security on all tables
- Set up API rate limiting
- Configure CORS policies
- Enable SSL certificates

#### 4. Monitoring & Analytics
```typescript
// lib/monitoring.ts
import * as Sentry from "@sentry/nextjs"
import posthog from 'posthog-js'

export function trackQuoteGenerated(quoteData: any) {
  // Send to analytics
  posthog.capture('quote_generated', {
    origin_state: quoteData.origin_state,
    dest_state: quoteData.dest_state,
    distance: quoteData.distance_miles,
    rate: quoteData.quoted_rate,
    confidence: quoteData.confidence_score,
  })
  
  // Track revenue event
  posthog.capture('revenue_opportunity', {
    amount: quoteData.quoted_rate * 0.20, // Estimated margin
  })
}

export function trackError(error: Error, context: any) {
  Sentry.captureException(error, {
    extra: context
  })
}
```

#### 5. Customer Onboarding Flow
```typescript
// app/onboarding/page.tsx
export default function OnboardingPage() {
  return (
    <OnboardingWizard steps={[
      {
        title: "Welcome to AI-Broker",
        content: "Let's get your account set up in 2 minutes",
      },
      {
        title: "Company Information",
        fields: ["company_name", "mc_number", "phone"],
      },
      {
        title: "Email Setup",
        content: "Forward quote requests to quotes@ai-broker.com",
        action: "Send test email",
      },
      {
        title: "Your First Quote",
        content: "Try generating a quote right now",
        action: "Create test quote",
      },
    ]} />
  )
}
```

## Key Deliverables
- OAuth email integration (Gmail & Outlook)
- Comprehensive test suite
- Load testing framework
- Production environment setup
- Security hardening
- Monitoring integration
- Customer onboarding flow

## Launch Readiness Checklist
- [ ] All environment variables configured
- [ ] Domain and DNS properly set up
- [ ] Email sending verified
- [ ] OAuth callbacks working
- [ ] Security policies in place
- [ ] Monitoring active
- [ ] Test suite passing
- [ ] Load testing completed
- [ ] Onboarding flow tested
- [ ] Documentation updated