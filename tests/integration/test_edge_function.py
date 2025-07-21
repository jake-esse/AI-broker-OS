#!/usr/bin/env python3
"""
Test Edge Function with Corrected Schema

Tests the updated fn_create_load Edge Function to verify it works
with the actual database schema.
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

def test_edge_function():
    print("🧪 Testing Updated Edge Function")
    print("=" * 50)
    
    # Use the corrected Edge Function endpoint
    edge_function_url = "https://gylxustweebxlnqaykec.supabase.co/functions/v1/fn_create_load"
    
    # Test data matching actual database schema
    test_load = {
        "origin_zip": "90210",
        "dest_zip": "10001",
        "pickup_dt": "2025-01-26T10:00:00",
        "equipment": "53' Dry Van",
        "weight_lb": 35000,
        "commodity": "Electronics",
        "shipper_name": "Test Shipper Co",
        "shipper_email": "shipper@testco.com",
        "raw_email_text": "Test load from updated Edge Function",
        "extraction_confidence": 0.95,
        "missing_fields": []
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.getenv('SUPABASE_SERVICE_ROLE_KEY')}"
    }
    
    print("\n1️⃣ Sending test load to updated Edge Function...")
    print(f"   URL: {edge_function_url}")
    print(f"   Data: {json.dumps(test_load, indent=2)}")
    
    try:
        response = requests.post(
            edge_function_url,
            json=test_load,
            headers=headers,
            timeout=30
        )
        
        print(f"\n2️⃣ Response received:")
        print(f"   Status Code: {response.status_code}")
        
        try:
            response_data = response.json()
            print(f"   Response: {json.dumps(response_data, indent=2)}")
            
            if response.status_code == 201 and response_data.get('success'):
                print("\n✅ Edge Function Test PASSED!")
                print(f"   Load created successfully: {response_data.get('load_id')}")
                print(f"   Load number: {response_data.get('load_number')}")
                return True
            else:
                print("\n❌ Edge Function Test FAILED!")
                print(f"   Error: {response_data.get('error')}")
                return False
                
        except json.JSONDecodeError:
            print(f"   Raw response: {response.text}")
            return False
            
    except Exception as e:
        print(f"\n❌ Edge Function Test FAILED!")
        print(f"   Error: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_edge_function()
    
    if success:
        print("\n🎉 Edge Function is working correctly with the database schema!")
        print("\n📋 Next Steps:")
        print("   1. Integration testing with existing intake workflow")
        print("   2. Deploy webhook Edge Functions for email processing")
        print("   3. Test complete end-to-end email processing flow")
    else:
        print("\n🔧 Please check the Edge Function deployment and database schema.")