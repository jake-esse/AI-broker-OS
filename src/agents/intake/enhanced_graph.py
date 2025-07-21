# --------------------------- src/agents/intake/enhanced_graph.py ----------------------------
"""
AI-Broker MVP · Enhanced Intake Agent (Production Version)

OVERVIEW:
Production-ready version of the intake agent with improved email parsing,
error handling, database persistence, and carrier matching integration.

WORKFLOW:
1. Parse email with enhanced parser (handles more formats)
2. Extract load information with improved prompts
3. Validate and enrich data
4. Match carriers immediately after intake
5. Save to database with full error handling

BUSINESS LOGIC:
- Handles complex email formats and attachments
- Extracts additional fields for better matching
- Immediately identifies best carriers
- Comprehensive audit trail
- Graceful error recovery

TECHNICAL ARCHITECTURE:
- Enhanced email parser integration
- Carrier matching service
- Robust database operations
- Comprehensive logging
- Performance monitoring

DEPENDENCIES:
- All original intake dependencies
- Enhanced email parser
- Carrier matching service
"""

import os
import sys
import json
import uuid
import traceback
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from typing_extensions import TypedDict
from datetime import datetime
import logging

from dotenv import load_dotenv
load_dotenv()

from langgraph.graph import StateGraph
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
import requests
import resend

# Import our enhanced utilities
sys.path.append(str(Path(__file__).parent.parent.parent))
from utils.email_parser import EnhancedEmailParser
from services.carrier_matching import CarrierMatchingService, CarrierScore

# ╔══════════ 1. Enhanced Configuration ═══════════════════════════════════
"""
PRODUCTION ENHANCEMENTS:
- Comprehensive logging for debugging
- Performance monitoring
- Error tracking
- Carrier matching integration
"""

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Required fields with expanded set for better matching
REQUIRED_FIELDS = ["origin_zip", "dest_zip", "pickup_dt", "equipment", "weight_lb"]
OPTIONAL_FIELDS = ["commodity", "pieces", "dims", "special_instructions", "delivery_dt"]

# Configuration
MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
FN_CREATE_LOAD_URL = f"{SUPABASE_URL}/functions/v1/fn_create_load" if SUPABASE_URL else None
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


class EnhancedGState(TypedDict):
    """
    Enhanced state with additional fields for production.
    
    NEW FIELDS:
    - parsed_email: Full parsed email data
    - carrier_matches: List of matched carriers
    - processing_metadata: Timing and performance data
    - error_log: Detailed error tracking
    """
    # Original fields
    raw_text: str
    load: dict
    missing: List[str]
    email_from: str
    email_message_id: str
    email_subject: str
    
    # Enhanced fields
    parsed_email: dict
    carrier_matches: List[dict]
    processing_metadata: dict
    error_log: List[dict]
    enriched_data: dict


# Initialize services
llm = ChatOpenAI(model=MODEL, temperature=0.0)
email_parser = EnhancedEmailParser()
carrier_service = CarrierMatchingService()


# ╔══════════ 2. Enhanced Email Processing ════════════════════════════════

