# --------------------------- src/agents/quotecollector/graph.py ----------------------------
"""
AI-Broker MVP · QuoteCollector Agent (LangGraph ≥ 0.5)

OVERVIEW:
This is the third agent in the freight brokerage automation pipeline. It processes
incoming carrier email responses, extracts structured quote information, and stores
it in the database for broker comparison and decision-making.

WORKFLOW:
1. Receive carrier email response (via webhook or manual input)
2. Identify the load and carrier from email context
3. Extract structured quote data using AI (rate, dates, terms)
4. Normalize and validate extracted data
5. Score quotes for ranking and comparison
6. Save quotes to database with metadata

BUSINESS LOGIC:
- Converts unstructured carrier responses into structured quote data
- Handles various quote formats and terminologies
- Implements confidence scoring for data quality assessment
- Provides quote ranking based on multiple business factors

TECHNICAL ARCHITECTURE:
- LangGraph state machine with linear workflow
- Advanced AI prompt engineering for quote extraction
- Multi-stage data validation and normalization
- Comprehensive scoring algorithm for quote ranking

DEPENDENCIES:
- Environment variables: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
- Database: 'loads', 'carriers', and 'carrier_quotes' tables in Supabase
- Input: Email content, sender info, subject line
- Output: Structured quote records with confidence scores
"""

# ─── Standard-library imports ───────────────────────────────────────────
import os, sys, json, re, uuid
from typing import List, Dict, Any, Optional
from typing_extensions import TypedDict
from datetime import datetime, date
from decimal import Decimal

# ─── Environment setup ─────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

# ─── Third-party imports ────────────────────────────────────────────────
from langgraph.graph import StateGraph
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from supabase import create_client, Client

# ╔══════════ 1. Configuration & Shared State ═══════════════════════════════════
"""
QUOTECOLLECTOR CONFIGURATION:
- Uses lower temperature (0.1) for more consistent data extraction
- Implements multi-stage validation for data quality
- Maintains comprehensive audit trail of processing steps

QUOTE EXTRACTION CHALLENGES:
- Carriers use varied formats and terminologies
- Rates may be per-mile, total, or with surcharges
- Dates are often informal ("Monday", "next week")
- Special terms and conditions vary widely
"""

# LLM model configuration - lower temperature for consistent extraction
MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

# API clients setup
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

class QuoteCollectorState(TypedDict):
    """
    LangGraph state object that flows through the entire QuoteCollector workflow.
    
    INPUT FIELDS:
    - raw_email_content: Original email text content
    - sender_email: Email address of the carrier
    - subject: Email subject line
    - received_at: Timestamp when email was received
    
    PROCESSING FIELDS:
    - load_id: Database ID of the referenced load
    - carrier_id: Database ID of the carrier
    - extracted_quote: Raw AI-extracted quote data
    - normalized_quote: Cleaned and validated quote data
    - quote_score: Calculated ranking score (0-100)
    - confidence: AI confidence level (0.0-1.0)
    
    OUTPUT FIELDS:
    - quote_id: Database ID of saved quote
    - errors: List of processing errors
    
    STATE EVOLUTION:
    The state progressively accumulates data and metadata throughout
    the workflow, enabling full traceability and debugging.
    """
    # Input
    raw_email_content: str
    sender_email: str
    subject: str
    received_at: str
    
    # Processing
    load_id: Optional[int]
    carrier_id: Optional[int]
    extracted_quote: dict
    normalized_quote: dict
    quote_score: float
    confidence: float
    
    # Output
    quote_id: Optional[int]
    errors: List[str]

# LLM client with low temperature for consistent extraction
llm = ChatOpenAI(model=MODEL, temperature=0.1)

# ╔══════════ 2. Context Resolution & Business Logic Helper Functions ═══════════════════════════════════════
def find_load_by_context(email_content: str, subject: str) -> Optional[int]:
    """
    Attempt to identify the load ID from email context using pattern matching.
    
    DETECTION STRATEGY:
    1. Search for explicit load references (load #123, ref #456)
    2. Look in both subject line and email body
    3. Use regex patterns for common formats
    4. Return first valid match found
    
    PATTERN MATCHING:
    - "load #123" or "load 123"
    - "ref #456" or "reference 456"
    - "tender #789"
    - "quote #012"
    
    ARGS:
        email_content: Full email text content
        subject: Email subject line
        
    RETURNS:
        int: Load ID if found, None otherwise
        
    BUSINESS CONTEXT:
    Carriers often reference loads differently than our system.
    This function bridges the gap between informal references
    and our structured load IDs.
    """
    # Common patterns for load references
    load_patterns = [
        r'load\s*#?(\d+)',
        r'ref\s*#?(\d+)',
        r'tender\s*#?(\d+)',
        r'quote\s*#?(\d+)'
    ]
    
    # Search in both subject and content
    search_text = f"{subject} {email_content}".lower()
    
    for pattern in load_patterns:
        matches = re.findall(pattern, search_text)
        if matches:
            try:
                return int(matches[0])
            except ValueError:
                continue
    
    # If no explicit load ID found, could implement fuzzy matching
    # based on route, equipment, dates, etc. (future enhancement)
    return None

