# --------------------------- intake_graph.py ----------------------------
"""
AI-Broker MVP · Intake Agent (LangGraph ≥ 0.5)

OVERVIEW:
This is the first agent in the freight brokerage automation pipeline. It processes
incoming tender emails from shippers and converts them into structured load data
stored in the database.

WORKFLOW:
1. Parse tender email (.eml file format)
2. Extract load information using LLM (GPT-4o-mini)
3. Validate that all required fields are present
4. Branch: if missing fields → ask for more info, else → save to database
5. Save complete loads to Supabase with metadata

BUSINESS LOGIC:
- Converts unstructured shipper emails into structured load records
- Handles missing information by requesting clarification
- Prepares loads for carrier outreach (LoadBlast Agent)
- Maintains audit trail with email source and timestamps

TECHNICAL ARCHITECTURE:
- LangGraph state machine with conditional routing
- SQLite checkpointing for workflow persistence
- Supabase integration for data storage
- OpenAI GPT-4o-mini for field extraction

DEPENDENCIES:
- Environment variables: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
- Edge Function: fn_create_load deployed to Supabase
- Input: .eml email files
- Output: Structured load records via Edge Function
"""

# ─── Standard-library imports ───────────────────────────────────────────
import os, sys, json, email, uuid, sqlite3, re
from pathlib import Path
from typing import List, Dict, Any
from typing_extensions import TypedDict
from datetime import datetime

# ─── Environment setup ─────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env file

# ─── Third-party imports ────────────────────────────────────────────────
from langgraph.graph import StateGraph
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
import requests
import resend

# ╔══════════ 1. Configuration & Shared State ═══════════════════════════════════
"""
REQUIRED FIELDS: These are the minimum fields needed for a valid load tender.
If any of these are missing, the workflow will ask for clarification.

BUSINESS RATIONALE:
- origin_city/state: Where to pickup the freight
- dest_city/state: Where to deliver the freight  
- pickup_dt: When freight is available (pickup date)
- equipment: What kind of truck is needed (Van, Flatbed, Reefer)
- weight_lb: Weight affects pricing and equipment requirements
"""
# Updated to match actual database schema
REQUIRED = ["origin_zip", "dest_zip", "pickup_dt", "equipment", "weight_lb"]

# LLM model configuration - using gpt-4o-mini for cost efficiency
MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

# Supabase configuration for Edge Function calls
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
FN_CREATE_LOAD_URL = os.getenv("FN_CREATE_LOAD_URL") or f"{SUPABASE_URL}/functions/v1/fn_create_load"

# Resend configuration for email sending
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

class GState(TypedDict):
    """
    LangGraph state object that flows through the entire workflow.
    
    FIELDS:
    - raw_text: Original email content as plain text
    - load: Dictionary containing extracted load fields
    - missing: List of required fields that are missing from extraction
    - email_from: Sender's email address
    - email_message_id: Original email Message-ID for threading
    - email_subject: Original email subject line
    
    This state is passed between all nodes and gets updated at each step.
    """
    raw_text: str
    load: dict
    missing: List[str]
    email_from: str
    email_message_id: str
    email_subject: str

# LLM client with temperature=0.0 for consistent field extraction
llm = ChatOpenAI(model=MODEL, temperature=0.0)

# ╔══════════ 2. Helper Functions ════════════════════════════════════════
def read_email(path: Path) -> str:
    """
    Parse a .eml email file and extract the plain text body.
    
    EMAIL FORMAT HANDLING:
    - Handles both multipart and simple email formats
    - Extracts only text/plain content (ignores HTML)
    - Uses best-effort charset detection
    - Gracefully handles encoding errors
    
    ARGS:
        path: Path to .eml file
        
    RETURNS:
        str: Plain text content of the email body
        
    BUSINESS CONTEXT:
    Shipper emails come in various formats. This function normalizes them
    to plain text for consistent LLM processing.
    """
    msg = email.message_from_bytes(path.read_bytes())

    def _dec(part) -> str:
        """Helper function to decode email parts with charset handling."""
        cs = part.get_content_charset() or "utf-8"
        return part.get_payload(decode=True).decode(cs, errors="replace")

    # Handle multipart emails (most common)
    if msg.is_multipart():
        for p in msg.walk():
            if p.get_content_type() == "text/plain":
                return _dec(p)
    
    # Handle simple email format
    return _dec(msg)

def parse_email_with_headers(path: Path) -> dict:
    """
    Parse a .eml email file and extract body text plus headers for threading.
    
    EMAIL DATA EXTRACTION:
    - Extracts plain text body using existing read_email function
    - Captures From, Subject, Message-ID headers
    - Handles missing headers gracefully
    
    ARGS:
        path: Path to .eml file
        
    RETURNS:
        dict: Contains 'body', 'from', 'subject', 'message_id'
        
    BUSINESS CONTEXT:
    Email threading requires tracking Message-ID and From headers to
    properly link follow-up emails to original load requests.
    """
    msg = email.message_from_bytes(path.read_bytes())
    
    # Extract body using existing function
    body = read_email(path)
    
    # Extract headers for threading
    email_from = msg.get("From", "")
    # Extract just the email address from "Name <email@domain.com>" format
    if "<" in email_from and ">" in email_from:
        email_from = email_from.split("<")[1].split(">")[0]
    
    return {
        "body": body,
        "from": email_from,
        "subject": msg.get("Subject", "Load Request"),
        "message_id": msg.get("Message-ID", f"<generated-{uuid.uuid4()}@ai-broker.com>")
    }

