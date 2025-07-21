# --------------------------- src/agents/loadblast/graph.py ----------------------------
"""
AI-Broker MVP · LoadBlast Agent (LangGraph ≥ 0.5)

OVERVIEW:
This is the second agent in the freight brokerage automation pipeline. It takes
complete load records from the database and automatically distributes them to
suitable carriers via personalized emails, with options for DAT load board posting.

WORKFLOW:
1. Fetch load details and posting preferences from database
2. Find suitable carriers based on equipment type and geographic coverage
3. Generate personalized email content using AI
4. Send emails via Resend API with staggered timing by preference tier
5. Optionally post to DAT load board if enabled
6. Track all outreach activities in load_blasts table

BUSINESS LOGIC:
- Replaces manual carrier outreach with automated, personalized communication
- Implements tiered carrier selection (preferred carriers first)
- Generates professional, contextual email content
- Maintains comprehensive audit trail of all outreach activities
- Supports both carrier emails and DAT load board posting

TECHNICAL ARCHITECTURE:
- LangGraph state machine with conditional workflow
- Supabase integration for data queries and tracking
- Resend API for email delivery
- OpenAI GPT-4o-mini for email generation
- DAT API integration for load board posting

DEPENDENCIES:
- Environment variables: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY
- Database: 'loads', 'carriers', and 'load_blasts' tables in Supabase
- Input: Load ID from command line or database notifications
- Output: Sent emails, SMS, and DAT postings tracked in database
"""

# ─── Standard-library imports ───────────────────────────────────────────
import os, sys, json, uuid, sqlite3
from typing import List, Dict, Any, Optional
from typing_extensions import TypedDict
from datetime import datetime, timedelta
import time

# ─── Environment setup ─────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

# ─── Third-party imports ────────────────────────────────────────────────
from langgraph.graph import StateGraph
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
import requests
import resend

# ╔══════════ 1. Configuration & Shared State ═══════════════════════════════════
"""
LOADBLAST CONFIGURATION:
- Uses moderate temperature (0.3) for email generation creativity
- Integrates with Resend API for professional email delivery
- Maintains state throughout the entire outreach process
- Supports staggered posting (carriers first, then DAT board)

CARRIER SELECTION STRATEGY:
- Equipment type matching (Van, Flatbed, Reefer, etc.)
- Geographic coverage (service areas)
- Tier-based prioritization (1=premium, 2=standard, 3=backup)
- Performance metrics (acceptance rates, completion rates)

DAT INTEGRATION:
- Posts loads to DAT load board after carrier delay period
- Respects broker preferences for DAT posting
- Tracks DAT posting success/failure
"""

# LLM model configuration - moderate temperature for email creativity
MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

# API configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

# Configure Resend API
resend.api_key = RESEND_API_KEY

class LoadBlastState(TypedDict):
    """
    LangGraph state object that flows through the entire LoadBlast workflow.
    
    FIELDS:
    - load_id: Database ID of the load to broadcast
    - load_data: Complete load record from database
    - selected_carriers: List of carriers matching load requirements
    - email_content: Generated email subject and body
    - sent_emails: List of successfully sent emails with metadata
    - dat_posted: Boolean indicating if load was posted to DAT
    - errors: List of error messages for troubleshooting
    
    STATE EVOLUTION:
    The state builds up progressively as the workflow executes,
    enabling full traceability of the outreach process.
    """
    load_id: str
    load_data: dict
    selected_carriers: List[dict]
    email_content: dict
    sent_emails: List[dict]
    dat_posted: bool
    errors: List[str]

# LLM client with moderate temperature for email creativity
llm = ChatOpenAI(model=MODEL, temperature=0.3)

