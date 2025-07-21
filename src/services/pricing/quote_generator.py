# --------------------------- quote_generator.py ----------------------------
"""
AI-Broker MVP · Automated Quote Generator (LangGraph Integration)

OVERVIEW:
This module integrates with the intake workflow to automatically generate
and send freight quotes to shippers. It bridges the gap between load intake
and the pricing engine, providing a seamless quoting experience.

WORKFLOW:
1. Triggered after successful load intake
2. Calls pricing engine to calculate rates
3. Generates professional quote documents
4. Sends quotes via email (Resend API)
5. Tracks quote status and expiration

BUSINESS LOGIC:
- Automatic quoting for high-confidence loads
- Manual review for complex or high-value loads
- Quote expiration and follow-up reminders
- Multiple quote formats (email, PDF future)
- Integration with CRM for tracking

TECHNICAL ARCHITECTURE:
- Event-driven architecture via database triggers
- Asynchronous processing for scalability
- Template-based quote generation
- Comprehensive audit logging

DEPENDENCIES:
- pricing_engine.py for rate calculation
- Resend API for email delivery
- Supabase for data storage
- Input: Load ID from intake workflow
- Output: Sent quotes tracked in database
"""

# ─── Standard-library imports ───────────────────────────────────────────
import os, json, uuid
from typing import Dict, Optional
from datetime import datetime, timedelta

# ─── Environment setup ─────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

# ─── Third-party imports ────────────────────────────────────────────────
from supabase import create_client, Client
import resend

# ─── Local imports ──────────────────────────────────────────────────────
from src.services.pricing.engine import PricingEngine, generate_quote_email

# ╔══════════ 1. Configuration ═══════════════════════════════════════

# Initialize Resend client
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

# Business configuration
QUOTE_VALIDITY_HOURS = 24
AUTO_QUOTE_CONFIDENCE_THRESHOLD = 0.85

# ╔══════════ 2. Quote Generation Functions ═══════════════════════════════════════

def should_auto_quote(load_data: dict) -> bool:
    """
    Determine if a load should receive automatic quoting.
    
    BUSINESS RULES:
    - High extraction confidence (>85%)
    - No complex freight flags
    - Complete load information
    - Not marked for human review
    
    ARGS:
        load_data: Load dictionary from database
        
    RETURNS:
        bool: True if should auto-quote
    """
    
    # Check extraction confidence
    confidence = load_data.get("extraction_confidence", 0.0)
    if confidence < AUTO_QUOTE_CONFIDENCE_THRESHOLD:
        return False
    
    # Check for complexity flags
    complexity_flags = load_data.get("complexity_flags", [])
    if complexity_flags:
        return False
    
    # Check for human review flag
    if load_data.get("requires_human_review", False):
        return False
    
    # Check if load is complete
    if not load_data.get("is_complete", True):
        return False
    
    return True

def generate_and_send_quote(load_id: str) -> Dict[str, any]:
    """
    Generate and send a quote for a specific load.
    
    PROCESS:
    1. Fetch load details from database
    2. Check if auto-quoting is appropriate
    3. Calculate pricing using pricing engine
    4. Generate quote email content
    5. Send email via Resend
    6. Update database with quote status
    
    ARGS:
        load_id: Database ID of the load
        
    RETURNS:
        Dict with success status and details
    """
    
    try:
        # Fetch load from database
        load_result = supabase.table("loads").select("*").eq("id", load_id).single().execute()
        
        if not load_result.data:
            return {"success": False, "error": "Load not found"}
        
        load_data = load_result.data
        
        # Check if we should auto-quote
        if not should_auto_quote(load_data):
            print(f"Load {load_id} requires manual review before quoting")
            return {
                "success": False, 
                "error": "Manual review required",
                "reason": "Low confidence or complex freight"
            }
        
        # Initialize pricing engine and calculate quote
        pricing_engine = PricingEngine()
        pricing_result = pricing_engine.calculate_quote(load_data)
        
        if pricing_result.confidence_score < 0.7:
            return {
                "success": False,
                "error": "Pricing confidence too low",
                "confidence": pricing_result.confidence_score
            }
        
        # Generate email content
        email_body = generate_quote_email(load_data, pricing_result)
        
        # Get shipper email
        shipper_email = load_data.get("shipper_email")
        if not shipper_email:
            return {"success": False, "error": "No shipper email available"}
        
        # Send quote email
        if RESEND_API_KEY:
            try:
                # Generate unique Message-ID for threading
                message_id = f"<quote-{uuid.uuid4()}@ai-broker.com>"
                
                # Prepare email parameters
                email_params = {
                    "from": "quotes@ai-broker.com",
                    "to": [shipper_email],
                    "subject": f"Freight Quote - {load_data.get('origin_city')} to {load_data.get('dest_city')}",
                    "text": email_body,
                    "headers": {
                        "Message-ID": message_id,
                        "In-Reply-To": load_data.get("original_message_id", ""),
                        "References": load_data.get("original_message_id", "")
                    },
                    "tags": [
                        {"name": "type", "value": "quote"},
                        {"name": "load_id", "value": load_id}
                    ]
                }
                
                # Send email
                email_result = resend.Emails.send(email_params)
                
                print(f"✉️ Quote sent to {shipper_email}")
                print(f"   Rate: ${pricing_result.recommended_quote_to_shipper}")
                print(f"   Validity: {QUOTE_VALIDITY_HOURS} hours")
                
                # Update database with quote details
                quote_data = {
                    "load_id": load_id,
                    "shipper_email": shipper_email,
                    "quoted_rate": str(pricing_result.recommended_quote_to_shipper),
                    "carrier_rate": str(pricing_result.total_rate),
                    "rate_per_mile": str(pricing_result.rate_per_mile),
                    "total_miles": pricing_result.total_miles,
                    "margin_percentage": pricing_result.margin_percentage,
                    "confidence_score": pricing_result.confidence_score,
                    "market_condition": pricing_result.market_condition.value,
                    "pricing_notes": pricing_result.pricing_notes,
                    "email_message_id": message_id,
                    "sent_at": datetime.now().isoformat(),
                    "valid_until": (datetime.now() + timedelta(hours=QUOTE_VALIDITY_HOURS)).isoformat(),
                    "status": "sent"
                }
                
                quote_result = supabase.table("quotes").insert(quote_data).execute()
                
                # Update load status
                supabase.table("loads").update({
                    "status": "QUOTED",
                    "quoted_at": datetime.now().isoformat(),
                    "quote_id": quote_result.data[0]["id"] if quote_result.data else None
                }).eq("id", load_id).execute()
                
                return {
                    "success": True,
                    "quote_id": quote_result.data[0]["id"] if quote_result.data else None,
                    "quoted_rate": str(pricing_result.recommended_quote_to_shipper),
                    "sent_to": shipper_email,
                    "message": "Quote sent successfully"
                }
                
            except Exception as e:
                print(f"❌ Failed to send quote email: {e}")
                return {"success": False, "error": f"Email send failed: {str(e)}"}
        else:
            print("⚠️ Resend not configured - quote not sent")
            return {"success": False, "error": "Email service not configured"}
            
    except Exception as e:
        print(f"❌ Error generating quote: {e}")
        return {"success": False, "error": f"Quote generation failed: {str(e)}"}