def missing(d: dict) -> List[str]:
    """
    Check which required fields are missing from extracted data.
    
    VALIDATION LOGIC:
    - Checks if field exists in dictionary
    - Checks if field value is truthy (not None, empty string, etc.)
    
    ARGS:
        d: Dictionary of extracted load data
        
    RETURNS:
        List[str]: Names of missing required fields
        
    BUSINESS CONTEXT:
    Incomplete load information leads to carrier confusion and delays.
    This function ensures data quality before proceeding.
    """
    return [f for f in REQUIRED if not d.get(f)]

def detect_freight_complexity(raw_text: str, load_data: dict) -> tuple[List[str], str]:
    """
    Comprehensive freight complexity detection system.
    
    BUSINESS PURPOSE:
    Analyzes email content and extracted load data to identify complex freight
    types that require human broker expertise. Prevents automation errors on
    specialized loads requiring permits, certifications, or special handling.
    
    DETECTION CATEGORIES:
    1. HAZMAT - Hazardous materials requiring certified carriers
    2. OVERSIZE - Oversize/overweight requiring permits and escorts
    3. MULTI_STOP - Multiple pickup/delivery locations
    4. INTERMODAL - Rail-truck coordination
    5. LTL - Less than truckload requiring consolidation
    6. PARTIAL - Partial truckload requiring load matching
    7. FLATBED - Specialized flatbed equipment and securement
    
    ARGS:
        raw_text: Original email content for pattern matching
        load_data: Extracted load information for analysis
        
    RETURNS:
        tuple: (complexity_flags, detailed_analysis)
        - complexity_flags: List of detected complexity types
        - detailed_analysis: Detailed explanation of detected patterns
        
    BUSINESS CONTEXT:
    This function implements the core safety mechanism that prevents
    automation of complex freight requiring human expertise.
    """
    complexity_flags = []
    analysis_parts = []
    
    # Convert to lowercase for case-insensitive matching
    text_lower = raw_text.lower()
    
    # ═══════════════════════════════════════════════════════════════════════
    # HAZMAT DETECTION (Highest Priority)
    # ═══════════════════════════════════════════════════════════════════════
    hazmat_keywords = [
        'hazmat', 'hazardous', 'dangerous goods', 'flammable', 'corrosive', 
        'toxic', 'explosive', 'radioactive', 'placard', 'msds', 'dot class',
        'un number', 'un1', 'un2', 'un3', 'class 1', 'class 2', 'class 3',
        'class 4', 'class 5', 'class 6', 'class 7', 'class 8', 'class 9'
    ]
    
    hazmat_patterns = [
        r'un\d{4}', r'dot-\d+', r'class \d', r'hazmat \d+',
        r'placard.*required', r'dangerous.*goods', r'flammable.*liquid'
    ]
    
    # Check for hazmat keywords
    detected_hazmat_keywords = [kw for kw in hazmat_keywords if kw in text_lower]
    
    # Check for hazmat patterns
    import re
    detected_hazmat_patterns = []
    for pattern in hazmat_patterns:
        matches = re.findall(pattern, text_lower)
        detected_hazmat_patterns.extend(matches)
    
    # Check load data for hazmat flag
    hazmat_from_extraction = load_data.get('hazmat', False)
    
    if detected_hazmat_keywords or detected_hazmat_patterns or hazmat_from_extraction:
        complexity_flags.append('HAZMAT')
        analysis_parts.append(f"HAZMAT detected: keywords={detected_hazmat_keywords}, patterns={detected_hazmat_patterns}, extracted_flag={hazmat_from_extraction}")
    
    # ═══════════════════════════════════════════════════════════════════════
    # OVERSIZE/OVERWEIGHT DETECTION
    # ═══════════════════════════════════════════════════════════════════════
    oversize_keywords = [
        'oversize', 'overweight', 'over dimensional', 'wide load', 'permit',
        'escort', 'pilot car', 'oversized', 'heavy haul', 'over width',
        'over length', 'over height', 'superload', 'wide', 'long', 'tall'
    ]
    
    oversize_patterns = [
        r'width.*\d+.*ft', r'length.*\d+.*ft', r'height.*\d+.*ft',
        r'weight.*\d+.*lbs', r'\d+.*feet.*wide', r'\d+.*feet.*long',
        r'\d+.*feet.*tall', r'\d+.*tons?'
    ]
    
    # Check for oversize keywords
    detected_oversize_keywords = [kw for kw in oversize_keywords if kw in text_lower]
    
    # Check for oversize patterns
    detected_oversize_patterns = []
    for pattern in oversize_patterns:
        matches = re.findall(pattern, text_lower)
        detected_oversize_patterns.extend(matches)
    
    # Check weight threshold (over 80,000 lbs)
    weight_lb = load_data.get('weight_lb', 0)
    overweight_threshold = weight_lb > 80000 if isinstance(weight_lb, int) else False
    
    if detected_oversize_keywords or detected_oversize_patterns or overweight_threshold:
        complexity_flags.append('OVERSIZE')
        analysis_parts.append(f"OVERSIZE detected: keywords={detected_oversize_keywords}, patterns={detected_oversize_patterns}, weight={weight_lb}")
    
    # ═══════════════════════════════════════════════════════════════════════
    # MULTI-STOP DETECTION
    # ═══════════════════════════════════════════════════════════════════════
    multistop_keywords = [
        'multiple stops', 'multi stop', 'several deliveries', 'first pickup',
        'second pickup', 'then deliver', 'then go to', 'multiple locations',
        'stop 1', 'stop 2', 'pickup 1', 'pickup 2', 'delivery 1', 'delivery 2'
    ]
    
    multistop_patterns = [
        r'then.*deliver', r'first.*pickup', r'second.*delivery',
        r'stop.*\d+', r'pickup.*\d+', r'delivery.*\d+'
    ]
    
    # Check for multi-stop keywords
    detected_multistop_keywords = [kw for kw in multistop_keywords if kw in text_lower]
    
    # Check for multi-stop patterns
    detected_multistop_patterns = []
    for pattern in multistop_patterns:
        matches = re.findall(pattern, text_lower)
        detected_multistop_patterns.extend(matches)
    
    # Count zip code occurrences (more than 2 suggests multi-stop)
    zip_pattern = r'\b\d{5}\b'
    zip_codes = re.findall(zip_pattern, raw_text)
    multiple_zips = len(set(zip_codes)) > 2
    
    if detected_multistop_keywords or detected_multistop_patterns or multiple_zips:
        complexity_flags.append('MULTI_STOP')
        analysis_parts.append(f"MULTI_STOP detected: keywords={detected_multistop_keywords}, patterns={detected_multistop_patterns}, zip_codes={len(set(zip_codes))}")
    
    # ═══════════════════════════════════════════════════════════════════════
    # INTERMODAL DETECTION
    # ═══════════════════════════════════════════════════════════════════════
    intermodal_keywords = [
        'intermodal', 'rail', 'container', 'tofc', 'cofc', 'ramp',
        'bnsf', 'union pacific', 'csx', 'norfolk southern', 'rail yard',
        'chassis', 'drayage', 'port', 'terminal'
    ]
    
    intermodal_patterns = [
        r'rail.*yard', r'container.*\d+', r'tofc', r'cofc',
        r'rail.*terminal', r'intermodal.*facility'
    ]
    
    # Check for intermodal keywords
    detected_intermodal_keywords = [kw for kw in intermodal_keywords if kw in text_lower]
    
    # Check for intermodal patterns
    detected_intermodal_patterns = []
    for pattern in intermodal_patterns:
        matches = re.findall(pattern, text_lower)
        detected_intermodal_patterns.extend(matches)
    
    if detected_intermodal_keywords or detected_intermodal_patterns:
        complexity_flags.append('INTERMODAL')
        analysis_parts.append(f"INTERMODAL detected: keywords={detected_intermodal_keywords}, patterns={detected_intermodal_patterns}")
    
    # ═══════════════════════════════════════════════════════════════════════
    # LTL DETECTION
    # ═══════════════════════════════════════════════════════════════════════
    ltl_keywords = [
        'ltl', 'less than truckload', 'partial load', 'consolidate',
        'shared truck', 'small shipment', 'few pallets'
    ]
    
    ltl_patterns = [
        r'ltl', r'\d+.*pallets?.*only', r'partial.*truck',
        r'small.*shipment', r'few.*pallets'
    ]
    
    # Check for LTL keywords
    detected_ltl_keywords = [kw for kw in ltl_keywords if kw in text_lower]
    
    # Check for LTL patterns
    detected_ltl_patterns = []
    for pattern in ltl_patterns:
        matches = re.findall(pattern, text_lower)
        detected_ltl_patterns.extend(matches)
    
    # Check weight threshold (under 10,000 lbs suggests LTL)
    ltl_weight_threshold = weight_lb < 10000 if isinstance(weight_lb, int) and weight_lb > 0 else False
    
    # Check pallet count (low pallet count suggests LTL)
    pieces = load_data.get('pieces', 0)
    ltl_piece_threshold = pieces < 10 if isinstance(pieces, int) and pieces > 0 else False
    
    if detected_ltl_keywords or detected_ltl_patterns or ltl_weight_threshold or ltl_piece_threshold:
        complexity_flags.append('LTL')
        analysis_parts.append(f"LTL detected: keywords={detected_ltl_keywords}, patterns={detected_ltl_patterns}, weight={weight_lb}, pieces={pieces}")
    
    # ═══════════════════════════════════════════════════════════════════════
    # PARTIAL LOAD DETECTION
    # ═══════════════════════════════════════════════════════════════════════
    partial_keywords = [
        'partial', 'partial truck', 'shared load', 'partial capacity',
        'not full truck', 'half truck', 'room for more'
    ]
    
    partial_patterns = [
        r'partial.*truck', r'shared.*load', r'half.*capacity',
        r'not.*full.*truck', r'room.*for.*more'
    ]
    
    # Check for partial keywords
    detected_partial_keywords = [kw for kw in partial_keywords if kw in text_lower]
    
    # Check for partial patterns
    detected_partial_patterns = []
    for pattern in partial_patterns:
        matches = re.findall(pattern, text_lower)
        detected_partial_patterns.extend(matches)
    
    # Check weight threshold (under 20,000 lbs suggests partial)
    partial_weight_threshold = weight_lb < 20000 if isinstance(weight_lb, int) and weight_lb > 0 else False
    
    if detected_partial_keywords or detected_partial_patterns or partial_weight_threshold:
        complexity_flags.append('PARTIAL')
        analysis_parts.append(f"PARTIAL detected: keywords={detected_partial_keywords}, patterns={detected_partial_patterns}, weight={weight_lb}")
    
    # ═══════════════════════════════════════════════════════════════════════
    # SPECIALIZED FLATBED DETECTION
    # ═══════════════════════════════════════════════════════════════════════
    flatbed_keywords = [
        'flatbed', 'stepdeck', 'lowboy', 'rgn', 'double drop', 'machinery',
        'construction', 'steel', 'lumber', 'coils', 'pipes', 'equipment',
        'tarps', 'chains', 'securement', 'tie downs'
    ]
    
    flatbed_patterns = [
        r'flatbed', r'stepdeck', r'lowboy', r'rgn', r'double.*drop',
        r'tie.*down', r'securement', r'tarps?', r'chains?'
    ]
    
    # Check for flatbed keywords
    detected_flatbed_keywords = [kw for kw in flatbed_keywords if kw in text_lower]
    
    # Check for flatbed patterns
    detected_flatbed_patterns = []
    for pattern in flatbed_patterns:
        matches = re.findall(pattern, text_lower)
        detected_flatbed_patterns.extend(matches)
    
    # Check equipment type from extraction
    equipment = load_data.get('equipment', '').lower()
    flatbed_equipment = equipment in ['flatbed', 'stepdeck', 'lowboy', 'rgn', 'double drop']
    
    if detected_flatbed_keywords or detected_flatbed_patterns or flatbed_equipment:
        complexity_flags.append('FLATBED')
        analysis_parts.append(f"FLATBED detected: keywords={detected_flatbed_keywords}, patterns={detected_flatbed_patterns}, equipment={equipment}")
    
    # ═══════════════════════════════════════════════════════════════════════
    # COMPILE ANALYSIS SUMMARY
    # ═══════════════════════════════════════════════════════════════════════
    if complexity_flags:
        detailed_analysis = f"Complex freight detected with {len(complexity_flags)} complexity types: {', '.join(complexity_flags)}. " + "; ".join(analysis_parts)
    else:
        detailed_analysis = "Simple freight load suitable for automation. No complexity flags detected."
    
    return complexity_flags, detailed_analysis