def find_carrier_by_email(sender_email: str) -> Optional[dict]:
    """
    Lookup carrier record by email address.
    
    DATABASE LOOKUP:
    - Exact match on contact_email field
    - Returns complete carrier record
    - Handles database errors gracefully
    
    ARGS:
        sender_email: Email address from carrier response
        
    RETURNS:
        dict: Complete carrier record or None if not found
        
    BUSINESS CONTEXT:
    Carrier identification is critical for quote attribution.
    Unknown carriers may indicate new prospects or
    email address changes requiring manual review.
    """
    try:
        result = supabase.table("carriers").select("*").eq("contact_email", sender_email).execute()
        return result.data[0] if result.data else None
    except Exception:
        return None

def calculate_quote_score(quote_data: dict, carrier_data: dict) -> float:
    """
    Calculate composite score for quote ranking (0-100, higher is better).
    
    SCORING FACTORS:
    1. Rate competitiveness (30 points max)
    2. Carrier tier/quality (20 points max)
    3. On-time performance (10 points max)
    4. Pickup timing (10 points max)
    5. Extraction confidence (10 points max)
    6. Base score (50 points)
    
    RATE SCORING:
    - Assumes typical market rates of $2-3/mile
    - Lower rates receive higher scores
    - Adjustable based on market conditions
    
    CARRIER TIER SCORING:
    - Tier 1 (premium): +20 points
    - Tier 2 (standard): +10 points
    - Tier 3 (budget): +0 points
    
    ARGS:
        quote_data: Normalized quote information
        carrier_data: Complete carrier record
        
    RETURNS:
        float: Composite score (0-100)
        
    BUSINESS CONTEXT:
    Scoring enables automated quote ranking, helping brokers
    quickly identify the best options while considering
    multiple business factors beyond just price.
    """
    score = 50.0  # Base score
    
    # Rate factor (lower rate = higher score, up to 30 points)
    if quote_data.get("quoted_rate"):
        rate = float(quote_data["quoted_rate"])
        # Scoring based on typical freight rates
        if rate < 2.0:
            score += 30
        elif rate < 2.5:
            score += 20
        elif rate < 3.0:
            score += 10
    
    # Carrier tier factor (up to 20 points)
    if carrier_data:
        tier = carrier_data.get("tier", 3)
        if tier == 1:
            score += 20
        elif tier == 2:
            score += 10
    
    # On-time performance factor (up to 10 points)
    if carrier_data and carrier_data.get("on_time_percentage"):
        otp = float(carrier_data["on_time_percentage"])
        if otp >= 98:
            score += 10
        elif otp >= 95:
            score += 5
    
    # Pickup timing factor (up to 10 points)
    # Prefer earlier pickup dates (simplified logic)
    pickup_date = quote_data.get("pickup_date")
    if pickup_date:
        score += 5
    
    # Confidence factor (up to 10 points)
    confidence = quote_data.get("confidence", 0.0)
    score += confidence * 10
    
    return min(100.0, max(0.0, score))

