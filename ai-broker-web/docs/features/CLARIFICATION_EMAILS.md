# Clarification Email System

## Overview

The clarification email system automatically requests missing information from shippers when their initial quote request lacks required details based on the freight type. This system uses the broker's connected Gmail or Outlook account to send professional clarification emails and track responses.

## Key Features

### 1. Freight Type Classification
- Automatically identifies freight type (FTL Dry Van, Reefer, Flatbed, Hazmat, LTL, Partial)
- Each freight type has specific required fields based on industry standards
- Validates extracted data against freight-specific requirements

### 2. Intelligent Email Processing
- Detects when emails are replies to previous clarification requests
- Merges new information with previously extracted data
- Re-validates and creates loads when all information is complete

### 3. Professional Email Generation
- HTML and plain text versions for maximum compatibility
- Shows what information was already captured
- Clearly lists what additional information is needed
- Includes validation warnings (e.g., oversize dimensions requiring permits)

### 4. Email Threading
- Maintains conversation threads using In-Reply-To and References headers
- Emails appear in the broker's sent folder
- Replies stay within the same email thread

## Technical Architecture

### Components

1. **FreightValidator** (`/lib/freight-types/freight-validator.ts`)
   - Identifies freight type based on extracted data
   - Validates required fields for each freight type
   - Provides human-readable field names and descriptions

2. **IntakeAgentLLMEnhanced** (`/lib/agents/intake-llm-enhanced.ts`)
   - Enhanced LLM-based email processing
   - Three-pass processing: extraction → classification → validation
   - Handles clarification responses by merging data

3. **ClarificationGenerator** (`/lib/email/clarification-generator.ts`)
   - Generates professional HTML/text clarification emails
   - Customizes content based on freight type and missing fields
   - Includes helpful examples and formatting

4. **OAuthEmailSender** (`/lib/email/oauth-sender.ts`)
   - Sends emails via Gmail or Outlook APIs
   - Handles OAuth token refresh automatically
   - Maintains email threading for conversations

### Database Schema

```prisma
model ClarificationRequest {
  id                   String   @id @default(gen_random_uuid())
  brokerId             String   @map("broker_id")
  shipperEmail         String   @map("shipper_email")
  freightType          String   @map("freight_type")
  extractedData        Json     @map("extracted_data")
  missingFields        String[] @map("missing_fields")
  validationWarnings   String[] @map("validation_warnings")
  emailSent            Boolean  @default(false)
  emailId              String?  @map("email_id")
  sentAt               DateTime?
  responseReceived     Boolean  @default(false)
  responseReceivedAt   DateTime?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @default(now())
}
```

## Freight Type Requirements

### FTL Dry Van
- **Required**: Pickup location, delivery location, weight, commodity, pickup date
- **Optional**: City/state/zip components, dimensions, piece count

### FTL Reefer
- **Required**: All dry van fields + temperature requirements (min/max)
- **Validation**: Temperature must include unit (F or C)

### FTL Flatbed
- **Required**: All dry van fields + dimensions
- **Validation**: Checks for oversize loads requiring permits

### FTL Hazmat
- **Required**: All dry van fields + hazmat class, UN number, proper shipping name, packing group, emergency contact, placards required
- **Validation**: Class 1-9, UN number format, packing group I/II/III

### LTL
- **Required**: Basic fields + dimensions, piece count, freight class
- **Validation**: Weight 150-15,000 lbs, freight class 50-500

### Partial
- **Required**: Basic fields + dimensions
- **Validation**: Weight typically 5,000-30,000 lbs

## Usage Flow

1. **Email Received**: System processes incoming email via OAuth connections
2. **Data Extraction**: LLM extracts all available load information
3. **Type Classification**: System identifies freight type based on extracted data
4. **Validation**: Required fields checked based on freight type
5. **Action Decision**:
   - If complete → Create load and proceed to quote
   - If incomplete → Send clarification email
6. **Response Handling**: When shipper replies, system merges data and re-validates
7. **Load Creation**: Once all required data present, load is created

## Configuration

### Environment Variables
```env
# OAuth Credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_TENANT_ID=common

# API Keys
OPENAI_API_KEY=your-openai-key
LLM_MODEL=gpt-4o-mini
```

### Testing

Use the provided test scripts:
```bash
# Test freight classification
npx tsx scripts/test-freight-classification.ts

# Test clarification emails (preview mode)
TEST_BROKER_ID=your-broker-id npx tsx scripts/test-clarification-emails.ts

# Actually send test clarification email
TEST_BROKER_ID=your-broker-id npx tsx scripts/test-clarification-emails.ts --send
```

## Best Practices

1. **Email Content**: Keep clarification requests professional and concise
2. **Threading**: Always maintain email threads for context
3. **Validation**: Be specific about what information is missing
4. **Examples**: Provide format examples for complex fields (e.g., temperature ranges)
5. **Follow-up**: Track clarification requests that don't receive responses

## Future Enhancements

1. **Automated Follow-ups**: Send reminder emails after 24-48 hours
2. **Smart Defaults**: Suggest common values based on route/commodity
3. **Multi-language Support**: Generate clarifications in shipper's language
4. **SMS Integration**: Send clarification requests via SMS for urgent loads
5. **Template Customization**: Allow brokers to customize email templates