def generate_missing_info_email(load_data: dict, missing_fields: List[str], 
                               shipper_email: str, original_subject: str) -> dict:
    """
    Generate a professional email requesting missing load information.
    
    BUSINESS LOGIC:
    - Uses LLM to create contextual, professional response
    - Clearly lists what information is needed
    - References the partial information already received
    - Maintains friendly, helpful tone
    
    ARGS:
        load_data: Partial load data already extracted
        missing_fields: List of required fields that are missing
        shipper_email: Email address to send request to
        original_subject: Subject line from original email
        
    RETURNS:
        Dict with 'to', 'subject', and 'body' fields for email
    """
    if not shipper_email:
        print("⚠️  Cannot send email - no shipper email address found")
        return None
    
    # Create human-readable field names
    field_descriptions = {
        "origin_zip": "pickup ZIP code",
        "dest_zip": "delivery ZIP code",
        "pickup_dt": "pickup date",
        "equipment": "equipment type (Van, Flatbed, Reefer, etc.)",
        "weight_lb": "total weight in pounds",
        "origin_city": "pickup city",
        "origin_state": "pickup state",
        "dest_city": "delivery city",
        "dest_state": "delivery state"
    }
    
    # Build context about what we already have
    available_info = []
    if load_data.get("origin_zip"):
        available_info.append(f"Pickup ZIP: {load_data['origin_zip']}")
    if load_data.get("dest_zip"):
        available_info.append(f"Delivery ZIP: {load_data['dest_zip']}")
    if load_data.get("pickup_dt"):
        available_info.append(f"Pickup Date: {load_data['pickup_dt']}")
    if load_data.get("equipment"):
        available_info.append(f"Equipment: {load_data['equipment']}")
    if load_data.get("weight_lb"):
        available_info.append(f"Weight: {load_data['weight_lb']} lbs")
    if load_data.get("commodity"):
        available_info.append(f"Commodity: {load_data['commodity']}")
    
    # Build list of missing fields
    missing_descriptions = [field_descriptions.get(field, field) for field in missing_fields]
    
    # Use LLM to generate professional email
    prompt = f"""Generate a professional, friendly email requesting missing freight information.

Context:
- We received a load request but it's missing some required information
- Original subject: {original_subject}
- Information we already have: {', '.join(available_info) if available_info else 'Limited information'}
- Missing information needed: {', '.join(missing_descriptions)}

Write a brief, professional email that:
1. Thanks them for their load request
2. Mentions what information we already received
3. Clearly lists what information we still need
4. Asks them to reply with the missing details
5. Offers to help if they have questions

Keep it concise and friendly. Do not include subject line or signature."""
    
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        email_body = response.content.strip()
        
        # Add signature
        email_body += "\n\nBest regards,\nAI-Broker Team\nloads@ai-broker.com\n(555) 123-4567"
        
        return {
            "to": shipper_email,
            "subject": f"Re: {original_subject} - Additional Information Needed",
            "body": email_body
        }
    except Exception as e:
        print(f"❌ Error generating email: {e}")
        # Fallback to template
        email_body = f"""Thank you for your load request.

We've received the following information:
{chr(10).join('• ' + info for info in available_info)}

To proceed with your request, we need the following additional information:
{chr(10).join('• ' + desc for desc in missing_descriptions)}

Please reply to this email with the missing details, and we'll get your load posted to our carrier network right away.

If you have any questions, please don't hesitate to reach out.

Best regards,
AI-Broker Team
loads@ai-broker.com
(555) 123-4567"""
        
        return {
            "to": shipper_email,
            "subject": f"Re: {original_subject} - Additional Information Needed",
            "body": email_body
        }