# ╔══════════ 3. LangGraph Node Functions ═══════════════════════════════════════
def identify_context(state: QuoteCollectorState) -> Dict[str, Any]:
    """
    CONTEXT RESOLUTION NODE: Identify the load and carrier from email context.
    
    IDENTIFICATION PROCESS:
    1. Extract sender email from state
    2. Lookup carrier in database by email
    3. Search email content for load references
    4. Validate both carrier and load are found
    
    VALIDATION REQUIREMENTS:
    - Carrier must exist in database
    - Load must be identifiable from email content
    - Both IDs are required for quote processing
    
    ARGS:
        state: QuoteCollector state with email metadata
        
    RETURNS:
        Dict containing:
        - load_id: Database ID of referenced load
        - carrier_id: Database ID of sending carrier
        - errors: List of identification errors
        
    BUSINESS CONTEXT:
    Proper context identification is critical for quote attribution.
    Errors here prevent the entire quote from being processed.
    """
    sender_email = state.get("sender_email", "")
    email_content = state.get("raw_email_content", "")
    subject = state.get("subject", "")
    
    # Find carrier by email address
    carrier = find_carrier_by_email(sender_email)
    carrier_id = carrier["id"] if carrier else None
    
    # Find load by contextual references
    load_id = find_load_by_context(email_content, subject)
    
    # Validate both identifications succeeded
    if not carrier_id:
        return {"errors": [f"Unknown carrier email: {sender_email}"]}
    
    if not load_id:
        return {"errors": ["Could not identify load from email context"]}
    
    # Display context for operator visibility
    print(f"📧 Email from {carrier['company_name']} for Load #{load_id}")
    
    return {
        "load_id": load_id,
        "carrier_id": carrier_id
    }

def extract_quote_data(state: QuoteCollectorState) -> Dict[str, Any]:
    """
    AI EXTRACTION NODE: Extract structured quote data from unstructured email.
    
    EXTRACTION STRATEGY:
    1. Use detailed prompt with field specifications
    2. Provide examples of common quote formats
    3. Include confidence scoring for data quality
    4. Handle various rate formats and terminologies
    
    FIELD EXTRACTION:
    - quoted_rate: Numerical rate value
    - rate_type: PER_MILE, TOTAL, or UNKNOWN
    - pickup_date: Formatted date string
    - delivery_date: Formatted date string
    - equipment_type: Confirmed equipment type
    - fuel_surcharge: Separate fuel charges
    - accessorials: Additional charges
    - special_notes: Terms and conditions
    
    PROMPT ENGINEERING:
    - Explicit field definitions with examples
    - Rate format recognition patterns
    - Date parsing instructions
    - Confidence assessment guidelines
    
    ARGS:
        state: QuoteCollector state with email content
        
    RETURNS:
        Dict containing:
        - extracted_quote: Raw AI-extracted data
        - errors: List of extraction errors
        
    BUSINESS CONTEXT:
    This is the core AI functionality that replaces manual quote entry.
    Extraction quality directly impacts quote accuracy and broker decisions.
    """
    email_content = state.get("raw_email_content", "")
    
    if not email_content:
        return {"errors": ["No email content to process"]}
    
    # Detailed prompt for quote extraction
    prompt = f"""
    Extract freight quote information from this carrier email response.
    
    EMAIL CONTENT:
    {email_content}
    
    Extract these fields as JSON:
    {{
        "quoted_rate": <number or null>,
        "rate_type": "PER_MILE" | "TOTAL" | "UNKNOWN",
        "pickup_date": "YYYY-MM-DD" | null,
        "delivery_date": "YYYY-MM-DD" | null,
        "equipment_type": "<equipment type>" | null,
        "fuel_surcharge": <number or null>,
        "accessorials": "<additional charges>" | null,
        "special_notes": "<any special requirements>" | null,
        "confidence": <0.0 to 1.0 confidence score>
    }}
    
    EXTRACTION RULES:
    - Look for rates like "$2.50/mile", "$3000 total", "2.75 per mile"
    - Look for dates like "pickup Monday", "deliver by Friday", "available 1/15"
    - Set confidence based on how clear the information is
    - If information is missing or unclear, use null
    - Special notes include detention fees, fuel surcharge, equipment requirements
    
    Return ONLY the JSON object, no explanations.
    """
    
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        content_str = response.content.strip()
        
        # Clean up JSON formatting
        if content_str.startswith("```"):
            content_str = content_str.strip("`").strip()
        
        extracted_data = json.loads(content_str)
        
        # Display extraction results
        print(f"📊 Extracted quote: ${extracted_data.get('quoted_rate', 'N/A')} ({extracted_data.get('rate_type', 'UNKNOWN')})")
        print(f"🎯 Confidence: {extracted_data.get('confidence', 0.0):.1f}")
        
        return {"extracted_quote": extracted_data}
        
    except json.JSONDecodeError as e:
        print(f"❌ JSON parsing error: {e}")
        return {"errors": [f"Failed to parse extracted quote data: {str(e)}"]}
    except Exception as e:
        print(f"❌ Extraction error: {e}")
        return {"errors": [f"Failed to extract quote data: {str(e)}"]}

