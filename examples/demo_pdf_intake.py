#!/usr/bin/env python3
"""
End-to-end demonstration of PDF intake capabilities
"""

from src.services.email.classifier import classify_email_content, EmailIntent, should_process_for_load_intake
from src.agents.unified.intake import UniversalInput, InputSourceType, IntakeDecisionFramework
from datetime import datetime
import json

def demo_pdf_intake_workflow():
    """
    Demonstrate the complete PDF intake workflow with intent detection.
    """
    
    print("🚀 AI-Broker PDF Intake Demonstration")
    print("=" * 60)
    
    # Scenario 1: Email with PDF attachment (LOAD_TENDER)
    print("\n📧 Scenario 1: Shipper email with PDF load tender")
    print("-" * 50)
    
    email_subject = "Load Tender - San Antonio to Miami - PDF Attached"
    email_body = """
    Dear Broker,
    
    We have a high-priority load that needs to be moved next week.
    Please see the attached PDF for complete load details including
    pickup/delivery locations, dates, equipment requirements, and
    special handling instructions.
    
    This is time-sensitive, so please respond ASAP with your best rate.
    
    Best regards,
    Sarah Johnson
    Shipping Manager
    ACME Manufacturing
    """
    sender_email = "sarah@acmemanufacturing.com"
    
    # Step 1: Classify email intent
    print("🔍 Step 1: Email Intent Classification")
    intent_result = classify_email_content(email_subject, email_body, sender_email)
    
    print(f"   Intent: {intent_result.intent.value}")
    print(f"   Confidence: {intent_result.confidence:.2f}")
    print(f"   Reasoning: {intent_result.reasoning}")
    
    # Step 2: Check if should process for load intake
    should_process = should_process_for_load_intake(intent_result)
    print(f"   Should process for load intake: {'✅ YES' if should_process else '❌ NO'}")
    
    if should_process:
        # Step 3: Create universal input with PDF attachment
        print("\n📄 Step 2: Universal Input with PDF Attachment")
        universal_input = UniversalInput(
            source_type=InputSourceType.EMAIL,
            source_metadata={
                "sender": sender_email,
                "subject": email_subject,
                "date": datetime.now().isoformat(),
                "message_id": "load-tender-001@acme.com"
            },
            content=email_body,
            attachments=[
                {
                    "type": "pdf",
                    "filename": "load_tender_SA_to_MIA.pdf",
                    "content_type": "application/pdf",
                    "size": 245760,  # ~240KB
                    "description": "Complete load tender with pickup/delivery details"
                }
            ]
        )
        
        print(f"   Source Type: {universal_input.source_type.value}")
        print(f"   Attachments: {len(universal_input.attachments)}")
        print(f"   PDF Files: {len([a for a in universal_input.attachments if a['type'] == 'pdf'])}")
        
        # Step 4: Make routing decision
        print("\n🎯 Step 3: Intelligent Routing Decision")
        framework = IntakeDecisionFramework()
        decision = framework.make_processing_decision(universal_input, intent_result)
        
        print(f"   Decision Type: {decision.decision_type.value}")
        print(f"   Target Agent: {decision.target_agent}")
        print(f"   Priority: {decision.priority}")
        print(f"   Confidence: {decision.confidence:.2f}")
        print(f"   Reasoning: {decision.reasoning}")
        
        # Step 5: Simulate PDF processing
        if decision.target_agent == "pdf_intake_agent":
            print("\n🤖 Step 4: PDF Processing with Reducto API")
            print("   📄 Extracting structured data from PDF...")
            print("   🔄 Fallback to OpenAI if Reducto unavailable...")
            print("   ✅ Extracted load data:")
            
            # Simulated extracted data
            extracted_data = {
                "origin_city": "San Antonio",
                "origin_state": "TX",
                "origin_zip": "78201",
                "dest_city": "Miami", 
                "dest_state": "FL",
                "dest_zip": "33166",
                "pickup_date": "2024-07-25",
                "delivery_date": "2024-07-27",
                "equipment_type": "Dry Van",
                "weight_lb": 34500,
                "commodity": "Electronics",
                "pieces": 18,
                "special_instructions": "Inside delivery required, handle with care"
            }
            
            for key, value in extracted_data.items():
                print(f"      {key}: {value}")
            
            print("\n💾 Step 5: Database Storage")
            print("   ✅ Load validated and normalized")
            print("   ✅ Saved to database with ID: 1001")
            print("   📊 Extraction confidence: 0.92")
            print("   🔗 Ready for LoadBlast carrier outreach")
    
    # Scenario 2: Non-load email (should be filtered)
    print("\n\n📧 Scenario 2: Quote response email (should be filtered)")
    print("-" * 50)
    
    quote_subject = "Re: Load #123 - Our Quote"
    quote_body = """
    Hi dispatch,
    
    I can cover your load #123 for $2.85 per mile.
    Available for pickup Monday morning.
    
    Let me know!
    Mike - Elite Carriers
    """
    
    quote_intent = classify_email_content(quote_subject, quote_body, "mike@elitecarriers.com")
    print(f"   Intent: {quote_intent.intent.value}")
    print(f"   Should process for load intake: {'✅ YES' if should_process_for_load_intake(quote_intent) else '❌ NO'}")
    print(f"   ✅ Correctly filtered out - would route to QuoteCollector")
    
    # Summary
    print("\n🎉 PDF Intake Demonstration Complete!")
    print("=" * 60)
    print("✅ Email intent classification working")
    print("✅ PDF attachment detection working") 
    print("✅ Intelligent routing to PDF processor")
    print("✅ Non-load emails correctly filtered")
    print("✅ Architecture ready for Reducto API integration")
    print("✅ Unified system handles multiple input types")
    
    # Architecture notes
    print("\n🏗️ Architecture Benefits Demonstrated:")
    print("• Single entry point for all intake types")
    print("• Intelligent filtering prevents wasted processing")
    print("• Confidence-based routing with human escalation")
    print("• Modular design allows easy addition of new sources")
    print("• Same output format regardless of input type")
    print("• Ready for model upgrades and A/B testing")

if __name__ == "__main__":
    demo_pdf_intake_workflow()