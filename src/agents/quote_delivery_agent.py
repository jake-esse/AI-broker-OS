# --------------------------- src/agents/quote_delivery_agent.py ----------------------------
"""
AI-Broker MVP · Automated Quote Delivery Agent (LangGraph)

OVERVIEW:
LangGraph agent that automatically generates and delivers quotes after
successful load intake. Integrates pricing engine with multi-channel
delivery for seamless quoting workflow.

WORKFLOW:
1. Triggered by successful load intake
2. Validate load completeness
3. Calculate pricing
4. Generate professional quote
5. Deliver through appropriate channels
6. Track delivery and engagement

BUSINESS LOGIC:
- Automatic quotes for complete loads
- Skip quotes for incomplete data
- Professional presentation
- Multi-channel delivery
- Engagement tracking
- Follow-up scheduling

TECHNICAL ARCHITECTURE:
- LangGraph state machine
- Event-driven triggers
- Async delivery
- Comprehensive tracking

DEPENDENCIES:
- pricing.engine for calculations
- quote_management for delivery
- Supabase for persistence
"""

import os
import sys
import json
import uuid
from typing import Dict, List, Optional
from typing_extensions import TypedDict
from datetime import datetime
from pathlib import Path
import logging

from dotenv import load_dotenv
from langgraph.graph import StateGraph
from supabase import create_client, Client

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent.parent))

from src.services.pricing.engine import PricingEngine
from src.services.quote_management import QuoteManager, DeliveryChannel

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class QuoteDeliveryState(TypedDict):
    """
    State for quote delivery workflow.
    
    FIELDS:
    - load_id: Database ID of the load
    - load_data: Complete load information
    - validation_passed: Whether load is ready for quoting
    - pricing_result: Calculated pricing
    - quote_id: Generated quote ID
    - delivery_results: Results from each channel
    - errors: Any errors encountered
    """
    load_id: str
    load_data: Optional[Dict]
    validation_passed: bool
    validation_notes: List[str]
    pricing_result: Optional[Dict]
    quote_id: Optional[str]
    quote_number: Optional[str]
    delivery_results: Dict[str, Dict]
    errors: List[str]
    metadata: Dict


# Initialize services
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
supabase: Optional[Client] = None

if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)

pricing_engine = PricingEngine()
quote_manager = QuoteManager()


# ╔══════════ Node Functions ═══════════════════════════════════════