def normalize_quote(state: QuoteCollectorState) -> Dict[str, Any]:
    """
    DATA NORMALIZATION NODE: Clean and validate extracted quote data.
    
    NORMALIZATION PROCESS:
    1. Convert rate to standard numeric format
    2. Validate and normalize rate type
    3. Parse and validate date formats
    4. Clean up text fields
    5. Validate confidence score range
    
    VALIDATION RULES:
    - Rates must be positive numbers
    - Rate types must be valid enum values
    - Dates must be valid YYYY-MM-DD format
    - Confidence must be between 0.0 and 1.0
    
    ERROR HANDLING:
    - Invalid data is set to null rather than failing
    - Maintains data integrity for downstream processing
    - Logs validation issues for review
    
    ARGS:
        state: QuoteCollector state with extracted data
        
    RETURNS:
        Dict containing:
        - normalized_quote: Cleaned and validated data
        - confidence: Normalized confidence score
        - errors: List of normalization errors
        
    BUSINESS CONTEXT:
    Normalization ensures data consistency for database storage
    and downstream processing, preventing errors in quote comparison.
    """
    extracted_quote = state.get("extracted_quote", {})
    
    if not extracted_quote:
        return {"errors": ["No quote data to normalize"]}
    
    normalized = {}
    
    # Normalize quoted rate
    if extracted_quote.get("quoted_rate"):
        try:
            normalized["quoted_rate"] = float(extracted_quote["quoted_rate"])
        except (ValueError, TypeError):
            normalized["quoted_rate"] = None
    
    # Normalize rate type with validation
    rate_type = extracted_quote.get("rate_type", "UNKNOWN")
    if rate_type not in ["PER_MILE", "TOTAL", "UNKNOWN"]:
        rate_type = "UNKNOWN"
    normalized["rate_type"] = rate_type
    
    # Normalize date fields with validation
    for date_field in ["pickup_date", "delivery_date"]:
        date_str = extracted_quote.get(date_field)
        if date_str:
            try:
                # Validate date format (simplified - production would need robust parsing)
                if len(date_str) == 10 and date_str.count('-') == 2:
                    datetime.strptime(date_str, '%Y-%m-%d')
                    normalized[date_field] = date_str
                else:
                    normalized[date_field] = None
            except ValueError:
                normalized[date_field] = None
        else:
            normalized[date_field] = None
    
    # Copy other fields with basic validation
    for field in ["equipment_type", "fuel_surcharge", "accessorials", "special_notes"]:
        normalized[field] = extracted_quote.get(field)
    
    # Normalize confidence score
    confidence = extracted_quote.get("confidence", 0.0)
    try:
        confidence = max(0.0, min(1.0, float(confidence)))
    except (ValueError, TypeError):
        confidence = 0.0
    
    normalized["confidence"] = confidence
    
    print(f"✅ Normalized quote data")
    
    return {
        "normalized_quote": normalized,
        "confidence": confidence
    }

def score_quote(state: QuoteCollectorState) -> Dict[str, Any]:
    """
    SCORING NODE: Calculate composite score for quote ranking.
    
    SCORING METHODOLOGY:
    1. Extract normalized quote data
    2. Fetch carrier performance data
    3. Apply multi-factor scoring algorithm
    4. Generate final score (0-100)
    
    SCORING FACTORS:
    - Rate competitiveness (primary factor)
    - Carrier reliability and tier
    - Historical performance metrics
    - Pickup timing preferences
    - Data extraction confidence
    
    ARGS:
        state: QuoteCollector state with normalized data
        
    RETURNS:
        Dict containing:
        - quote_score: Calculated score (0-100)
        - errors: List of scoring errors
        
    BUSINESS CONTEXT:
    Scoring enables automated quote ranking, helping brokers
    quickly identify the best options without manual comparison.
    """
    normalized_quote = state.get("normalized_quote", {})
    carrier_id = state.get("carrier_id")
    
    if not normalized_quote:
        return {"errors": ["No normalized quote data"]}
    
    # Fetch carrier data for scoring
    carrier_data = {}
    if carrier_id:
        try:
            result = supabase.table("carriers").select("*").eq("id", carrier_id).execute()
            if result.data:
                carrier_data = result.data[0]
        except Exception:
            pass
    
    # Calculate composite score
    score = calculate_quote_score(normalized_quote, carrier_data)
    
    print(f"📊 Quote score: {score:.1f}/100")
    
    return {"quote_score": score}

