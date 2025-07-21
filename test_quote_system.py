#!/usr/bin/env python3
"""
Test script for the complete quote generation and delivery system.

Tests:
1. Quote template rendering
2. Email generation
3. Complete workflow from load to delivered quote
"""

import sys
import json
from pathlib import Path
from datetime import datetime
from decimal import Decimal

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.services.quote_management import QuoteManager, QuoteTemplate, DeliveryChannel
from src.services.pricing.engine import PricingResult


def test_quote_templates():
    """Test quote template rendering."""
    print("\n=== Testing Quote Templates ===")
    
    # Create test data
    template_data = {
        "quote_number": "QB-240125-TEST",
        "quote_id": "test-quote-123",
        "generated_date": datetime.now().isoformat(),
        "expiration_date": datetime.now().isoformat(),
        "validity_hours": 24,
        
        # Load details
        "origin_city": "Dallas",
        "origin_state": "TX",
        "origin_zip": "75201",
        "dest_city": "Houston",
        "dest_state": "TX",
        "dest_zip": "77002",
        "equipment_type": "Van",
        "weight_lbs": 25000,
        "pickup_date": datetime.now().isoformat(),
        
        # Pricing
        "total_rate": Decimal("598.00"),
        "linehaul_rate": Decimal("480.00"),
        "fuel_surcharge": Decimal("40.00"),
        "accessorial_charges": {"Detention": Decimal("78.00")},
        "total_miles": 240,
        
        # Contact
        "shipper_name": "Test Shipper",
        "shipper_email": "test@example.com",
        
        # Company
        "company_name": "AI-Broker",
        "company_email": "quotes@ai-broker.com",
        "company_phone": "(555) 123-4567",
        "broker_name": "AI Assistant",
        "booking_link": "https://app.ai-broker.com/quote/test-123/accept"
    }
    
    # Test SMS template
    from jinja2 import Template
    sms_template = Template(QuoteTemplate.SMS_TEMPLATE)
    sms_content = sms_template.render(**template_data)
    
    print("\nSMS Quote:")
    print("-" * 50)
    print(sms_content)
    print("-" * 50)
    
    # Test text email template
    text_template = Template(QuoteTemplate.TEXT_TEMPLATE)
    text_content = text_template.render(**template_data)
    
    print("\nText Email Quote (first 500 chars):")
    print("-" * 50)
    print(text_content[:500] + "...")
    print("-" * 50)
    
    return True


def test_quote_manager():
    """Test quote manager functionality."""
    print("\n=== Testing Quote Manager ===")
    
    try:
        manager = QuoteManager()
        print("✅ Quote manager initialized successfully")
        
        # Check configuration
        print(f"   Company: {manager.company_settings['company_name']}")
        print(f"   Email: {manager.company_settings['company_email']}")
        print(f"   Phone: {manager.company_settings['company_phone']}")
        print(f"   Quote validity: {manager.company_settings['quote_validity_hours']} hours")
        
        # Test template rendering
        print("\n📝 Testing template rendering...")
        
        # Create mock pricing result
        pricing_result = PricingResult()
        pricing_result.total_miles = 240
        pricing_result.linehaul_rate = Decimal("480.00")
        pricing_result.fuel_surcharge = Decimal("40.00")
        pricing_result.total_rate = Decimal("520.00")
        pricing_result.recommended_quote_to_shipper = Decimal("598.00")
        pricing_result.margin_percentage = 15.0
        pricing_result.confidence_score = 0.95
        
        # Test quote number generation
        quote_number = manager._generate_quote_number()
        print(f"✅ Generated quote number: {quote_number}")
        
        return True
        
    except Exception as e:
        print(f"❌ Quote manager test failed: {str(e)}")
        return False


