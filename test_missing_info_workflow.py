#!/usr/bin/env python3
# --------------------------- test_missing_info_workflow.py ----------------------------
"""
AI-Broker MVP · Missing Information Workflow Test Suite

OVERVIEW:
This test suite validates the complete missing information handling workflow,
from initial incomplete load creation through follow-up email processing.

TEST SCENARIOS:
1. Create incomplete load with missing fields
2. Verify email is sent requesting missing information
3. Simulate shipper response with missing data
4. Verify load is updated and marked complete
5. Check complexity detection on complete load
6. Verify LoadBlast readiness based on complexity

BUSINESS VALIDATION:
- Ensures incomplete loads don't reach carriers
- Validates email communication flow
- Tests data merging and validation
- Confirms complexity detection on completion
- Verifies proper status transitions
"""

import os, json, uuid, time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List

# Load environment
from dotenv import load_dotenv
load_dotenv()

# ╔══════════ 1. Test Data Generators ═══════════════════════════════════════════
def create_incomplete_load_email() -> str:
    """
    Generate test email with missing required fields.
    Missing: dest_zip, weight_lb
    """
    return f"""From: test_shipper@example.com
To: loads@ai-broker.com
Subject: Urgent Load - Dallas to ???
Message-ID: <test-{uuid.uuid4()}@example.com>
Date: {datetime.now().strftime('%a, %d %b %Y %H:%M:%S +0000')}

Hi,

I need a truck for an urgent shipment.

Pickup: Dallas, TX 75201
Pickup Date: {(datetime.now() + timedelta(days=2)).strftime('%B %d at 2:00 PM')}
Equipment: Dry Van

This is time sensitive. Please quote ASAP.

Thanks,
Test Shipper
"""

def create_missing_info_response(thread_id: str, original_message_id: str) -> str:
    """
    Generate follow-up email with missing information.
    Provides: dest_zip, weight_lb
    """
    return f"""From: test_shipper@example.com
To: loads@ai-broker.com
Subject: Re: Your load request - Additional Information Needed
Message-ID: <response-{uuid.uuid4()}@example.com>
In-Reply-To: {original_message_id}
References: {original_message_id}
X-Thread-ID: {thread_id}
Date: {datetime.now().strftime('%a, %d %b %Y %H:%M:%S +0000')}

Thanks for getting back to me.

The delivery is going to Atlanta, GA 30303.
Total weight is 25,000 pounds.

Let me know if you need anything else.

Best,
Test Shipper
"""

def create_complex_missing_info_response(thread_id: str, original_message_id: str) -> str:
    """
    Generate follow-up with missing info that triggers complexity.
    Provides: dest_zip (port location), weight_lb (overweight)
    """
    return f"""From: test_shipper@example.com
To: loads@ai-broker.com
Subject: Re: Your load request - Additional Information Needed
Message-ID: <complex-response-{uuid.uuid4()}@example.com>
In-Reply-To: {original_message_id}
References: {original_message_id}
X-Thread-ID: {thread_id}
Date: {datetime.now().strftime('%a, %d %b %Y %H:%M:%S +0000')}

Sorry for the delay. Here's the missing information:

Delivery: Port of Long Beach, CA 90802
Weight: 85,000 lbs (it's heavy machinery)

This will need permits for overweight. Also, it's going to the rail terminal
for intermodal transport to Chicago.

Thanks,
Test Shipper
"""

# ╔══════════ 2. Test Execution Functions ═══════════════════════════════════════
def save_test_email(content: str, filename: str) -> Path:
    """Save test email content to .eml file."""
    test_dir = Path("test_emails")
    test_dir.mkdir(exist_ok=True)
    
    filepath = test_dir / filename
    filepath.write_text(content)
    return filepath