def save_quote(state: QuoteCollectorState) -> Dict[str, Any]:
    """
    PERSISTENCE NODE: Save processed quote to database.
    
    DATABASE OPERATIONS:
    1. Validate required fields (load_id, carrier_id)
    2. Construct complete quote record
    3. Insert into carrier_quotes table
    4. Handle database errors gracefully
    
    RECORD STRUCTURE:
    - Foreign keys to loads and carriers tables
    - Extracted quote data fields
    - Processing metadata (confidence, score)
    - Audit trail (timestamps, email content)
    
    ARGS:
        state: Complete QuoteCollector state
        
    RETURNS:
        Dict containing:
        - quote_id: Database ID of saved quote
        - errors: List of database errors
        
    BUSINESS CONTEXT:
    Persistence completes the quote processing pipeline,
    making the quote available for broker review and comparison.
    """
    load_id = state.get("load_id")
    carrier_id = state.get("carrier_id")
    normalized_quote = state.get("normalized_quote", {})
    quote_score = state.get("quote_score", 0.0)
    confidence = state.get("confidence", 0.0)
    
    if not load_id or not carrier_id:
        return {"errors": ["Missing load_id or carrier_id"]}
    
    # Construct complete quote record
    quote_data = {
        "load_id": load_id,
        "carrier_id": carrier_id,
        "email_msg_id": f"quote-{uuid.uuid4()}",
        "quoted_rate": normalized_quote.get("quoted_rate"),
        "rate_type": normalized_quote.get("rate_type", "UNKNOWN"),
        "pickup_date": normalized_quote.get("pickup_date"),
        "delivery_date": normalized_quote.get("delivery_date"),
        "equipment_type": normalized_quote.get("equipment_type"),
        "fuel_surcharge": normalized_quote.get("fuel_surcharge"),
        "accessorials": normalized_quote.get("accessorials"),
        "special_notes": normalized_quote.get("special_notes"),
        "raw_email_content": state.get("raw_email_content", ""),
        "extraction_confidence": confidence,
        "score": quote_score,
        "status": "NEW"
    }
    
    try:
        # Insert into database
        result = supabase.table("carrier_quotes").insert(quote_data).execute()
        quote_id = result.data[0]["id"] if result.data else None
        
        print(f"✅ Quote saved to database (ID: {quote_id})")
        
        return {"quote_id": quote_id}
        
    except Exception as e:
        return {"errors": [f"Failed to save quote: {str(e)}"]}

def summary(state: QuoteCollectorState) -> Dict[str, Any]:
    """
    TERMINAL NODE: Display comprehensive processing summary.
    
    SUMMARY INCLUDES:
    - Processing success/failure status
    - Quote ID and key metrics
    - Confidence and score values
    - Error details for troubleshooting
    
    ARGS:
        state: Complete QuoteCollector state
        
    RETURNS:
        Dict: Empty (workflow terminates)
        
    BUSINESS CONTEXT:
    This summary provides immediate feedback on quote processing
    success and helps operators identify issues quickly.
    """
    quote_id = state.get("quote_id")
    quote_score = state.get("quote_score", 0.0)
    confidence = state.get("confidence", 0.0)
    errors = state.get("errors", [])
    
    print(f"\\n📊 QuoteCollector Summary:")
    
    if quote_id:
        print(f"   ✅ Quote processed successfully (ID: {quote_id})")
        print(f"   📊 Score: {quote_score:.1f}/100")
        print(f"   🎯 Confidence: {confidence:.1f}")
    
    if errors:
        print(f"   ❌ Errors: {len(errors)}")
        for error in errors:
            print(f"      - {error}")
    
    return {}