def save_incomplete_load(load_data: dict, missing_fields: List[str],
                        email_from: str, email_message_id: str,
                        thread_id: str, request_message_id: str):
    """
    Save an incomplete load to the database with email threading information.
    
    BUSINESS LOGIC:
    - Creates load record with is_complete=false
    - Stores email thread information for tracking replies
    - Records what fields were requested
    - Sets up for future workflow resumption
    
    DATABASE OPERATIONS:
    - Calls Edge Function with incomplete load data
    - Includes email threading metadata
    - Tracks missing field requests
    """
    # Prepare load data for database
    load_copy = load_data.copy()
    
    # Add metadata fields
    load_copy["source_type"] = "EMAIL"
    load_copy["source_email_id"] = email_message_id or f"email-{uuid.uuid4()}"
    load_copy["shipper_email"] = email_from
    load_copy["missing_fields"] = missing_fields
    load_copy["ai_notes"] = f"Incomplete load - requested: {', '.join(missing_fields)}"
    
    # Add email threading fields
    load_copy["is_complete"] = False
    load_copy["thread_id"] = thread_id
    load_copy["original_message_id"] = email_message_id
    load_copy["latest_message_id"] = request_message_id
    load_copy["fields_requested"] = missing_fields
    load_copy["missing_info_requested_at"] = datetime.now().isoformat()
    load_copy["follow_up_count"] = 1
    
    # Add initial email conversation entry
    load_copy["email_conversation"] = [{
        "timestamp": datetime.now().isoformat(),
        "direction": "outbound",
        "message_id": request_message_id,
        "type": "missing_info_request",
        "fields_requested": missing_fields
    }]
    
    # Call Edge Function to save incomplete load
    try:
        response = requests.post(
            FN_CREATE_LOAD_URL,
            json=load_copy,
            headers={
                "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                "Content-Type": "application/json"
            },
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Saved incomplete load: {result.get('load_number', 'Unknown')}")
            print(f"   Thread ID: {thread_id}")
            print(f"   Missing fields: {', '.join(missing_fields)}")
        else:
            print(f"❌ Failed to save incomplete load: {response.status_code}")
            print(f"   Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Error saving incomplete load: {e}")
        print("   Check SUPABASE_URL and network connectivity")

# ╔══════════ 3. LangGraph Node Functions ═══════════════════════════════════════
def classify(state: GState) -> Dict[str, Any]:
    """
    CORE AI EXTRACTION NODE: Uses LLM to extract structured load data from email.
    
    EXTRACTION STRATEGY:
    1. Detailed prompt with field specifications
    2. JSON-only response format for consistent parsing
    3. Fallback handling for malformed JSON
    4. Zip code to city/state mapping for common cases
    
    PROMPT ENGINEERING:
    - Explicit field definitions with examples
    - Required vs optional field distinction
    - Format specifications (dates, state codes)
    - Zip code knowledge for common freight lanes
    
    ARGS:
        state: Current workflow state with raw_text
        
    RETURNS:
        Dict containing:
        - load: Extracted and structured load data
        - missing: List of fields that couldn't be extracted
        
    BUSINESS CONTEXT:
    This is the core AI functionality that replaces manual data entry.
    Quality of extraction directly impacts downstream automation.
    """
    prompt = (
        "Extract freight load information from this email and return ONLY a JSON object with these exact fields:\n"
        "REQUIRED fields (matching database schema):\n"
        "- origin_zip: pickup zip code (5 digits)\n"
        "- dest_zip: delivery zip code (5 digits)\n"
        "- pickup_dt: pickup date (YYYY-MM-DD format)\n"
        "- equipment: equipment type (Van, Flatbed, Reefer, etc.)\n"
        "- weight_lb: weight in pounds (number only)\n\n"
        "OPTIONAL but recommended:\n"
        "- origin_city: pickup city name\n"
        "- origin_state: pickup state (2-letter code)\n"
        "- dest_city: delivery city name\n"
        "- dest_state: delivery state (2-letter code)\n\n"
        "OPTIONAL fields (include if available):\n"
        "- commodity: what's being shipped\n"
        "- rate_per_mile: rate per mile if mentioned\n"
        "- total_miles: total miles if mentioned\n"
        "- hazmat: true if hazardous materials, false otherwise\n"
        "- shipper_name: company name\n"
        "- shipper_email: contact email\n"
        "- shipper_phone: contact phone\n"
        "- dimensions: length x width x height if mentioned\n"
        "- pieces: number of pieces/pallets\n"
        "- special_instructions: any special handling notes\n\n"
        "COMPLEXITY DETECTION - Look for these patterns:\n"
        "- Multiple stops: 'then deliver to', 'multiple locations', 'first pickup', 'second delivery'\n"
        "- Hazmat: 'hazardous', 'dangerous goods', 'flammable', 'UN number', 'placard', 'hazmat'\n"
        "- Oversize: 'oversize', 'overweight', 'permit required', 'escort', 'wide load'\n"
        "- Intermodal: 'rail', 'container', 'intermodal', 'ramp', 'TOFC', 'COFC'\n"
        "- LTL: 'LTL', 'less than truckload', 'partial load', weight under 10,000 lbs\n"
        "- Specialized: 'flatbed', 'stepdeck', 'lowboy', 'machinery', 'construction equipment'\n\n"
        "For dates, if only date is given, assume 8:00 AM local time.\n"
        "For zip codes, extract the 5-digit zip code even if city/state is also given.\n\n"
        "Return only valid JSON, no explanations:\n\n"
        f"EMAIL:\n{state['raw_text']}"
    )
    
    # Get LLM response
    raw = llm.invoke([HumanMessage(content=prompt)]).content.strip()
    
    # Clean up JSON formatting (remove markdown code blocks)
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
    
    # Parse JSON with fallback for malformed responses
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}  # Empty dict will trigger missing fields validation

    # Perform comprehensive complexity detection
    complexity_flags, complexity_analysis = detect_freight_complexity(state['raw_text'], data)
    
    # Add complexity information to load data
    data["complexity_flags"] = complexity_flags
    data["complexity_analysis"] = complexity_analysis
    data["requires_human_review"] = len(complexity_flags) > 0
    
    return {"load": data, "missing": missing(data)}