def run_intake_test(email_path: Path) -> Dict[str, Any]:
    """Run intake_graph.py on test email and capture results."""
    import subprocess
    
    print(f"\n🧪 Running intake agent on {email_path.name}...")
    
    result = subprocess.run(
        ["python", "intake_graph.py", str(email_path)],
        capture_output=True,
        text=True
    )
    
    print("STDOUT:", result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)
        
    # Parse output for key information
    output_data = {
        "success": result.returncode == 0,
        "missing_fields": [],
        "email_sent": False,
        "load_saved": False
    }
    
    # Extract missing fields
    for line in result.stdout.split('\n'):
        if "❓ Need:" in line:
            # Extract missing fields from output
            fields_str = line.split("Need:")[1].strip()
            output_data["missing_fields"] = eval(fields_str) if fields_str.startswith('[') else []
        elif "✉️  Sent missing info request" in line:
            output_data["email_sent"] = True
        elif "✅ Saved incomplete load:" in line:
            output_data["load_saved"] = True
            
    return output_data

def run_missing_info_handler(email_path: Path) -> Dict[str, Any]:
    """Run missing info handler on follow-up email."""
    from handle_missing_info_response import process_email_with_intent
    
    print(f"\n🧪 Processing follow-up email {email_path.name}...")
    
    result = process_email_with_intent(str(email_path))
    return result

def check_load_in_database(shipper_email: str) -> Dict[str, Any]:
    """Query database for load status."""
    from supabase import create_client
    
    supabase = create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_ANON_KEY")
    )
    
    # Find most recent load from this shipper
    response = supabase.table("loads").select("*")\
        .eq("shipper_email", shipper_email)\
        .order("created_at", desc=True)\
        .limit(1)\
        .execute()
        
    if response.data:
        load = response.data[0]
        return {
            "found": True,
            "load_number": load.get("load_number"),
            "is_complete": load.get("is_complete"),
            "missing_fields": load.get("missing_fields", []),
            "complexity_flags": load.get("complexity_flags", []),
            "requires_human_review": load.get("requires_human_review"),
            "thread_id": load.get("thread_id"),
            "status": load.get("status")
        }
    return {"found": False}