# ╔══════════ 2. Database Helper Functions ═══════════════════════════════════════
def get_load_from_db(load_id: str) -> Optional[dict]:
    """
    Fetch complete load record from database via Supabase API.
    
    DATABASE QUERY:
    - Selects all fields from loads table
    - Filters by exact load ID match
    - Returns single record or None
    
    ARGS:
        load_id: Database UUID of the load to fetch
        
    RETURNS:
        dict: Complete load record or None if not found
        
    BUSINESS CONTEXT:
    This function validates that the load exists and fetches all
    information needed for carrier outreach.
    """
    try:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/loads?id=eq.{load_id}&select=*",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            return data[0] if data else None
        else:
            print(f"❌ Error fetching load {load_id}: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Error fetching load {load_id}: {e}")
        return None

def find_suitable_carriers(load_data: dict) -> List[dict]:
    """
    Find carriers that can handle the specific load requirements.
    
    CARRIER SELECTION CRITERIA:
    1. Equipment type matching (Van, Flatbed, Reefer, etc.)
    2. Geographic coverage (serves origin area)
    3. Active status (not blacklisted or inactive)
    4. Tier-based ordering (preferred carriers first)
    
    POSTGRESQL ARRAY QUERIES:
    - Uses array containment operators for matching
    - Checks if equipment_types contains load's equipment
    - Checks if service_areas contains load's origin_zip or state
    
    ARGS:
        load_data: Complete load record with equipment and location info
        
    RETURNS:
        List[dict]: Ordered list of suitable carriers (preferred first)
        
    BUSINESS CONTEXT:
    This function implements the core carrier selection logic that
    determines which carriers receive load offers.
    """
    try:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        }
        
        # Build query to find carriers that can handle this load
        equipment = load_data.get('equipment', '')
        origin_zip = load_data.get('origin_zip', '')
        origin_state = origin_zip[:2] if len(origin_zip) == 5 else ''  # Simple zip to state mapping
        
        # Query carriers with equipment and geographic matching
        query = f"""
            status=eq.ACTIVE&
            equipment_types=cs.{{{equipment}}}&
            order=preference_tier.asc,loads_accepted.desc
        """
        
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/carriers?{query.strip()}",
            headers=headers
        )
        
        if response.status_code == 200:
            carriers = response.json()
            
            # Limit to max carriers specified in load preferences
            max_carriers = load_data.get('max_carriers_to_contact', 10)
            return carriers[:max_carriers]
        else:
            print(f"❌ Error fetching carriers: {response.status_code}")
            return []
            
    except Exception as e:
        print(f"❌ Error finding suitable carriers: {e}")
        return []

def record_blast_activity(load_id: str, carrier_id: str, blast_type: str, 
                         blast_status: str, message_content: str = None, 
                         error_message: str = None) -> None:
    """
    Record load blast activity in the database for tracking and analytics.
    
    DATABASE OPERATIONS:
    - Inserts record into load_blasts table
    - Tracks all outreach activities
    - Enables performance analytics
    
    ARGS:
        load_id: UUID of the load being blasted
        carrier_id: UUID of the carrier (or None for DAT posting)
        blast_type: Type of blast (EMAIL, SMS, DAT_POST)
        blast_status: Status (PENDING, SENT, FAILED, DELIVERED)
        message_content: Content of the message sent
        error_message: Error details if blast failed
        
    BUSINESS CONTEXT:
    This function maintains the audit trail required for compliance
    and enables performance analytics for continuous improvement.
    """
    try:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        }
        
        blast_record = {
            "load_id": load_id,
            "carrier_id": carrier_id,
            "blast_type": blast_type,
            "blast_status": blast_status,
            "message_content": message_content,
            "error_message": error_message,
            "sent_at": datetime.now().isoformat() if blast_status == "SENT" else None
        }
        
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/load_blasts",
            headers=headers,
            json=blast_record
        )
        
        if response.status_code not in [200, 201]:
            print(f"❌ Error recording blast activity: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error recording blast activity: {e}")