def ask_more(state: GState) -> Dict[str, Any]:
    """
    TERMINAL NODE: Handle incomplete load information by sending email to shipper.
    
    CURRENT BEHAVIOR:
    - Generates a professional email requesting missing information
    - Sends email via Resend API with proper threading headers
    - Stores incomplete load in database with is_complete=false
    - Tracks email conversation for audit trail
    
    EMAIL FEATURES:
    - Uses LLM to draft contextual, professional response
    - Includes Message-ID for thread tracking
    - References original email for context
    - Lists specific missing fields clearly
    
    ARGS:
        state: Current workflow state with missing fields
        
    RETURNS:
        Dict: Empty (workflow terminates)
        
    BUSINESS CONTEXT:
    Incomplete tenders are common. This node ensures we get complete
    information before proceeding to carrier outreach.
    """
    print("❓ Need:", state["missing"])
    
    # Extract available load data
    load_data = state["load"]
    missing_fields = state["missing"]
    
    # Generate email asking for missing information
    email_content = generate_missing_info_email(
        load_data=load_data,
        missing_fields=missing_fields,
        shipper_email=state.get("email_from", load_data.get("shipper_email")),
        original_subject=state.get("email_subject", "Your load request")
    )
    
    # Send email if Resend is configured
    if RESEND_API_KEY and email_content:
        try:
            # Generate unique Message-ID for thread tracking
            message_id = f"<{uuid.uuid4()}@ai-broker.com>"
            
            # Send email with threading headers
            email_params = {
                "from": "onboarding@resend.dev",
                "to": [email_content["to"]],
                "subject": email_content["subject"],
                "text": email_content["body"],
                "headers": {
                    "Message-ID": message_id,
                    "In-Reply-To": state.get("email_message_id", ""),
                    "References": state.get("email_message_id", "")
                },
                "tags": [
                    {"name": "type", "value": "missing_info_request"},
                    {"name": "missing_fields", "value": "_".join(missing_fields)}
                ]
            }
            
            email_result = resend.Emails.send(email_params)
            print(f"✉️  Sent missing info request to {email_content['to']}")
            print(f"   Message ID: {message_id}")
            
            # Store incomplete load in database
            save_incomplete_load(
                load_data=load_data,
                missing_fields=missing_fields,
                email_from=state.get("email_from"),
                email_message_id=state.get("email_message_id"),
                thread_id=f"thread-{uuid.uuid4()}",
                request_message_id=message_id
            )
            
        except Exception as e:
            print(f"❌ Failed to send email: {e}")
            print(f"   Error type: {type(e).__name__}")
            import traceback
            print(f"   Traceback: {traceback.format_exc()}")
            print("   Please configure RESEND_API_KEY in .env file")
    else:
        print("⚠️  Resend not configured - cannot send missing info request")
        print("   Set RESEND_API_KEY in .env file to enable email sending")
    
    return {}

