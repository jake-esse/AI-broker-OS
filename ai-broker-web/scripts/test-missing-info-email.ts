/**
 * Test script to simulate an email with missing information
 * and verify clarification email is sent
 */

import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'
import prisma from '../lib/prisma'

async function testMissingInfoEmail() {
  console.log('Testing email with missing information...\n')
  
  const brokerId = 'b5a660c8-0bd7-4070-ae28-ad9bb815529e'
  
  // Create a test email with missing information
  const testEmail = await prisma.email.create({
    data: {
      messageId: `test-missing-${Date.now()}@example.com`,
      fromAddress: 'test-shipper@example.com',
      toAddress: 'jake@hiaiden.com',
      subject: 'Need quote for refrigerated load',
      content: `
        Hi,
        
        I need to ship 30,000 lbs of frozen food.
        Must be kept at -20°F.
        Pickup from Chicago, IL.
        
        Please send quote ASAP.
      `,
      brokerId: brokerId,
      status: 'received',
      receivedAt: new Date()
    }
  })
  
  console.log('Created test email:', testEmail.id)
  console.log('From:', testEmail.fromAddress)
  console.log('Subject:', testEmail.subject)
  console.log('Content:', testEmail.content)
  
  // Process the email through intake
  const agent = new IntakeAgentLLMEnhanced()
  
  try {
    console.log('\nProcessing email...')
    const result = await agent.processEmail({
      from: testEmail.fromAddress,
      to: testEmail.toAddress,
      subject: testEmail.subject || '',
      content: testEmail.content || '',
      brokerId: brokerId,
      messageId: testEmail.messageId
    }, testEmail.id)
    
    console.log('\nProcessing Result:')
    console.log('Action:', result.action)
    console.log('Freight Type:', result.freight_type)
    console.log('Missing Fields:', result.missing_fields)
    console.log('Confidence:', result.confidence)
    
    // Check if clarification request was created
    const clarificationRequest = await prisma.clarificationRequest.findFirst({
      where: {
        shipperEmail: testEmail.fromAddress,
        brokerId: brokerId
      },
      orderBy: { createdAt: 'desc' }
    })
    
    if (clarificationRequest) {
      console.log('\n✅ Clarification request created:')
      console.log('ID:', clarificationRequest.id)
      console.log('Email Sent:', clarificationRequest.emailSent)
      console.log('Missing Fields:', clarificationRequest.missingFields)
    } else {
      console.log('\n❌ No clarification request found')
    }
    
    // Update email status
    await prisma.email.update({
      where: { id: testEmail.id },
      data: { status: 'processed', processedAt: new Date() }
    })
    
  } catch (error) {
    console.error('\n❌ Error processing email:', error)
  }
  
  await prisma.$disconnect()
}

testMissingInfoEmail().catch(console.error)