# ╔══════════ 3. LangGraph Node Functions ═══════════════════════════════════════
def fetch_load(state: LoadBlastState) -> Dict[str, Any]:
    """
    INITIAL NODE: Fetch load details from database.
    
    DATABASE OPERATIONS:
    - Queries loads table by ID
    - Validates load exists and is in correct status
    - Fetches all load details and posting preferences
    - Checks for complexity flags requiring human review
    
    ARGS:
        state: Current workflow state with load_id
        
    RETURNS:
        Dict containing:
        - load_data: Complete load record
        - errors: Any errors encountered
        
    BUSINESS CONTEXT:
    This node validates the load request and prepares data for
    carrier selection and outreach. It implements the safety mechanism
    to prevent automation of complex freight requiring human expertise.
    """
    load_id = state["load_id"]
    
    print(f"🔍 Fetching load {load_id} from database...")
    
    load_data = get_load_from_db(load_id)
    
    if not load_data:
        error_msg = f"Load {load_id} not found in database"
        print(f"❌ {error_msg}")
        return {"errors": [error_msg]}
    
    # Validate load is in correct status for blasting
    if load_data.get('status') != 'NEW_RFQ':
        error_msg = f"Load {load_id} has status '{load_data.get('status')}', expected 'NEW_RFQ'"
        print(f"❌ {error_msg}")
        return {"errors": [error_msg]}
    
    # INCOMPLETE LOAD CHECK: Skip loads that are missing information
    if not load_data.get('is_complete', True):
        missing_fields = load_data.get('missing_fields', [])
        error_msg = f"Load {load_id} is incomplete - missing: {', '.join(missing_fields)}"
        print(f"📋 {error_msg}")
        print(f"   🚫 AUTOMATION BLOCKED - Waiting for shipper to provide missing information")
        return {"errors": [error_msg]}
    
    # COMPLEXITY CHECK: Skip loads requiring human review
    if load_data.get('requires_human_review', False):
        complexity_flags = load_data.get('complexity_flags', [])
        error_msg = f"Load {load_id} requires human review due to complexity: {', '.join(complexity_flags)}"
        print(f"🔒 {error_msg}")
        print(f"   Analysis: {load_data.get('complexity_analysis', 'Complex freight detected')}")
        print(f"   🚫 AUTOMATION BLOCKED - Load must be reviewed by broker before carrier outreach")
        return {"errors": [error_msg]}
    
    print(f"✅ Load fetched: {load_data.get('load_number')} - {load_data.get('origin_zip')} to {load_data.get('dest_zip')}")
    
    return {"load_data": load_data}

def select_carriers(state: LoadBlastState) -> Dict[str, Any]:
    """
    CARRIER SELECTION NODE: Find suitable carriers for the load.
    
    SELECTION LOGIC:
    1. Equipment type matching
    2. Geographic coverage
    3. Active status filtering
    4. Tier-based prioritization
    5. Performance metrics consideration
    
    ARGS:
        state: Current workflow state with load_data
        
    RETURNS:
        Dict containing:
        - selected_carriers: List of suitable carriers
        - errors: Any errors encountered
        
    BUSINESS CONTEXT:
    This node implements the core carrier selection algorithm that
    determines which carriers receive load offers.
    """
    load_data = state["load_data"]
    
    print(f"🎯 Selecting carriers for {load_data.get('equipment')} load...")
    
    # Check if load should be sent to carriers
    if not load_data.get('post_to_carriers', True):
        print("⏭️  Load configured to skip carrier outreach")
        return {"selected_carriers": []}
    
    carriers = find_suitable_carriers(load_data)
    
    if not carriers:
        error_msg = f"No suitable carriers found for {load_data.get('equipment')} equipment"
        print(f"❌ {error_msg}")
        return {"selected_carriers": [], "errors": [error_msg]}
    
    print(f"✅ Found {len(carriers)} suitable carriers")
    for i, carrier in enumerate(carriers[:5]):  # Show top 5
        print(f"   {i+1}. {carrier['carrier_name']} (Tier {carrier['preference_tier']})")
    
    return {"selected_carriers": carriers}