def process_pending_quotes():
    """
    Process all loads that need quotes.
    
    BATCH PROCESSING:
    Called periodically to quote any loads that are ready
    but haven't been quoted yet.
    """
    
    try:
        # Find loads that need quoting
        result = supabase.table("loads").select("id").eq(
            "status", "NEW_RFQ"
        ).eq(
            "is_complete", True
        ).is_(
            "quoted_at", "null"
        ).execute()
        
        if result.data:
            print(f"Found {len(result.data)} loads to quote")
            
            for load in result.data:
                print(f"\nProcessing load {load['id']}...")
                quote_result = generate_and_send_quote(load['id'])
                
                if quote_result["success"]:
                    print(f"✅ Quote sent successfully")
                else:
                    print(f"❌ Quote failed: {quote_result.get('error')}")
        else:
            print("No pending loads to quote")
            
    except Exception as e:
        print(f"❌ Error processing pending quotes: {e}")

# ╔══════════ 3. Integration with Intake Workflow ═══════════════════════════════════════

def quote_after_intake(load_id: str, intake_result: dict) -> Dict[str, any]:
    """
    Called after successful load intake to generate quote.
    
    INTEGRATION POINT:
    This function is called by intake_graph.py after a load
    is successfully saved to the database.
    
    ARGS:
        load_id: Database ID of newly created load
        intake_result: Result from intake workflow
        
    RETURNS:
        Dict with quote generation result
    """
    
    # Check if load requires human review
    if intake_result.get("requires_human_review", False):
        print(f"Load {load_id} marked for human review - skipping auto-quote")
        return {
            "success": False,
            "skipped": True,
            "reason": "Human review required"
        }
    
    # Check for missing fields
    missing_fields = intake_result.get("missing_fields", [])
    if missing_fields:
        print(f"Load {load_id} has missing fields - skipping auto-quote")
        return {
            "success": False,
            "skipped": True,
            "reason": f"Missing fields: {', '.join(missing_fields)}"
        }
    
    # Generate and send quote
    return generate_and_send_quote(load_id)

# ╔══════════ 4. Command Line Interface ═══════════════════════════════════════

def main():
    """
    CLI for testing quote generation.
    
    USAGE:
        python quote_generator.py [load_id]
        python quote_generator.py --batch
    """
    
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--batch":
        print("🔄 Processing pending quotes...")
        process_pending_quotes()
    elif len(sys.argv) > 1:
        load_id = sys.argv[1]
        print(f"💰 Generating quote for load {load_id}...")
        
        result = generate_and_send_quote(load_id)
        print("\nResult:")
        print(json.dumps(result, indent=2))
    else:
        print("Usage: python quote_generator.py [load_id]")
        print("   or: python quote_generator.py --batch")

if __name__ == "__main__":
    main()

# ╔══════════ FUTURE ENHANCEMENTS ═══════════════════════════════════════
"""
FUTURE ENHANCEMENTS:

1. MULTI-CHANNEL QUOTING:
   - SMS quotes for urgent loads
   - Web portal quote access
   - API for programmatic access

2. QUOTE TEMPLATES:
   - Customer-specific templates
   - Multi-language support
   - PDF generation with branding

3. ADVANCED FEATURES:
   - Volume quoting (multiple loads)
   - Spot vs contract pricing
   - Dynamic pricing based on capacity
   - Competitive intelligence integration

4. ANALYTICS:
   - Quote-to-book conversion tracking
   - Price elasticity analysis
   - Win/loss analysis by lane
   - Customer lifetime value optimization

5. AUTOMATION:
   - Auto-follow-up on expired quotes
   - Price matching workflows
   - Seasonal pricing adjustments
   - Customer negotiation patterns
"""
# --------------------------- end of file ------------------------------