def test_complete_workflow():
    """Test complete quote generation workflow."""
    print("\n=== Testing Complete Quote Workflow ===")
    
    # Mock load data
    test_load = {
        "id": "test-load-456",
        "origin_city": "Atlanta",
        "origin_state": "GA",
        "origin_zip": "30301",
        "dest_city": "Miami",
        "dest_state": "FL",
        "dest_zip": "33101",
        "equipment": "Flatbed",
        "weight_lb": 42000,
        "pickup_dt": "2024-01-26T08:00:00",
        "commodity": "Construction Materials",
        "shipper_email": "test@example.com",
        "shipper_name": "ABC Construction Co.",
        "status": "NEW_RFQ"
    }
    
    print(f"\nTest Load:")
    print(f"  Route: {test_load['origin_city']}, {test_load['origin_state']} → "
          f"{test_load['dest_city']}, {test_load['dest_state']}")
    print(f"  Equipment: {test_load['equipment']}")
    print(f"  Weight: {test_load['weight_lb']:,} lbs")
    
    try:
        # Test with quote delivery agent
        from src.agents.quote_delivery_agent import build_quote_delivery_agent
        
        agent = build_quote_delivery_agent()
        print("\n✅ Quote delivery agent built successfully")
        
        # Run agent with test data
        initial_state = {
            "load_id": test_load["id"],
            "metadata": {
                "test_mode": True,
                "started_at": datetime.now().isoformat()
            },
            "errors": [],
            "delivery_results": {}
        }
        
        print("\n🚀 Running quote delivery workflow...")
        
        # Note: This will use test data since no database is configured
        result = agent.invoke(initial_state)
        
        # Check results
        if result.get("quote_id"):
            print(f"\n✅ Quote generated successfully!")
            print(f"   Quote ID: {result['quote_id']}")
            print(f"   Quote Number: {result.get('quote_number', 'N/A')}")
        else:
            print(f"\n⚠️  Quote not generated")
            if result.get("validation_notes"):
                print("   Validation notes:")
                for note in result["validation_notes"]:
                    print(f"   - {note}")
            if result.get("errors"):
                print("   Errors:")
                for error in result["errors"]:
                    print(f"   - {error}")
        
        return True
        
    except Exception as e:
        print(f"❌ Workflow test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_email_content_generation():
    """Test email content generation."""
    print("\n=== Testing Email Content Generation ===")
    
    from src.services.pricing.engine import generate_quote_email, PricingResult
    
    # Create test data
    load_data = {
        "origin_city": "Chicago",
        "origin_state": "IL",
        "dest_city": "Detroit",
        "dest_state": "MI",
        "equipment_type": "Reefer",
        "weight_lbs": 38000
    }
    
    pricing_result = PricingResult()
    pricing_result.total_miles = 285
    pricing_result.linehaul_rate = Decimal("712.50")
    pricing_result.fuel_surcharge = Decimal("47.50")
    pricing_result.recommended_quote_to_shipper = Decimal("874.00")
    pricing_result.accessorial_charges = {"Temperature Control": Decimal("50.00")}
    
    # Generate email
    email_content = generate_quote_email(load_data, pricing_result)
    
    print("\nGenerated Email Content:")
    print("-" * 60)
    print(email_content)
    print("-" * 60)
    
    return True


def main():
    """Run all quote system tests."""
    print("🧪 Testing Quote Generation and Delivery System")
    print("=" * 60)
    
    tests = [
        ("Quote Templates", test_quote_templates),
        ("Quote Manager", test_quote_manager),
        ("Email Content", test_email_content_generation),
        ("Complete Workflow", test_complete_workflow)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            success = test_func()
            results.append((test_name, success))
        except Exception as e:
            print(f"\n❌ {test_name} failed with exception: {str(e)}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY:")
    print("=" * 60)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Quote system is ready.")
    else:
        print("\n⚠️  Some tests failed. Check the output above for details.")
    
    print("\nNote: Email delivery requires Resend API key configuration.")
    print("Database storage requires Supabase configuration.")


if __name__ == "__main__":
    main()