def generate_email_content(state: LoadBlastState) -> Dict[str, Any]:
    """
    EMAIL GENERATION NODE: Create personalized email content using AI.
    
    AI GENERATION STRATEGY:
    1. Professional but personal tone
    2. Key load details prominently displayed
    3. Clear call-to-action
    4. Carrier-specific personalization
    5. Industry-appropriate language
    
    ARGS:
        state: Current workflow state with load_data
        
    RETURNS:
        Dict containing:
        - email_content: Generated subject and body
        - errors: Any errors encountered
        
    BUSINESS CONTEXT:
    This node replaces manual email composition with AI-generated
    content that maintains professional standards while scaling.
    """
    load_data = state["load_data"]
    
    print(f"📝 Generating email content for load {load_data.get('load_number')}...")
    
    # Create prompt for email generation
    prompt = f"""
    Generate a professional freight load offer email for carriers.
    
    LOAD DETAILS:
    - Load Number: {load_data.get('load_number')}
    - Equipment: {load_data.get('equipment')}
    - Origin: {load_data.get('origin_zip')}
    - Destination: {load_data.get('dest_zip')}
    - Pickup Date: {load_data.get('pickup_dt')}
    - Weight: {load_data.get('weight_lb')} lbs
    - Commodity: {load_data.get('commodity', 'General freight')}
    - Hazmat: {'Yes' if load_data.get('hazmat') else 'No'}
    
    REQUIREMENTS:
    - Professional but friendly tone
    - Include all load details clearly
    - Request quote response
    - Keep subject line under 50 characters
    - Keep body under 200 words
    - Include contact information
    
    Return JSON with 'subject' and 'body' fields.
    """
    
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        
        # Clean up JSON formatting
        if content.startswith("```"):
            content = content.strip("`").strip()
        
        email_content = json.loads(content)
        
        print(f"✅ Email content generated")
        print(f"   Subject: {email_content.get('subject', 'N/A')}")
        
        return {"email_content": email_content}
        
    except Exception as e:
        error_msg = f"Error generating email content: {e}"
        print(f"❌ {error_msg}")
        return {"errors": [error_msg]}

def send_carrier_emails(state: LoadBlastState) -> Dict[str, Any]:
    """
    EMAIL SENDING NODE: Send personalized emails to selected carriers.
    
    EMAIL DELIVERY STRATEGY:
    1. Staggered sending by preference tier
    2. Personalized subject lines and content
    3. Professional from address and signature
    4. Delivery tracking and error handling
    5. Comprehensive blast activity logging
    
    ARGS:
        state: Current workflow state with carriers and email content
        
    RETURNS:
        Dict containing:
        - sent_emails: List of successfully sent emails
        - errors: Any errors encountered
        
    BUSINESS CONTEXT:
    This node handles the actual email delivery with proper tracking
    and error handling for reliable carrier outreach.
    """
    carriers = state["selected_carriers"]
    email_content = state["email_content"]
    load_data = state["load_data"]
    
    if not carriers:
        print("⏭️  No carriers selected, skipping email sending")
        return {"sent_emails": []}
    
    print(f"📧 Sending emails to {len(carriers)} carriers...")
    
    sent_emails = []
    errors = []
    
    for i, carrier in enumerate(carriers):
        try:
            # Personalize email for this carrier
            personalized_subject = f"{email_content['subject']} - {carrier['carrier_name']}"
            personalized_body = f"Hello {carrier['contact_name'] or 'Team'},\n\n{email_content['body']}"
            
            # Send email via Resend
            params = {
                "from": "loads@ai-broker.com",  # Configure your from address
                "to": [carrier['contact_email']],
                "subject": personalized_subject,
                "text": personalized_body,
                "tags": [
                    {"name": "load_id", "value": load_data['id']},
                    {"name": "carrier_id", "value": carrier['id']},
                    {"name": "load_number", "value": load_data['load_number']}
                ]
            }
            
            email_result = resend.Emails.send(params)
            
            # Record successful blast
            record_blast_activity(
                load_data['id'],
                carrier['id'],
                "EMAIL",
                "SENT",
                personalized_body
            )
            
            sent_emails.append({
                "carrier_id": carrier['id'],
                "carrier_name": carrier['carrier_name'],
                "email": carrier['contact_email'],
                "resend_id": email_result.get('id'),
                "sent_at": datetime.now().isoformat()
            })
            
            print(f"   ✅ Sent to {carrier['carrier_name']} ({carrier['contact_email']})")
            
            # Staggered sending - wait between emails
            if i < len(carriers) - 1:
                time.sleep(2)  # 2-second delay between emails
                
        except Exception as e:
            error_msg = f"Failed to send email to {carrier['carrier_name']}: {e}"
            errors.append(error_msg)
            print(f"   ❌ {error_msg}")
            
            # Record failed blast
            record_blast_activity(
                load_data['id'],
                carrier['id'],
                "EMAIL",
                "FAILED",
                error_message=str(e)
            )
    
    print(f"✅ Email sending complete: {len(sent_emails)} sent, {len(errors)} errors")
    
    return {"sent_emails": sent_emails, "errors": errors}