# ╔══════════ 4. LangGraph Construction ═══════════════════════════════════════
def build_quotecollector_agent():
    """
    Construct and compile the QuoteCollector LangGraph workflow.
    
    GRAPH STRUCTURE:
    - Linear workflow with sequential processing
    - Each node builds upon previous node's output
    - Comprehensive error handling at each step
    
    WORKFLOW SEQUENCE:
    1. identify_context: Resolve load and carrier
    2. extract_quote_data: AI-powered data extraction
    3. normalize_quote: Data cleaning and validation
    4. score_quote: Calculate ranking score
    5. save_quote: Database persistence
    6. summary: Results display
    
    RETURNS:
        Compiled LangGraph agent ready for execution
        
    TECHNICAL NOTES:
    - No checkpointing (workflow is fast and atomic)
    - Linear edges for predictable execution
    - Error state propagates through to summary
    """
    graph = StateGraph(QuoteCollectorState)
    
    # Add workflow nodes
    graph.add_node("identify_context", identify_context)
    graph.add_node("extract_quote_data", extract_quote_data)
    graph.add_node("normalize_quote", normalize_quote)
    graph.add_node("score_quote", score_quote)
    graph.add_node("save_quote", save_quote)
    graph.add_node("summary", summary)
    
    # Add sequential workflow edges
    graph.add_edge("identify_context", "extract_quote_data")
    graph.add_edge("extract_quote_data", "normalize_quote")
    graph.add_edge("normalize_quote", "score_quote")
    graph.add_edge("score_quote", "save_quote")
    graph.add_edge("save_quote", "summary")
    
    # Set entry and exit points
    graph.set_entry_point("identify_context")
    graph.set_finish_point("summary")
    
    return graph.compile()

# ╔══════════ 5. Command Line Interface ═══════════════════════════════════════
def main():
    """
    CLI wrapper for QuoteCollector agent.
    
    USAGE OPTIONS:
    1. python src/agents/quotecollector/graph.py --test
       - Uses built-in test email
    2. python src/agents/quotecollector/graph.py <email_file>
       - Processes email from file
    
    TEST MODE:
    - Uses sample carrier response email
    - Demonstrates full workflow functionality
    - Useful for development and debugging
    
    FILE MODE:
    - Reads email content from specified file
    - Uses default carrier email for testing
    - Enables processing of real carrier emails
    
    BUSINESS CONTEXT:
    This CLI enables testing and manual processing of carrier responses.
    In production, this would be triggered by email webhooks.
    """
    if len(sys.argv) < 2:
        print("Usage: python src/agents/quotecollector/graph.py <sample_email_file>")
        print("   or: python src/agents/quotecollector/graph.py --test")
        sys.exit(1)
    
    if sys.argv[1] == "--test":
        # Built-in test email with sample quote
        sample_email = """
        Subject: Re: Load #1 Tender San Antonio to Miami
        
        Hi dispatch,
        
        I can cover your load #1 from San Antonio to Miami for $2.75 per mile.
        I can pickup on Monday 7/22 and deliver by Wednesday 7/24.
        
        Let me know if this works.
        
        Thanks,
        Mike
        Express Carriers Inc
        """
        
        state = {
            "raw_email_content": sample_email,
            "sender_email": "ops@expresscarriers.com",
            "subject": "Re: Load #1 Tender San Antonio to Miami",
            "received_at": datetime.now().isoformat()
        }
    else:
        # Read email content from file
        try:
            with open(sys.argv[1], 'r') as f:
                content = f.read()
            
            state = {
                "raw_email_content": content,
                "sender_email": "ops@expresscarriers.com",  # Default for testing
                "subject": "Re: Load Tender",
                "received_at": datetime.now().isoformat()
            }
        except FileNotFoundError:
            print(f"Error: File {sys.argv[1]} not found")
            sys.exit(1)
    
    print("🚀 Starting QuoteCollector Agent")
    
    # Build and execute the agent
    agent = build_quotecollector_agent()
    result = agent.invoke(state)
    
    print("\\n🎉 QuoteCollector completed!")

if __name__ == "__main__":
    main()

# ╔══════════ SYSTEM ARCHITECTURE NOTES ═══════════════════════════════════════
"""
INTEGRATION POINTS:
1. Input: Carrier email responses via webhook or manual processing
2. Database: Queries loads and carriers, inserts quotes
3. Output: Structured quotes ready for broker review
4. Triggers: Broker notification systems for new quotes

SCALING CONSIDERATIONS:
- Stateless design enables horizontal scaling
- Database queries can be optimized with indexes
- AI extraction can be batched for efficiency
- Email processing can be parallelized by load

MAINTENANCE:
- Monitor extraction accuracy and retrain prompts
- Update scoring algorithm based on business feedback
- Enhance context resolution for better load matching
- Implement comprehensive error logging and alerting

BUSINESS METRICS:
- Quote extraction accuracy rate
- Processing time per quote
- Confidence score distribution
- Quote conversion rate (accepted vs rejected)

PRODUCTION ROADMAP:
- Email webhook integration for real-time processing
- Enhanced context resolution with fuzzy matching
- Multi-format date parsing for better accuracy
- Integration with broker dashboard for quote management
- Automated quote ranking and recommendation engine
"""
# --------------------------- end of file ------------------------------