def ack(state: GState) -> Dict[str, Any]:
    """
    TERMINAL NODE: Save complete load via Edge Function and trigger next workflow.
    
    EDGE FUNCTION OPERATIONS:
    1. Copy load data to avoid mutations
    2. Add required metadata fields
    3. Extract shipper email from raw text
    4. Generate unique email message ID
    5. Call fn_create_load Edge Function
    6. Handle API errors gracefully
    
    METADATA ENRICHMENT:
    - source_type: Always "EMAIL" for this agent
    - raw_email_text: Original email for audit trail
    - source_email_id: Unique identifier for tracking
    - extraction_confidence: AI confidence score
    - ai_notes: Processing notes
    
    ARGS:
        state: Current workflow state with complete load data
        
    RETURNS:
        Dict: Empty (workflow terminates)
        
    BUSINESS CONTEXT:
    Complete loads are ready for carrier outreach. This node persists
    the data via Edge Function and sets up the next stage of automation.
    """
    load_data = state["load"].copy()  # Don't modify the original state
    
    # Add required metadata fields for Edge Function
    load_data["source_type"] = "EMAIL"
    load_data["raw_email_text"] = state["raw_text"]
    load_data["source_email_id"] = state.get("email_message_id", f"email-{uuid.uuid4()}")
    load_data["extraction_confidence"] = 0.95  # High confidence for complete extractions
    load_data["ai_notes"] = "Processed by intake_graph.py LangGraph agent"
    
    # Mark as complete since all required fields are present
    load_data["is_complete"] = True
    load_data["missing_fields"] = []  # No missing fields
    
    # Add email threading information if available
    if state.get("email_message_id"):
        load_data["original_message_id"] = state["email_message_id"]
        load_data["latest_message_id"] = state["email_message_id"]
        load_data["thread_id"] = f"thread-{uuid.uuid4()}"
        load_data["email_conversation"] = [{
            "timestamp": datetime.now().isoformat(),
            "direction": "inbound",
            "message_id": state["email_message_id"],
            "type": "initial_tender",
            "subject": state.get("email_subject", "Load Request")
        }]
    
    # Use email from state if available, otherwise extract from raw text
    if state.get("email_from"):
        load_data["shipper_email"] = state["email_from"]
    elif "shipper_email" not in load_data:
        raw_text = state["raw_text"]
        if "From:" in raw_text:
            from_line = [line for line in raw_text.split('\n') if line.startswith('From:')]
            if from_line:
                load_data["shipper_email"] = from_line[0].replace('From:', '').strip()
    
    try:
        # Call Edge Function to create load
        headers = {
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(
            FN_CREATE_LOAD_URL,
            json=load_data,
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 201:
            # Success feedback
            result = response.json()
            print("✅ Load saved via Edge Function:")
            print(f"   Load ID: {result.get('load_id')}")
            print(f"   Load Number: {result.get('load_number')}")
            print(f"   Status: {result.get('message', 'Success')}")
            
            # Display complexity information
            complexity_flags = load_data.get('complexity_flags', [])
            if complexity_flags:
                print(f"⚠️  COMPLEXITY DETECTED: {', '.join(complexity_flags)}")
                print(f"   Reason: {load_data.get('complexity_analysis', 'Complex freight requiring human review')}")
                print(f"   🔒 AUTOMATION DISABLED - Load requires human broker review")
                print(f"   📋 Broker should review this load before proceeding")
            else:
                print("✅ Simple load - eligible for automation")
                print("📣 Event: load.created (triggered by database)")
            
            # Show next steps based on complexity
            if complexity_flags:
                print("\n🔄 Next Steps:")
                print("   1. Broker reviews load in dashboard")
                print("   2. Broker approves or handles manually")
                print("   3. If approved, LoadBlast Agent can proceed")
            else:
                print("\n🔄 Next Steps:")
                print("   1. LoadBlast Agent will automatically contact carriers")
                print("   2. Monitor for carrier responses")
                print("   3. Broker books best offer")
            
        else:
            # API error handling
            print(f"❌ Edge Function error: {response.status_code}")
            print(f"   Response: {response.text}")
            print("📝 Load data:", json.dumps(load_data, indent=2))
            
    except requests.exceptions.Timeout:
        print("❌ Edge Function timeout (30s)")
        print("📝 Load data:", json.dumps(load_data, indent=2))
        
    except requests.exceptions.ConnectionError:
        print("❌ Edge Function connection error")
        print("   Check SUPABASE_URL and network connectivity")
        print("📝 Load data:", json.dumps(load_data, indent=2))
        
    except Exception as e:
        print(f"❌ Unexpected error calling Edge Function: {e}")
        print("📝 Load data:", json.dumps(load_data, indent=2))
    
    return {}

# ╔══════════ 4. Workflow Routing Logic ═══════════════════════════════════════
def route_after_classify(state: GState) -> str:
    """
    CONDITIONAL ROUTER: Determines next node based on extraction completeness.
    
    ROUTING LOGIC:
    - If any required fields are missing → "ask_more"
    - If all required fields are present → "ack"
    
    ARGS:
        state: Current workflow state
        
    RETURNS:
        str: Next node name ("ask_more" or "ack")
        
    BUSINESS CONTEXT:
    This enforces data quality standards. Only complete loads proceed
    to carrier outreach, preventing confusion and delays.
    """
    return "ask_more" if state["missing"] else "ack"

# ╔══════════ 5. LangGraph Construction ═══════════════════════════════════════
def build_agent():
    """
    Construct and compile the LangGraph state machine.
    
    GRAPH STRUCTURE:
    - Entry point: classify (AI extraction)
    - Conditional routing: route_after_classify
    - Terminal nodes: ask_more, ack
    
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
    g = StateGraph(GState)

    # Add workflow nodes
    g.add_node("classify", classify)
    g.add_node("ask_more", ask_more)
    g.add_node("ack", ack)

    # Add conditional routing
    g.add_conditional_edges("classify", route_after_classify)
    
    # Define workflow entry and exit points
    g.set_entry_point("classify")
    g.set_finish_point({"ack", "ask_more"})

    # Add SQLite checkpointing for persistence
    conn = sqlite3.connect("broker_state.sqlite", check_same_thread=False)
    saver = SqliteSaver(conn)
    
    return g.compile(checkpointer=saver)

# Global agent instance
agent = build_agent()

# ╔══════════ 6. Command Line Interface ═══════════════════════════════════════
def main() -> None:
    """
    CLI wrapper for the Intake Agent.
    
    USAGE:
        python intake_graph.py path/to/email.eml
    
    WORKFLOW:
    1. Validate command line arguments
    2. Check file existence
    3. Parse email file
    4. Generate unique run ID for checkpointing
    5. Execute agent with email content
    
    ERROR HANDLING:
    - Invalid arguments → usage message
    - Missing files → error message
    - Exceptions → bubble up for debugging
    
    BUSINESS CONTEXT:
    This is the entry point for processing individual tender emails.
    In production, this would be triggered by email webhooks.
    """
    # Validate command line arguments
    if len(sys.argv) != 2:
        print("Usage: python intake_graph.py path/to/email.eml")
        sys.exit(1)

    # Validate file existence
    path = Path(sys.argv[1]).expanduser()
    if not path.exists():
        print("File not found:", path)
        sys.exit(1)

    # Generate unique run ID for checkpointing
    run_id = f"intake-{uuid.uuid4()}"
    
    # Parse email with headers for threading
    email_data = parse_email_with_headers(path)
    
    # Execute agent workflow
    agent.invoke(
        {
            "raw_text": email_data["body"],
            "email_from": email_data["from"],
            "email_message_id": email_data["message_id"],
            "email_subject": email_data["subject"]
        },
        config={"thread_id": run_id},   # Required for SQLite checkpointing
    )

if __name__ == "__main__":
    main()

# ╔══════════ SYSTEM ARCHITECTURE NOTES ═══════════════════════════════════════
"""
INTEGRATION POINTS:
1. Input: .eml files from email forwarding/webhooks
2. Output: Structured loads in Supabase database
3. Triggers: LoadBlast Agent when status="NEW_RFQ"
4. Monitoring: SQLite checkpoints for workflow state

SCALING CONSIDERATIONS:
- Stateless design enables horizontal scaling
- Database connections should be pooled in production
- LLM calls can be batched for efficiency
- Email processing can be parallelized

MAINTENANCE:
- Monitor LLM extraction quality and retrain prompts
- Update REQUIRED fields as business needs change
- Add new email formats as customers onboard
- Implement comprehensive error logging

BUSINESS METRICS:
- Extraction accuracy rate
- Processing time per email
- Missing field frequency
- Database save success rate
"""
# --------------------------- end of file ------------------------------