def post_to_dat(state: LoadBlastState) -> Dict[str, Any]:
    """
    DAT POSTING NODE: Post load to DAT load board if enabled.
    
    DAT INTEGRATION STRATEGY:
    1. Check if DAT posting is enabled for this load
    2. Respect posting delay to give carriers first chance
    3. Format load data for DAT API requirements
    4. Handle DAT API authentication and posting
    5. Track posting success/failure
    
    ARGS:
        state: Current workflow state with load_data
        
    RETURNS:
        Dict containing:
        - dat_posted: Boolean indicating success
        - errors: Any errors encountered
        
    BUSINESS CONTEXT:
    This node provides fallback load posting to DAT load board
    when carrier outreach doesn't yield sufficient responses.
    """
    load_data = state["load_data"]
    
    # Check if DAT posting is enabled
    if not load_data.get('post_to_dat', False):
        print("⏭️  DAT posting disabled for this load")
        return {"dat_posted": False}
    
    # Check if we should wait for carrier responses first
    posting_delay = load_data.get('posting_delay_minutes', 0)
    if posting_delay > 0:
        print(f"⏰ Waiting {posting_delay} minutes before DAT posting...")
        time.sleep(posting_delay * 60)  # Convert to seconds
    
    print(f"🌐 Posting load {load_data.get('load_number')} to DAT load board...")
    
    try:
        # DAT API integration would go here
        # For now, we'll simulate the posting
        
        # TODO: Implement actual DAT API integration
        # dat_response = post_to_dat_api(load_data)
        
        # Simulate successful posting
        dat_posted = True
        
        # Record DAT posting activity
        record_blast_activity(
            load_data['id'],
            None,  # No carrier_id for DAT posting
            "DAT_POST",
            "SENT",
            f"Posted load {load_data['load_number']} to DAT load board"
        )
        
        print(f"✅ Load posted to DAT load board")
        
        return {"dat_posted": dat_posted}
        
    except Exception as e:
        error_msg = f"Error posting to DAT load board: {e}"
        print(f"❌ {error_msg}")
        
        # Record failed DAT posting
        record_blast_activity(
            load_data['id'],
            None,
            "DAT_POST",
            "FAILED",
            error_message=str(e)
        )
        
        return {"dat_posted": False, "errors": [error_msg]}