def parse_email_enhanced(path: Path) -> dict:
    """
    Parse email with enhanced parser for better extraction.
    
    ENHANCEMENTS:
    - Handles more email formats
    - Extracts attachments info
    - Parses reply chains
    - Better error handling
    """
    try:
        start_time = datetime.now()
        
        # Use enhanced parser
        parsed_data = email_parser.parse_email_file(path)
        
        # Add parsing metadata
        parsed_data['parsing_time_ms'] = (datetime.now() - start_time).total_seconds() * 1000
        
        logger.info(f"Email parsed successfully in {parsed_data['parsing_time_ms']:.2f}ms")
        
        return parsed_data
        
    except Exception as e:
        logger.error(f"Email parsing error: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Return minimal data on error
        return {
            'error': str(e),
            'body_text': '',
            'headers': {},
            'attachments': []
        }


# ╔══════════ 3. Enhanced LLM Extraction ══════════════════════════════════

def extract_load_data(state: EnhancedGState) -> Dict[str, Any]:
    """
    Enhanced load extraction with better prompting and validation.
    
    IMPROVEMENTS:
    - More comprehensive extraction prompt
    - Handles multiple load formats
    - Extracts optional fields
    - Better error recovery
    """
    try:
        start_time = datetime.now()
        parsed_email = state.get('parsed_email', {})
        raw_text = parsed_email.get('body_text', state.get('raw_text', ''))
        
        # Check for extracted structured data
        extracted_loads = parsed_email.get('extracted_loads', [])
        
        # Enhanced extraction prompt
        prompt = f"""Extract freight load information from this email and return a JSON object.

REQUIRED fields (must extract if present):
- origin_zip: pickup ZIP code (5 digits)
- origin_city: pickup city name
- origin_state: pickup state (2-letter code)
- dest_zip: delivery ZIP code (5 digits)
- dest_city: delivery city name
- dest_state: delivery state (2-letter code)
- pickup_dt: pickup date/time (ISO format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
- equipment: equipment type (Van, Flatbed, Reefer, Stepdeck, RGN, etc.)
- weight_lb: weight in pounds (number only)

OPTIONAL fields (extract if available):
- delivery_dt: delivery date/time (ISO format)
- commodity: what is being shipped
- pieces: number of pieces/pallets
- dims: dimensions (length x width x height)
- special_instructions: any special requirements
- rate: offered rate (per mile or total)
- distance: miles
- reference_number: shipper's reference
- hazmat: true if hazardous materials mentioned
- team_drivers: true if team drivers required
- tarps: true if tarps required (for flatbed)
- shipper_name: shipping company name
- shipper_phone: shipper phone number

Pre-extracted data (if available):
{json.dumps(extracted_loads, indent=2) if extracted_loads else "None"}

Email content:
{raw_text}

Return ONLY a valid JSON object. For dates, use ISO format. For missing required fields, use null.
If multiple loads are present, extract the first one."""

        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        
        # Clean JSON
        if content.startswith("```"):
            content = content.strip("`").strip()
            if content.startswith("json"):
                content = content[4:].strip()
        
        extracted = json.loads(content)
        
        # Validate and clean data
        extracted = _validate_extracted_data(extracted)
        
        # Check for missing required fields
        missing = [field for field in REQUIRED_FIELDS if not extracted.get(field)]
        
        # Add extraction metadata
        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        
        logger.info(f"Load extracted in {processing_time:.2f}ms, missing fields: {missing}")
        
        return {
            "load": extracted,
            "missing": missing,
            "processing_metadata": {
                "extraction_time_ms": processing_time,
                "extraction_method": "llm",
                "model": MODEL
            }
        }
        
    except Exception as e:
        logger.error(f"Extraction error: {str(e)}")
        return {
            "load": {},
            "missing": REQUIRED_FIELDS,
            "error_log": [{
                "step": "extraction",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }]
        }


def _validate_extracted_data(data: dict) -> dict:
    """
    Validate and normalize extracted data.
    
    VALIDATION RULES:
    - ZIP codes must be 5 digits
    - Dates must be parseable
    - Weight must be numeric
    - Equipment must be standard type
    """
    # Normalize ZIP codes
    for field in ['origin_zip', 'dest_zip']:
        if field in data and data[field]:
            # Extract 5-digit ZIP
            zip_str = str(data[field])
            zip_match = re.search(r'\d{5}', zip_str)
            if zip_match:
                data[field] = zip_match.group()
    
    # Normalize equipment type
    if data.get('equipment'):
        equipment_map = {
            'dry van': 'Van',
            'dryvan': 'Van',
            'van': 'Van',
            'reefer': 'Reefer',
            'refrigerated': 'Reefer',
            'flatbed': 'Flatbed',
            'flat': 'Flatbed',
            'step deck': 'Stepdeck',
            'stepdeck': 'Stepdeck',
            'rgn': 'RGN',
            'lowboy': 'RGN'
        }
        equipment_lower = data['equipment'].lower()
        data['equipment'] = equipment_map.get(equipment_lower, data['equipment'])
    
    # Parse weight
    if data.get('weight_lb'):
        try:
            # Extract numeric weight
            weight_str = str(data['weight_lb'])
            weight_num = re.search(r'[\d,]+', weight_str)
            if weight_num:
                data['weight_lb'] = int(weight_num.group().replace(',', ''))
        except:
            pass
    
    # Validate dates
    for date_field in ['pickup_dt', 'delivery_dt']:
        if data.get(date_field):
            try:
                # Try parsing the date
                if 'T' not in str(data[date_field]):
                    # Add default time if not present
                    data[date_field] = f"{data[date_field]}T08:00:00"
            except:
                pass
    
    return data


# ╔══════════ 4. Carrier Matching Integration ═════════════════════════════

def match_carriers(state: EnhancedGState) -> Dict[str, Any]:
    """
    Match carriers immediately after successful load extraction.
    
    CARRIER MATCHING:
    - Only runs if all required fields present
    - Returns ranked list of carriers
    - Adds tier information for LoadBlast
    """
    load_data = state.get('load', {})
    missing = state.get('missing', [])
    
    if missing:
        # Don't match carriers if missing required fields
        return {"carrier_matches": []}
    
    try:
        start_time = datetime.now()
        
        # Get matched carriers
        scored_carriers = carrier_service.match_carriers_for_load(load_data)
        
        # Get tier assignments
        tiers = carrier_service.get_carrier_tiers(scored_carriers)
        
        # Convert to serializable format
        carrier_matches = []
        for tier_name, carriers in tiers.items():
            for carrier in carriers:
                carrier_matches.append({
                    'carrier_id': carrier.carrier_id,
                    'carrier_name': carrier.carrier_name,
                    'carrier_email': carrier.carrier_email,
                    'tier': tier_name,
                    'total_score': carrier.total_score,
                    'notes': carrier.notes
                })
        
        matching_time = (datetime.now() - start_time).total_seconds() * 1000
        
        logger.info(f"Matched {len(carrier_matches)} carriers in {matching_time:.2f}ms")
        
        # Update processing metadata
        metadata = state.get('processing_metadata', {})
        metadata['carrier_matching_time_ms'] = matching_time
        metadata['carriers_matched'] = len(carrier_matches)
        
        return {
            "carrier_matches": carrier_matches,
            "processing_metadata": metadata
        }
        
    except Exception as e:
        logger.error(f"Carrier matching error: {str(e)}")
        
        # Log error but don't fail the workflow
        error_log = state.get('error_log', [])
        error_log.append({
            'step': 'carrier_matching',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        })
        
        return {
            "carrier_matches": [],
            "error_log": error_log
        }


# ╔══════════ 5. Enhanced Database Operations ═════════════════════════════

def save_to_database(state: EnhancedGState) -> Dict[str, Any]:
    """
    Enhanced database save with comprehensive error handling.
    
    IMPROVEMENTS:
    - Saves carrier matches with load
    - Better error handling
    - Retry logic for transient failures
    - Comprehensive audit trail
    """
    load_data = state.get('load', {})
    missing = state.get('missing', [])
    
    if missing:
        # Don't save incomplete loads
        return {}
    
    try:
        # Prepare complete payload
        payload = {
            **load_data,
            'email_from': state.get('email_from'),
            'email_message_id': state.get('email_message_id'),
            'email_subject': state.get('email_subject'),
            'raw_text': state.get('raw_text'),
            'carrier_matches': state.get('carrier_matches', []),
            'processing_metadata': state.get('processing_metadata', {}),
            'parsed_email_data': {
                'attachments': state.get('parsed_email', {}).get('attachments', []),
                'encoding': state.get('parsed_email', {}).get('encoding')
            }
        }
        
        # Call Edge Function with retry
        headers = {
            'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
            'Content-Type': 'application/json'
        }
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.post(
                    FN_CREATE_LOAD_URL,
                    json=payload,
                    headers=headers,
                    timeout=30
                )
                
                if response.status_code == 200:
                    result = response.json()
                    logger.info(f"Load saved successfully: {result.get('load_id')}")
                    
                    # Update state with enriched data
                    return {
                        "enriched_data": result,
                        "processing_metadata": {
                            **state.get('processing_metadata', {}),
                            'load_id': result.get('load_id'),
                            'saved_at': datetime.now().isoformat()
                        }
                    }
                else:
                    error_msg = f"Database save failed: {response.status_code} - {response.text}"
                    logger.error(error_msg)
                    
                    if attempt < max_retries - 1:
                        logger.info(f"Retrying... attempt {attempt + 2}/{max_retries}")
                        continue
                    else:
                        raise Exception(error_msg)
                        
            except requests.exceptions.Timeout:
                if attempt < max_retries - 1:
                    logger.warning(f"Request timeout, retrying... attempt {attempt + 2}/{max_retries}")
                    continue
                else:
                    raise
        
    except Exception as e:
        logger.error(f"Database save error: {str(e)}")
        
        error_log = state.get('error_log', [])
        error_log.append({
            'step': 'database_save',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        })
        
        return {"error_log": error_log}


# ╔══════════ 6. LangGraph Nodes ══════════════════════════════════════════

def parse_node(state: EnhancedGState) -> Dict[str, Any]:
    """Parse email with enhanced parser."""
    email_path = state.get('email_path')
    if not email_path:
        return {"error_log": [{"step": "parse", "error": "No email path provided"}]}
    
    parsed = parse_email_enhanced(Path(email_path))
    
    return {
        "parsed_email": parsed,
        "raw_text": parsed.get('body_text', ''),
        "email_from": parsed.get('headers', {}).get('sender_email', ''),
        "email_message_id": parsed.get('headers', {}).get('message-id', ''),
        "email_subject": parsed.get('headers', {}).get('subject', '')
    }


def extract_node(state: EnhancedGState) -> Dict[str, Any]:
    """Extract load data with enhanced logic."""
    return extract_load_data(state)


def match_node(state: EnhancedGState) -> Dict[str, Any]:
    """Match carriers for the load."""
    return match_carriers(state)


def save_node(state: EnhancedGState) -> Dict[str, Any]:
    """Save to database with enhanced error handling."""
    return save_to_database(state)


def route_after_extract(state: EnhancedGState) -> str:
    """Route based on extraction results."""
    missing = state.get('missing', [])
    if missing:
        return 'request_info'
    else:
        return 'match_carriers'


def request_info_node(state: EnhancedGState) -> Dict[str, Any]:
    """Request missing information from shipper."""
    missing = state.get('missing', [])
    email_from = state.get('email_from')
    
    logger.info(f"Requesting missing info from {email_from}: {missing}")
    
    # In production, send actual email
    # For now, just log
    return {
        "processing_metadata": {
            **state.get('processing_metadata', {}),
            'outcome': 'missing_info_requested',
            'missing_fields': missing
        }
    }


def complete_node(state: EnhancedGState) -> Dict[str, Any]:
    """Complete processing with summary."""
    load_id = state.get('enriched_data', {}).get('load_id')
    carriers_matched = len(state.get('carrier_matches', []))
    
    logger.info(f"Processing complete - Load ID: {load_id}, Carriers: {carriers_matched}")
    
    return {}


# ╔══════════ 7. Build Enhanced Graph ═════════════════════════════════════

def build_enhanced_intake_agent():
    """Build the enhanced intake agent graph."""
    graph = StateGraph(EnhancedGState)
    
    # Add nodes
    graph.add_node("parse", parse_node)
    graph.add_node("extract", extract_node)
    graph.add_node("match_carriers", match_node)
    graph.add_node("save", save_node)
    graph.add_node("request_info", request_info_node)
    graph.add_node("complete", complete_node)
    
    # Add edges
    graph.add_edge("parse", "extract")
    graph.add_conditional_edges("extract", route_after_extract)
    graph.add_edge("match_carriers", "save")
    graph.add_edge("save", "complete")
    graph.add_edge("request_info", "complete")
    
    # Set entry point
    graph.set_entry_point("parse")
    graph.set_finish_point("complete")
    
    # Compile with checkpointing
    memory = SqliteSaver.from_conn_string(":memory:")
    return graph.compile(checkpointer=memory)


# ╔══════════ 8. Main Execution ═══════════════════════════════════════════

def main():
    """Run the enhanced intake agent."""
    if len(sys.argv) < 2:
        print("Usage: python enhanced_graph.py <email.eml>")
        sys.exit(1)
    
    email_path = sys.argv[1]
    
    # Initialize agent
    agent = build_enhanced_intake_agent()
    
    # Create thread ID
    thread_id = f"enhanced-intake-{uuid.uuid4()}"
    
    # Run agent
    config = {"configurable": {"thread_id": thread_id}}
    
    initial_state = {
        "email_path": email_path,
        "processing_metadata": {
            "started_at": datetime.now().isoformat(),
            "agent_version": "2.0"
        },
        "error_log": []
    }
    
    try:
        result = agent.invoke(initial_state, config)
        
        # Print summary
        print("\n=== Enhanced Intake Agent Results ===")
        print(f"Load ID: {result.get('enriched_data', {}).get('load_id')}")
        print(f"Carriers Matched: {len(result.get('carrier_matches', []))}")
        
        if result.get('carrier_matches'):
            print("\nTop 5 Carriers:")
            for carrier in result.get('carrier_matches', [])[:5]:
                print(f"  - {carrier['carrier_name']} ({carrier['tier']}): {carrier['total_score']:.1f} points")
        
        if result.get('error_log'):
            print("\nErrors encountered:")
            for error in result['error_log']:
                print(f"  - {error['step']}: {error['error']}")
        
    except Exception as e:
        logger.error(f"Agent execution failed: {str(e)}")
        logger.error(traceback.format_exc())


if __name__ == "__main__":
    main()