def fetch_load(state: QuoteDeliveryState) -> Dict:
    """
    Fetch load data from database.
    
    VALIDATION:
    - Load must exist
    - Status must be appropriate for quoting
    - Must have shipper contact info
    """
    load_id = state.get("load_id")
    if not load_id:
        return {"errors": ["No load ID provided"]}
    
    try:
        if supabase:
            result = supabase.table("loads").select("*").eq("id", load_id).single().execute()
            load_data = result.data
        else:
            # Test data
            load_data = {
                "id": load_id,
                "origin_city": "Dallas",
                "origin_state": "TX", 
                "origin_zip": "75201",
                "dest_city": "Houston",
                "dest_state": "TX",
                "dest_zip": "77002",
                "equipment": "Van",
                "weight_lb": 25000,
                "pickup_dt": datetime.now().isoformat(),
                "shipper_email": "test@example.com",
                "status": "NEW_RFQ"
            }
        
        logger.info(f"Fetched load {load_id}: {load_data.get('origin_city')} to {load_data.get('dest_city')}")
        
        return {
            "load_data": load_data,
            "metadata": {
                "fetch_time": datetime.now().isoformat(),
                "load_status": load_data.get("status")
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch load: {e}")
        return {"errors": [f"Failed to fetch load: {str(e)}"]}


def validate_for_quoting(state: QuoteDeliveryState) -> Dict:
    """
    Validate load is ready for quoting.
    
    VALIDATION RULES:
    - All required fields present
    - Valid shipper contact info
    - Appropriate load status
    - Not already quoted recently
    """
    load_data = state.get("load_data")
    validation_notes = []
    validation_passed = True
    
    if not load_data:
        return {
            "validation_passed": False,
            "validation_notes": ["No load data available"]
        }
    
    # Check required fields
    required_fields = [
        "origin_city", "origin_state", "dest_city", "dest_state",
        "equipment", "weight_lb", "pickup_dt"
    ]
    
    missing_fields = []
    for field in required_fields:
        if not load_data.get(field):
            missing_fields.append(field)
    
    if missing_fields:
        validation_passed = False
        validation_notes.append(f"Missing required fields: {', '.join(missing_fields)}")
    
    # Check shipper contact
    if not load_data.get("shipper_email"):
        validation_passed = False
        validation_notes.append("No shipper email - cannot send quote")
    
    # Check load status
    status = load_data.get("status", "")
    if status not in ["NEW_RFQ", "QUOTE_REQUESTED"]:
        validation_notes.append(f"Load status '{status}' may not need quoting")
    
    # Check for recent quotes
    if supabase and validation_passed:
        try:
            # Check if quoted in last hour
            one_hour_ago = datetime.now().isoformat()
            recent_quotes = supabase.table("quotes").select("id").eq(
                "load_id", load_data["id"]
            ).gte("created_at", one_hour_ago).execute()
            
            if recent_quotes.data:
                validation_passed = False
                validation_notes.append(f"Already quoted {len(recent_quotes.data)} times in last hour")
        except:
            pass
    
    logger.info(f"Validation {'passed' if validation_passed else 'failed'}: {validation_notes}")
    
    return {
        "validation_passed": validation_passed,
        "validation_notes": validation_notes
    }


def calculate_pricing(state: QuoteDeliveryState) -> Dict:
    """
    Calculate pricing for the load.
    
    PRICING PROCESS:
    - Use pricing engine
    - Apply business rules
    - Generate confidence score
    """
    if not state.get("validation_passed"):
        return {}
    
    load_data = state.get("load_data")
    
    try:
        # Calculate quote
        pricing_result = pricing_engine.calculate_quote(load_data)
        
        logger.info(
            f"Pricing calculated: ${pricing_result.recommended_quote_to_shipper} "
            f"({pricing_result.total_miles} miles @ ${pricing_result.rate_per_mile}/mile)"
        )
        
        return {
            "pricing_result": pricing_result.to_dict(),
            "metadata": {
                **state.get("metadata", {}),
                "pricing_confidence": pricing_result.confidence_score,
                "market_condition": pricing_result.market_condition.value
            }
        }
        
    except Exception as e:
        logger.error(f"Pricing calculation failed: {e}")
        return {"errors": [f"Pricing failed: {str(e)}"]}


def generate_and_send_quote(state: QuoteDeliveryState) -> Dict:
    """
    Generate and send quote through configured channels.
    
    DELIVERY PROCESS:
    - Create quote record
    - Generate templates
    - Send via email/SMS
    - Track delivery
    """
    if not state.get("pricing_result"):
        return {}
    
    load_id = state.get("load_id")
    
    try:
        # Determine delivery channels
        channels = [DeliveryChannel.EMAIL]
        
        # Add SMS if phone available
        if state.get("load_data", {}).get("shipper_phone"):
            channels.append(DeliveryChannel.SMS)
        
        # Generate and send quote
        result = quote_manager.generate_and_send_quote(load_id, channels)
        
        if result.get("success"):
            logger.info(
                f"Quote {result['quote_number']} sent successfully via "
                f"{list(result['delivery_results'].keys())}"
            )
            
            return {
                "quote_id": result["quote_id"],
                "quote_number": result["quote_number"],
                "delivery_results": result["delivery_results"],
                "metadata": {
                    **state.get("metadata", {}),
                    "quote_sent_at": datetime.now().isoformat(),
                    "expires_at": result["expires_at"]
                }
            }
        else:
            return {"errors": [f"Quote generation failed: {result.get('error')}"]}
            
    except Exception as e:
        logger.error(f"Quote delivery failed: {e}")
        return {"errors": [f"Quote delivery failed: {str(e)}"]}


def update_load_status(state: QuoteDeliveryState) -> Dict:
    """
    Update load status after quoting.
    
    STATUS UPDATES:
    - Mark as QUOTED if successful
    - Add quote reference
    - Update timestamp
    """
    if not state.get("quote_id") or not supabase:
        return {}
    
    load_id = state.get("load_id")
    quote_id = state.get("quote_id")
    
    try:
        # Update load status
        supabase.table("loads").update({
            "status": "QUOTED",
            "last_quote_id": quote_id,
            "last_quoted_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }).eq("id", load_id).execute()
        
        logger.info(f"Load {load_id} status updated to QUOTED")
        
        return {
            "metadata": {
                **state.get("metadata", {}),
                "load_status_updated": True
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to update load status: {e}")
        return {"errors": [f"Status update failed: {str(e)}"]}


def summarize_results(state: QuoteDeliveryState) -> Dict:
    """
    Summarize quote delivery results.
    
    SUMMARY INCLUDES:
    - Success/failure status
    - Delivery channels used
    - Quote details
    - Next steps
    """
    quote_id = state.get("quote_id")
    quote_number = state.get("quote_number")
    errors = state.get("errors", [])
    
    if quote_id:
        print(f"\n✅ Quote Delivery Successful!")
        print(f"   Quote Number: {quote_number}")
        print(f"   Quote ID: {quote_id}")
        
        delivery_results = state.get("delivery_results", {})
        for channel, result in delivery_results.items():
            if result.get("success"):
                print(f"   {channel.title()}: ✓ Sent")
            else:
                print(f"   {channel.title()}: ✗ Failed - {result.get('error')}")
        
        metadata = state.get("metadata", {})
        if metadata.get("expires_at"):
            print(f"   Expires: {metadata['expires_at']}")
            
    elif errors:
        print(f"\n❌ Quote Delivery Failed")
        for error in errors:
            print(f"   - {error}")
    else:
        validation_notes = state.get("validation_notes", [])
        print(f"\n⚠️  Quote Not Generated")
        for note in validation_notes:
            print(f"   - {note}")
    
    return {}


# ╔══════════ Conditional Routing ═══════════════════════════════════════

def should_continue_after_validation(state: QuoteDeliveryState) -> str:
    """Route based on validation results."""
    if state.get("validation_passed"):
        return "calculate_pricing"
    else:
        return "summarize_results"


def should_continue_after_pricing(state: QuoteDeliveryState) -> str:
    """Route based on pricing results."""
    if state.get("pricing_result") and not state.get("errors"):
        return "generate_and_send_quote"
    else:
        return "summarize_results"


# ╔══════════ Build Workflow ═══════════════════════════════════════

def build_quote_delivery_agent():
    """
    Build the quote delivery workflow.
    
    WORKFLOW:
    1. fetch_load: Get load data
    2. validate_for_quoting: Check if ready
    3. calculate_pricing: Generate rates
    4. generate_and_send_quote: Create and deliver
    5. update_load_status: Mark as quoted
    6. summarize_results: Final summary
    """
    workflow = StateGraph(QuoteDeliveryState)
    
    # Add nodes
    workflow.add_node("fetch_load", fetch_load)
    workflow.add_node("validate_for_quoting", validate_for_quoting)
    workflow.add_node("calculate_pricing", calculate_pricing)
    workflow.add_node("generate_and_send_quote", generate_and_send_quote)
    workflow.add_node("update_load_status", update_load_status)
    workflow.add_node("summarize_results", summarize_results)
    
    # Add edges
    workflow.add_edge("fetch_load", "validate_for_quoting")
    workflow.add_conditional_edges(
        "validate_for_quoting",
        should_continue_after_validation
    )
    workflow.add_conditional_edges(
        "calculate_pricing",
        should_continue_after_pricing
    )
    workflow.add_edge("generate_and_send_quote", "update_load_status")
    workflow.add_edge("update_load_status", "summarize_results")
    
    # Set entry and exit
    workflow.set_entry_point("fetch_load")
    workflow.set_finish_point("summarize_results")
    
    return workflow.compile()


# ╔══════════ Integration Functions ═══════════════════════════════════════

def generate_quote_for_load(load_id: str) -> Dict:
    """
    Generate and send quote for a specific load.
    
    INTEGRATION POINT:
    Called by intake workflow after successful load save.
    """
    agent = build_quote_delivery_agent()
    
    initial_state = {
        "load_id": load_id,
        "metadata": {
            "triggered_by": "intake_workflow",
            "started_at": datetime.now().isoformat()
        },
        "errors": [],
        "delivery_results": {}
    }
    
    try:
        result = agent.invoke(initial_state)
        return {
            "success": bool(result.get("quote_id")),
            "quote_id": result.get("quote_id"),
            "quote_number": result.get("quote_number"),
            "errors": result.get("errors", [])
        }
    except Exception as e:
        logger.error(f"Quote delivery agent failed: {e}")
        return {
            "success": False,
            "errors": [str(e)]
        }


# ╔══════════ CLI Interface ═══════════════════════════════════════

def main():
    """CLI for testing quote delivery."""
    if len(sys.argv) < 2:
        print("Usage: python quote_delivery_agent.py <load_id>")
        print("   or: python quote_delivery_agent.py --test")
        sys.exit(1)
    
    if sys.argv[1] == "--test":
        # Test with mock load
        load_id = f"test-load-{uuid.uuid4()}"
        print(f"🧪 Testing quote delivery with mock load: {load_id}")
    else:
        load_id = sys.argv[1]
        print(f"📧 Generating quote for load: {load_id}")
    
    # Run agent
    result = generate_quote_for_load(load_id)
    
    print(f"\nResult: {json.dumps(result, indent=2)}")


if __name__ == "__main__":
    main()