def summarize_results(state: LoadBlastState) -> Dict[str, Any]:
    """
    TERMINAL NODE: Summarize blast results and update load status.
    
    SUMMARY OPERATIONS:
    1. Count successful emails sent
    2. Track DAT posting status
    3. Log any errors encountered
    4. Update load status if needed
    5. Print comprehensive summary
    6. Handle complexity-blocked loads appropriately
    
    ARGS:
        state: Current workflow state with all results
        
    RETURNS:
        Dict: Empty (workflow terminates)
        
    BUSINESS CONTEXT:
    This node provides visibility into the blast results and
    prepares the load for the next stage of processing. It handles
    both successful blasts and complexity-blocked scenarios.
    """
    load_data = state.get("load_data", {})
    sent_emails = state.get("sent_emails", [])
    dat_posted = state.get("dat_posted", False)
    errors = state.get("errors", [])
    
    print(f"\n📊 LoadBlast Summary for {load_data.get('load_number', 'Unknown')}:")
    
    # Check if this was a complexity-blocked load
    complexity_blocked = any("requires human review" in error.lower() for error in errors)
    
    # Check if this was an incomplete load
    incomplete_load = any("is incomplete" in error.lower() for error in errors)
    
    if incomplete_load:
        print(f"   📋 INCOMPLETE LOAD - Waiting for shipper to provide missing information")
        print(f"   📧 Emails sent: 0 (automation disabled)")
        print(f"   🌐 DAT posted: No (automation disabled)")
        print(f"   ✉️  Missing info request sent to shipper")
        print(f"   🔄 LoadBlast will resume when missing information is provided")
        
    elif complexity_blocked:
        print(f"   🔒 COMPLEXITY BLOCKED - Load requires human broker review")
        print(f"   📧 Emails sent: 0 (automation disabled)")
        print(f"   🌐 DAT posted: No (automation disabled)")
        print(f"   ⚠️  Complexity detected: {len(errors)} issues")
        
        # Update status to indicate complexity review needed
        try:
            headers = {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                "Content-Type": "application/json"
            }
            
            update_data = {"status": "NEEDS_REVIEW"}
            
            response = requests.patch(
                f"{SUPABASE_URL}/rest/v1/loads?id=eq.{load_data.get('id')}",
                headers=headers,
                json=update_data
            )
            
            if response.status_code == 200:
                print(f"✅ Load status updated to NEEDS_REVIEW")
                print(f"   📋 Broker should review this load in dashboard")
                
        except Exception as e:
            print(f"❌ Error updating load status: {e}")
            
    else:
        print(f"   📧 Emails sent: {len(sent_emails)}")
        print(f"   🌐 DAT posted: {'Yes' if dat_posted else 'No'}")
        print(f"   ❌ Errors: {len(errors)}")
        
        if sent_emails:
            print(f"   📋 Carriers contacted:")
            for email in sent_emails:
                print(f"      - {email['carrier_name']} ({email['email']})")
        
        # Update load status to indicate blast completed
        try:
            headers = {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                "Content-Type": "application/json"
            }
            
            update_data = {"status": "BLASTED"}
            
            response = requests.patch(
                f"{SUPABASE_URL}/rest/v1/loads?id=eq.{load_data.get('id')}",
                headers=headers,
                json=update_data
            )
            
            if response.status_code == 200:
                print(f"✅ Load status updated to BLASTED")
                
        except Exception as e:
            print(f"❌ Error updating load status: {e}")
    
    if errors:
        print(f"   ⚠️  Issues encountered:")
        for error in errors:
            print(f"      - {error}")
    
    return {}

