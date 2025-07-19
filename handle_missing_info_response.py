# --------------------------- handle_missing_info_response.py ----------------------------
"""
AI-Broker MVP · Missing Information Response Handler

OVERVIEW:
This module handles follow-up emails from shippers providing missing load information.
It works with the intake_graph to resume incomplete load processing after receiving
the requested details.

WORKFLOW:
1. Receive email classified as MISSING_INFO_RESPONSE
2. Extract thread_id or load reference from email
3. Fetch incomplete load from database
4. Extract new information from email
5. Update load with new information
6. Run complexity detection on complete data
7. Mark load as complete if all fields present
8. Trigger LoadBlast if load is complete and passes complexity check

BUSINESS LOGIC:
- Links follow-up emails to original loads via thread tracking
- Merges new information with existing partial data
- Validates completeness before allowing carrier outreach
- Maintains audit trail of all communications

TECHNICAL ARCHITECTURE:
- Integrates with email_intent_classifier for routing
- Uses Supabase for load data persistence
- Leverages LangGraph for stateful processing
- Implements proper error handling for edge cases

DEPENDENCIES:
- Environment variables: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
- Input: Email with thread reference and missing information
- Output: Updated load record ready for processing
"""

# ─── Standard-library imports ───────────────────────────────────────────
import os, json, re, uuid
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime

# ─── Environment setup ─────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

# ─── Third-party imports ────────────────────────────────────────────────
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
import requests
from supabase import create_client, Client

# ─── Internal imports ──────────────────────────────────────────────────
from email_intent_classifier import EmailIntent, classify_email_content
from intake_graph import detect_freight_complexity, REQUIRED

# ╔══════════ 1. Configuration ═══════════════════════════════════════════════════
"""
CONFIGURATION:
Sets up environment variables and API clients for processing missing info responses.
"""

# LLM Configuration
MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
llm = ChatOpenAI(model=MODEL, temperature=0.0)

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# ╔══════════ 2. Load Lookup Functions ═══════════════════════════════════════════
def find_incomplete_load_by_thread(thread_id: str) -> Optional[Dict[str, Any]]:
    """
    Find an incomplete load by thread ID.
    
    BUSINESS LOGIC:
    - Searches for loads with matching thread_id
    - Only returns incomplete loads (is_complete = false)
    - Returns most recent if multiple matches
    
    ARGS:
        thread_id: Thread identifier from email headers
        
    RETURNS:
        Load data dict or None if not found
    """
    try:
        response = supabase.table("loads").select("*").eq("thread_id", thread_id).eq("is_complete", False).order("created_at", desc=True).limit(1).execute()
        
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
        
    except Exception as e:
        print(f"❌ Error finding load by thread: {e}")
        return None

def find_incomplete_load_by_email(shipper_email: str, subject: str) -> Optional[Dict[str, Any]]:
    """
    Find an incomplete load by shipper email and subject context.
    
    BUSINESS LOGIC:
    - Fallback when thread_id is not available
    - Searches by shipper email
    - Uses subject line context for matching
    - Returns most recent incomplete load
    
    ARGS:
        shipper_email: Email address of shipper
        subject: Subject line for context matching
        
    RETURNS:
        Load data dict or None if not found
    """
    try:
        # Search for recent incomplete loads from this shipper
        response = supabase.table("loads").select("*").eq("shipper_email", shipper_email).eq("is_complete", False).order("created_at", desc=True).limit(5).execute()
        
        if not response.data:
            return None
            
        # If only one match, return it
        if len(response.data) == 1:
            return response.data[0]
            
        # Multiple matches - try to match by subject context
        for load in response.data:
            load_number = load.get("load_number", "")
            if load_number and load_number in subject:
                return load
                
        # Return most recent as fallback
        return response.data[0]
        
    except Exception as e:
        print(f"❌ Error finding load by email: {e}")
        return None