# ╔══════════ 3. Main Test Suite ═══════════════════════════════════════════════
def test_complete_workflow():
    """
    Test the complete missing information workflow end-to-end.
    """
    print("\n" + "="*80)
    print("🧪 MISSING INFORMATION WORKFLOW TEST SUITE")
    print("="*80)
    
    # Test 1: Create incomplete load
    print("\n📋 TEST 1: Create Incomplete Load")
    print("-" * 40)
    
    initial_email = create_incomplete_load_email()
    initial_path = save_test_email(initial_email, "test_incomplete_load.eml")
    
    intake_result = run_intake_test(initial_path)
    
    assert intake_result["success"], "Intake processing failed"
    assert intake_result["missing_fields"] == ["dest_zip", "weight_lb"], \
        f"Expected missing fields [dest_zip, weight_lb], got {intake_result['missing_fields']}"
    assert intake_result["email_sent"], "Missing info email not sent"
    assert intake_result["load_saved"], "Incomplete load not saved"
    
    print("✅ Incomplete load created successfully")
    print(f"   Missing fields: {intake_result['missing_fields']}")
    
    # Give database time to update
    time.sleep(2)
    
    # Check database
    db_check = check_load_in_database("test_shipper@example.com")
    assert db_check["found"], "Load not found in database"
    assert not db_check["is_complete"], "Load incorrectly marked as complete"
    
    thread_id = db_check["thread_id"]
    print(f"   Thread ID: {thread_id}")
    
    # Test 2: Process follow-up with missing info
    print("\n📋 TEST 2: Process Missing Info Response")
    print("-" * 40)
    
    # Simulate the message ID that would have been sent
    request_message_id = f"<request-{uuid.uuid4()}@ai-broker.com>"
    
    response_email = create_missing_info_response(thread_id, request_message_id)
    response_path = save_test_email(response_email, "test_missing_info_response.eml")
    
    handler_result = run_missing_info_handler(response_path)
    
    assert handler_result.get("success"), f"Handler failed: {handler_result}"
    assert handler_result.get("is_complete"), "Load not marked complete after update"
    
    print("✅ Missing information processed successfully")
    print(f"   Fields updated: {handler_result.get('fields_updated', [])}")
    print(f"   Load complete: {handler_result.get('is_complete')}")
    print(f"   Requires review: {handler_result.get('requires_human_review')}")
    
    # Test 3: Verify load is ready for LoadBlast
    print("\n📋 TEST 3: Verify Load Ready for Automation")
    print("-" * 40)
    
    time.sleep(2)
    final_check = check_load_in_database("test_shipper@example.com")
    
    assert final_check["is_complete"], "Load not complete in database"
    assert final_check["missing_fields"] == [], "Still has missing fields"
    assert final_check["status"] == "NEW_RFQ", f"Wrong status: {final_check['status']}"
    
    print("✅ Load ready for LoadBlast automation")
    print(f"   Status: {final_check['status']}")
    
    # Test 4: Complex load with missing info
    print("\n📋 TEST 4: Complex Load Completion")
    print("-" * 40)
    
    # Create new incomplete load
    complex_initial = create_incomplete_load_email().replace(
        "test_shipper@example.com", 
        "complex_shipper@example.com"
    )
    complex_path = save_test_email(complex_initial, "test_complex_incomplete.eml")
    
    run_intake_test(complex_path)
    time.sleep(2)
    
    complex_db = check_load_in_database("complex_shipper@example.com")
    complex_thread_id = complex_db["thread_id"]
    
    # Send complex response
    complex_response = create_complex_missing_info_response(
        complex_thread_id, 
        request_message_id
    )
    complex_response_path = save_test_email(
        complex_response, 
        "test_complex_response.eml"
    )
    
    complex_result = run_missing_info_handler(complex_response_path)
    
    assert complex_result.get("success"), "Complex handler failed"
    assert complex_result.get("is_complete"), "Complex load not complete"
    assert complex_result.get("requires_human_review"), \
        "Complex load not flagged for review"
    
    print("✅ Complex load detected correctly")
    print(f"   Requires human review: {complex_result.get('requires_human_review')}")
    
    # Final database check
    time.sleep(2)
    complex_final = check_load_in_database("complex_shipper@example.com")
    
    assert complex_final["requires_human_review"], "Not flagged in database"
    assert complex_final["status"] == "NEEDS_REVIEW", \
        f"Wrong status for complex load: {complex_final['status']}"
    assert len(complex_final["complexity_flags"]) > 0, "No complexity flags set"
    
    print(f"   Complexity flags: {complex_final['complexity_flags']}")
    print(f"   Status: {complex_final['status']}")
    
    # Cleanup
    print("\n🧹 Cleaning up test files...")
    for file in Path("test_emails").glob("test_*.eml"):
        file.unlink()
        
    print("\n" + "="*80)
    print("✅ ALL TESTS PASSED!")
    print("="*80)

# ╔══════════ 4. Individual Test Functions ═══════════════════════════════════════
def test_email_classification():
    """Test that emails are classified correctly."""
    from email_intent_classifier import classify_email_content, EmailIntent
    
    print("\n🧪 Testing Email Classification...")
    
    # Test new load
    new_load = classify_email_content(
        "Need truck Dallas to Houston",
        "Pickup tomorrow, 25000 lbs, dry van",
        "shipper@example.com"
    )
    assert new_load.intent == EmailIntent.LOAD_TENDER
    print(f"✅ New load classified correctly: {new_load.intent.value}")
    
    # Test missing info response
    missing_info = classify_email_content(
        "Re: Additional Information Needed",
        "The delivery zip is 30303 and weight is 25000 lbs",
        "shipper@example.com"
    )
    assert missing_info.intent == EmailIntent.MISSING_INFO_RESPONSE
    print(f"✅ Missing info response classified correctly: {missing_info.intent.value}")

def test_information_extraction():
    """Test extraction of missing fields from email."""
    from handle_missing_info_response import extract_missing_information
    
    print("\n🧪 Testing Information Extraction...")
    
    email_body = """
    Thanks for reaching out. Here's what you need:
    
    - Delivery location: Atlanta, GA 30303
    -