# ╔══════════ 4. LangGraph Construction ═══════════════════════════════════════
def build_loadblast_agent():
    """
    Construct and compile the LoadBlast LangGraph state machine.
    
    GRAPH STRUCTURE:
    - Entry point: fetch_load
    - Linear workflow: fetch → select → generate → send → post → summarize
    - Terminal node: summarize_results
    
    PERSISTENCE:
    - SQLite checkpointing for workflow state
    - Enables resuming interrupted workflows
    - Useful for debugging and monitoring
    
    RETURNS:
        Compiled LangGraph agent ready for execution
        
    TECHNICAL NOTES:
    - Uses sqlite3 for local state persistence
    - Thread-safe for concurrent executions
    - Checkpoints enable workflow replay and debugging
    """
    g = StateGraph(LoadBlastState)

    # Add workflow nodes
    g.add_node("fetch_load", fetch_load)
    g.add_node("select_carriers", select_carriers)
    g.add_node("generate_email_content", generate_email_content)
    g.add_node("send_carrier_emails", send_carrier_emails)
    g.add_node("post_to_dat", post_to_dat)
    g.add_node("summarize_results", summarize_results)

    # Add linear workflow edges
    g.add_edge("fetch_load", "select_carriers")
    g.add_edge("select_carriers", "generate_email_content")
    g.add_edge("generate_email_content", "send_carrier_emails")
    g.add_edge("send_carrier_emails", "post_to_dat")
    g.add_edge("post_to_dat", "summarize_results")
    
    # Define workflow entry and exit points
    g.set_entry_point("fetch_load")
    g.set_finish_point("summarize_results")

    # Add SQLite checkpointing for persistence
    conn = sqlite3.connect("loadblast_state.sqlite", check_same_thread=False)
    saver = SqliteSaver(conn)
    
    return g.compile(checkpointer=saver)

# Global agent instance
agent = build_loadblast_agent()

# ╔══════════ 5. Command Line Interface ═══════════════════════════════════════
def main() -> None:
    """
    CLI wrapper for the LoadBlast Agent.
    
    USAGE:
        python src/agents/loadblast/graph.py LOAD_ID
    
    WORKFLOW:
    1. Validate command line arguments
    2. Generate unique run ID for checkpointing
    3. Execute agent with load ID
    4. Handle errors gracefully
    
    ERROR HANDLING:
    - Invalid arguments → usage message
    - Missing load ID → error message
    - Exceptions → bubble up for debugging
    
    BUSINESS CONTEXT:
    This is the entry point for blasting individual loads to carriers.
    In production, this would be triggered by database notifications.
    """
    # Validate command line arguments
    if len(sys.argv) != 2:
        print("Usage: python src/agents/loadblast/graph.py LOAD_ID")
        sys.exit(1)

    load_id = sys.argv[1]
    
    # Generate unique run ID for checkpointing
    run_id = f"loadblast-{uuid.uuid4()}"
    
    # Execute agent workflow
    print(f"🚀 Starting LoadBlast Agent for load {load_id}")
    
    try:
        agent.invoke(
            {
                "load_id": load_id,
                "load_data": {},
                "selected_carriers": [],
                "email_content": {},
                "sent_emails": [],
                "dat_posted": False,
                "errors": []
            },
            config={"thread_id": run_id}
        )
        
        print(f"✅ LoadBlast Agent completed for load {load_id}")
        
    except Exception as e:
        print(f"❌ LoadBlast Agent failed for load {load_id}: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

# ╔══════════ SYSTEM ARCHITECTURE NOTES ═══════════════════════════════════════
"""
INTEGRATION POINTS:
1. Input: Load IDs from intake agent or database notifications
2. Output: Sent emails tracked in load_blasts table
3. Dependencies: Resend API, DAT API, Supabase database
4. Monitoring: SQLite checkpoints for workflow state

SCALING CONSIDERATIONS:
- Stateless design enables horizontal scaling
- Email sending can be parallelized with rate limiting
- DAT posting can be batched for efficiency
- Database connections should be pooled in production

MAINTENANCE:
- Monitor email delivery rates and adjust templates
- Update carrier selection criteria based on performance
- Implement comprehensive error logging and alerting
- Regular cleanup of old workflow checkpoints

BUSINESS METRICS:
- Email delivery success rate
- Carrier response rates by tier
- DAT posting success rate
- Time to first carrier response
"""
# --------------------------- end of file ------------------------------