# ╔══════════ 3. Information Extraction ═══════════════════════════════════════════
def extract_missing_information(email_body: str, missing_fields: List[str], 
                               existing_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract missing load information from follow-up email.
    
    BUSINESS LOGIC:
    - Uses LLM to extract specific missing fields
    - Merges with existing partial data
    - Validates extracted information
    - Handles various response formats
    
    ARGS:
        email_body: Email content with missing information
        missing_fields: List of fields that were requested
        existing_data: Current partial load data
        
    RETURNS:
        Dict with extracted field values
    """
    # Build context about what we're looking for
    field_descriptions = {
        "origin_zip": "pickup location ZIP code (5 digits)",
        "dest_zip": "delivery location ZIP code (5 digits)",
        "pickup_dt": "pickup date and time",
        "equipment": "equipment type (Van, Flatbed, Reefer, etc.)",
        "weight_lb": "weight in pounds (numeric value)"
    }
    
    # Create targeted extraction prompt
    prompt = f"""Extract the following missing freight information from this email response:

EMAIL CONTENT:
{email_body}

MISSING FIELDS TO EXTRACT:
{json.dumps({field: field_descriptions.get(field, field) for field in missing_fields}, indent=2)}

EXISTING INFORMATION (for context):
{json.dumps({k: v for k, v in existing_data.items() if k in REQUIRED and v is not None}, indent=2)}

Extract ONLY the missing fields from the email. Return a JSON object with the field names as keys.
For pickup_dt, convert to ISO 8601 format (YYYY-MM-DDTHH:MM:SS-TZ).
If a field is not mentioned in the email, do not include it in the output.

Example output format:
{{"dest_zip": "30303", "weight_lb": 25000}}
"""
    
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        
        # Extract JSON from response
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        extracted_data = json.loads(content)
        
        # Validate and clean extracted data
        cleaned_data = {}
        for field, value in extracted_data.items():
            if field in missing_fields and value is not None:
                # Type conversions
                if field == "weight_lb" and isinstance(value, str):
                    # Extract numeric value from strings like "25,000 lbs"
                    value = int(re.sub(r'[^\d]', '', value))
                elif field in ["origin_zip", "dest_zip"] and isinstance(value, (int, float)):
                    value = str(int(value)).zfill(5)
                    
                cleaned_data[field] = value
                
        return cleaned_data
        
    except Exception as e:
        print(f"❌ Error extracting information: {e}")
        return {}

# ╔══════════ 4. Load Update Functions ═══════════════════════════════════════════
def update_incomplete_load(load_id: str, new_data: Dict[str, Any], 
                          email_message_id: str) -> Tuple[bool, Dict[str, Any]]:
    """
    Update an incomplete load with newly provided information.
    
    BUSINESS LOGIC:
    - Merges new data with existing load
    - Checks if all required fields are now present
    - Runs complexity detection on complete data
    - Updates database with new information
    - Maintains email conversation history
    
    ARGS:
        load_id: Database ID of the load to update
        new_data: Newly extracted field values
        email_message_id: Message-ID of the follow-up email
        
    RETURNS:
        Tuple of (success, updated_load_data)
    """
    try:
        # Fetch current load data
        response = supabase.table("loads").select("*").eq("id", load_id).single().execute()
        if not response.data:
            return False, {"error": "Load not found"}
            
        current_load = response.data
        
        # Merge new data with existing
        updated_fields = {}
        for field, value in new_data.items():
            if field in REQUIRED and value is not None:
                updated_fields[field] = value
                
        # Check completeness after update
        all_fields_present = all(
            current_load.get(field) is not None or updated_fields.get(field) is not None 
            for field in REQUIRED
        )
        
        # Prepare update data
        update_data = {
            **updated_fields,
            "latest_message_id": email_message_id,
            "updated_at": datetime.now().isoformat(),
            "is_complete": all_fields_present,
            "follow_up_count": current_load.get("follow_up_count", 0) + 1
        }
        
        # If complete, run complexity detection
        if all_fields_present:
            # Merge all data for complexity check
            complete_load = {**current_load, **updated_fields}
            
            # Extract text for complexity detection
            load_text = f"""
            Origin: {complete_load.get('origin_zip')}
            Destination: {complete_load.get('dest_zip')}
            Equipment: {complete_load.get('equipment')}
            Weight: {complete_load.get('weight_lb')} lbs
            Commodity: {complete_load.get('commodity', 'General Freight')}
            Notes: {complete_load.get('ai_notes', '')}
            """
            
            complexity_flags, complexity_analysis = detect_freight_complexity(load_text)
            
            update_data.update({
                "complexity_flags": complexity_flags,
                "complexity_analysis": complexity_analysis,
                "requires_human_review": len(complexity_flags) > 0,
                "missing_fields": []  # Clear missing fields
            })
        else:
            # Still missing some fields
            still_missing = [
                field for field in REQUIRED 
                if current_load.get(field) is None and updated_fields.get(field) is None
            ]
            update_data["missing_fields"] = still_missing
            
        # Update email conversation history
        conversation = current_load.get("email_conversation", [])
        conversation.append({
            "timestamp": datetime.now().isoformat(),
            "direction": "inbound",
            "message_id": email_message_id,
            "type": "missing_info_provided",
            "fields_provided": list(new_data.keys())
        })
        update_data["email_conversation"] = conversation
        
        # Execute update
        update_response = supabase.table("loads").update(update_data).eq("id", load_id).execute()
        
        if update_response.data:
            updated_load = update_response.data[0]
            print(f"✅ Updated load {updated_load.get('load_number')} with new information")
            
            if all_fields_present:
                print(f"   📋 Load is now complete!")
                if update_data.get("requires_human_review"):
                    print(f"   ⚠️  Complexity detected: {', '.join(complexity_flags)}")
                    print(f"   🔒 Requires human review before carrier outreach")
                else:
                    print(f"   ✅ Ready for LoadBlast automation")
                    
            else:
                print(f"   ❓ Still missing: {', '.join(still_missing)}")
                
            return True, updated_load
            
        return False, {"error": "Update failed"}
        
    except Exception as e:
        print(f"❌ Error updating load: {e}")
        return False, {"error": str(e)}

# ╔══════════ 5. Main Handler Function ═══════════════════════════════════════════
def handle_missing_info_response(email_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main handler for processing missing information response emails.
    
    WORKFLOW:
    1. Classify email to confirm it's a missing info response
    2. Find the associated incomplete load
    3. Extract the provided information
    4. Update the load with new data
    5. Check completeness and complexity
    6. Trigger next steps if complete
    
    ARGS:
        email_data: Dict containing:
            - subject: Email subject line
            - body: Email body content
            - from: Sender email address
            - message_id: Email Message-ID
            - in_reply_to: Reference to original email
            - thread_id: Thread identifier (if available)
            
    RETURNS:
        Dict with processing results and status
    """
    print("\n🔄 Processing potential missing information response...")
    
    # Extract email components
    subject = email_data.get("subject", "")
    body = email_data.get("body", "")
    sender_email = email_data.get("from", "")
    message_id = email_data.get("message_id", "")
    thread_id = email_data.get("thread_id", "")
    
    # Step 1: Verify this is a missing info response
    classification = classify_email_content(subject, body, sender_email)
    
    if classification.intent != EmailIntent.MISSING_INFO_RESPONSE:
        return {
            "success": False,
            "reason": f"Email classified as {classification.intent.value}, not MISSING_INFO_RESPONSE",
            "confidence": classification.confidence
        }
        
    print(f"✅ Confirmed missing info response (confidence: {classification.confidence:.2f})")
    
    # Step 2: Find the associated incomplete load
    incomplete_load = None
    
    # Try thread ID first
    if thread_id:
        incomplete_load = find_incomplete_load_by_thread(thread_id)
        if incomplete_load:
            print(f"   Found load by thread ID: {incomplete_load.get('load_number')}")
            
    # Fallback to email/subject matching
    if not incomplete_load and sender_email:
        incomplete_load = find_incomplete_load_by_email(sender_email, subject)
        if incomplete_load:
            print(f"   Found load by email match: {incomplete_load.get('load_number')}")
            
    if not incomplete_load:
        return {
            "success": False,
            "reason": "Could not find associated incomplete load",
            "sender": sender_email
        }
        
    # Step 3: Extract the missing information
    missing_fields = incomplete_load.get("missing_fields", [])
    if not missing_fields:
        return {
            "success": False,
            "reason": "Load has no missing fields recorded",
            "load_id": incomplete_load.get("id")
        }
        
    print(f"   Extracting missing fields: {', '.join(missing_fields)}")
    extracted_data = extract_missing_information(body, missing_fields, incomplete_load)
    
    if not extracted_data:
        return {
            "success": False,
            "reason": "Could not extract any missing information from email",
            "load_id": incomplete_load.get("id")
        }
        
    print(f"   Extracted: {json.dumps(extracted_data, indent=2)}")
    
    # Step 4: Update the load
    success, updated_load = update_incomplete_load(
        incomplete_load["id"], 
        extracted_data,
        message_id
    )
    
    if not success:
        return {
            "success": False,
            "reason": "Failed to update load",
            "error": updated_load.get("error"),
            "load_id": incomplete_load.get("id")
        }
        
    # Step 5: Prepare response
    result = {
        "success": True,
        "load_id": updated_load.get("id"),
        "load_number": updated_load.get("load_number"),
        "fields_updated": list(extracted_data.keys()),
        "is_complete": updated_load.get("is_complete", False),
        "requires_human_review": updated_load.get("requires_human_review", False)
    }
    
    if updated_load.get("is_complete"):
        result["next_action"] = "ready_for_loadblast" if not updated_load.get("requires_human_review") else "needs_human_review"
    else:
        result["still_missing"] = updated_load.get("missing_fields", [])
        result["next_action"] = "awaiting_more_info"
        
    return result

# ╔══════════ 6. Integration with Intake Workflow ═══════════════════════════════════
def process_email_with_intent(email_path: str) -> Dict[str, Any]:
    """
    Process an email through the appropriate workflow based on intent.
    
    ROUTING LOGIC:
    - LOAD_TENDER → intake_graph.py
    - MISSING_INFO_RESPONSE → handle_missing_info_response()
    - Others → logged and skipped
    
    ARGS:
        email_path: Path to .eml file
        
    RETURNS:
        Processing result dict
    """
    import email
    from pathlib import Path
    
    # Parse email
    msg = email.message_from_bytes(Path(email_path).read_bytes())
    
    # Extract email data
    email_data = {
        "subject": msg.get("Subject", ""),
        "from": msg.get("From", ""),
        "message_id": msg.get("Message-ID", ""),
        "in_reply_to": msg.get("In-Reply-To", ""),
        "thread_id": msg.get("X-Thread-ID", "")  # Custom header if using
    }
    
    # Extract body
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                break
    else:
        body = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", errors="replace")
        
    email_data["body"] = body
    
    # Classify intent
    classification = classify_email_content(
        email_data["subject"], 
        email_data["body"], 
        email_data["from"]
    )
    
    print(f"\n📧 Email Classification: {classification.intent.value} (confidence: {classification.confidence:.2f})")
    
    # Route based on intent
    if classification.intent == EmailIntent.LOAD_TENDER:
        # Process as new load
        from intake_graph import agent, parse_email_with_headers
        email_parsed = parse_email_with_headers(Path(email_path))
        
        run_id = f"intake-{uuid.uuid4()}"
        agent.invoke(
            {
                "raw_text": email_parsed["body"],
                "email_from": email_parsed["from"],
                "email_message_id": email_parsed["message_id"],
                "email_subject": email_parsed["subject"]
            },
            config={"thread_id": run_id}
        )
        return {"intent": "LOAD_TENDER", "processed": True}
        
    elif classification.intent == EmailIntent.MISSING_INFO_RESPONSE:
        # Process as missing info response
        result = handle_missing_info_response(email_data)
        return {"intent": "MISSING_INFO_RESPONSE", **result}
        
    else:
        # Log and skip
        print(f"   ⏭️  Skipping email - not a load tender or missing info response")
        return {"intent": classification.intent.value, "processed": False}

# ╔══════════ 7. Testing and Examples ═══════════════════════════════════════════
if __name__ == "__main__":
    # Example usage
    import sys
    
    if len(sys.argv) > 1:
        # Process email file
        result = process_email_with_intent(sys.argv[1])
        print(f"\n📊 Processing Result: {json.dumps(result, indent=2)}")
    else:
        # Test missing info extraction
        test_email = """
        Thanks for reaching out. Here's the information you requested:
        
        The delivery zip code is 30303 (Atlanta area).
        The total weight is 25,000 pounds.
        
        Let me know if you need anything else!
        """
        
        test_missing = ["dest_zip", "weight_lb"]
        test_existing = {"origin_zip": "90210", "equipment": "Van"}
        
        extracted = extract_missing_information(test_email, test_missing, test_existing)
        print(f"Test extraction result: {json.dumps(extracted, indent=2)}")

# ======================== ARCHITECTURE NOTES ========================
"""
INTEGRATION POINTS:
1. Email webhook receives reply → check In-Reply-To header
2. Route to this handler if MISSING_INFO_RESPONSE
3. Update load and check completeness
4. Trigger LoadBlast if complete and approved
5. Send another request if still missing info

SCALING CONSIDERATIONS:
- Cache incomplete loads for faster lookups
- Implement retry logic for failed updates
- Add metrics for response time tracking
- Consider batch processing for high volume

FUTURE ENHANCEMENTS:
- Natural language acknowledgments
- Smart field inference from context
- Automated follow-up reminders
- Multi-language support
"""