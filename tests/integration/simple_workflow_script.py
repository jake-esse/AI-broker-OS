#!/usr/bin/env python3
"""
Test the missing information workflow with simulated email sending
"""

import os, json, uuid
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

# Test without actual email sending
print("\n🧪 TESTING MISSING INFORMATION WORKFLOW (Simulated)")
print("="*60)

# Step 1: Test incomplete load detection
print("\n📋 Step 1: Testing incomplete load detection")
print("-"*40)

# Simulate what the intake agent extracts
test_load_data = {
    "origin_zip": "75201",  # Dallas
    "equipment": "Van",
    "pickup_dt": "2025-01-20T14:00:00-06:00",
    # Missing: dest_zip, weight_lb
}

# Check missing fields
from src.agents.intake.graph import REQUIRED, missing
missing_fields = missing(test_load_data)
print(f"✅ Detected missing fields: {missing_fields}")
assert missing_fields == ["dest_zip", "weight_lb"], f"Expected ['dest_zip', 'weight_lb'], got {missing_fields}"

# Step 2: Save incomplete load to database
print("\n📋 Step 2: Saving incomplete load to database")
print("-"*40)

import requests

# Prepare load data
thread_id = f"thread-{uuid.uuid4()}"
message_id = f"<test-{uuid.uuid4()}@testshipper.com>"
request_message_id = f"<request-{uuid.uuid4()}@ai-broker.com>"

# Add metadata
test_load_data["source_type"] = "EMAIL"
test_load_data["source_email_id"] = message_id
test_load_data["shipper_email"] = "dispatcher@testshipper.com"
test_load_data["missing_fields"] = missing_fields
test_load_data["ai_notes"] = "Test incomplete load"
test_load_data["is_complete"] = False
test_load_data["thread_id"] = thread_id
test_load_data["original_message_id"] = message_id
test_load_data["fields_requested"] = missing_fields
test_load_data["email_conversation"] = [{
    "timestamp": datetime.now().isoformat(),
    "direction": "outbound",
    "message_id": request_message_id,
    "type": "missing_info_request",
    "fields_requested": missing_fields
}]

# Call Edge Function
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
FN_CREATE_LOAD_URL = f"{SUPABASE_URL}/functions/v1/fn_create_load"

try:
    response = requests.post(
        FN_CREATE_LOAD_URL,
        json=test_load_data,
        headers={
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        },
        timeout=30
    )
    
    if response.status_code in [200, 201]:
        result = response.json()
        load_id = result.get('load_id')
        load_number = result.get('load_number')
        print(f"✅ Saved incomplete load: {load_number}")
        print(f"   Load ID: {load_id}")
        print(f"   Thread ID: {thread_id}")
    else:
        print(f"❌ Failed to save load: {response.status_code}")
        print(f"   Response: {response.text}")
        exit(1)
        
except Exception as e:
    print(f"❌ Error saving load: {e}")
    exit(1)

# Step 3: Simulate shipper response with missing info
print("\n📋 Step 3: Simulating shipper response with missing info")
print("-"*40)

# Extract missing information from simulated email
from src.agents.intake.missing_info_handler import extract_missing_information

simulated_response_email = """
Thanks for getting back to me so quickly.

The delivery is going to Atlanta, GA 30303.
The total weight is 25,000 pounds.

Let me know if you need anything else!
"""

extracted_data = extract_missing_information(
    simulated_response_email, 
    missing_fields, 
    test_load_data
)

print(f"✅ Extracted data: {json.dumps(extracted_data, indent=2)}")
assert "dest_zip" in extracted_data, "Failed to extract dest_zip"
assert "weight_lb" in extracted_data, "Failed to extract weight_lb"

# Step 4: Update load with new information
print("\n📋 Step 4: Updating load with new information")
print("-"*40)

from src.agents.intake.missing_info_handler import update_incomplete_load

success, updated_load = update_incomplete_load(
    load_id,
    extracted_data,
    f"<response-{uuid.uuid4()}@testshipper.com>"
)

if success:
    print(f"✅ Load updated successfully")
    print(f"   Is complete: {updated_load.get('is_complete')}")
    print(f"   Status: {updated_load.get('status')}")
    if updated_load.get('complexity_flags'):
        print(f"   Complexity flags: {updated_load.get('complexity_flags')}")
else:
    print(f"❌ Failed to update load: {updated_load}")
    exit(1)

# Step 5: Verify load is ready for automation
print("\n📋 Step 5: Verifying load readiness")
print("-"*40)

from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Check final load state
final_response = supabase.table("loads").select("*").eq("id", load_id).single().execute()
if final_response.data:
    final_load = final_response.data
    print(f"✅ Final load state:")
    print(f"   Load number: {final_load.get('load_number')}")
    print(f"   Is complete: {final_load.get('is_complete')}")
    print(f"   Missing fields: {final_load.get('missing_fields', [])}")
    print(f"   Status: {final_load.get('status')}")
    print(f"   Ready for LoadBlast: {final_load.get('is_complete') and not final_load.get('requires_human_review')}")
    
    # Cleanup - delete test load
    print("\n🧹 Cleaning up test data...")
    supabase.table("loads").delete().eq("id", load_id).execute()
    print("✅ Test load deleted")
else:
    print("❌ Could not fetch final load state")

print("\n" + "="*60)
print("✅ WORKFLOW TEST COMPLETED SUCCESSFULLY!")
print("="*60)