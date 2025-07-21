# --------------------------- email_intent_classifier.py ----------------------------
"""
AI-Broker MVP · Email Intent Classification System

OVERVIEW:
This module provides intelligent email classification to determine the intent of incoming
emails before processing them through specialized workflows. It prevents the system from
processing irrelevant emails and routes each email to the appropriate handler.

BUSINESS LOGIC:
- Filters out non-load-tender emails (quotes, follow-ups, spam, etc.)
- Provides confidence scores for classification decisions
- Enables early routing to appropriate processing workflows
- Reduces processing costs by filtering irrelevant content

CLASSIFICATION CATEGORIES:
- LOAD_TENDER: New freight load requests from shippers
- MISSING_INFO_RESPONSE: Shipper replies with missing load information
- QUOTE_RESPONSE: Carrier responses with pricing information
- GENERAL_INQUIRY: Customer service or information requests
- BOOKING_CONFIRMATION: Load booking confirmations
- PAYMENT_INQUIRY: Billing or payment related communications
- SPAM_IRRELEVANT: Promotional content or irrelevant emails
- UNKNOWN: Unable to classify with sufficient confidence

TECHNICAL ARCHITECTURE:
- Uses OpenAI GPT-4o-mini for intelligent classification
- Structured output with confidence scoring
- Fallback classification for edge cases
- Integration with existing agent workflows

DEPENDENCIES:
- Environment variables: OPENAI_API_KEY
- Input: Email content (subject + body)
- Output: Intent classification with confidence score
"""

# ─── Standard-library imports ───────────────────────────────────────────
import os, json
from typing import Dict, Any, Optional
from datetime import datetime
from enum import Enum

# ─── Environment setup ─────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

# ─── Third-party imports ────────────────────────────────────────────────
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

# ╔══════════ 1. Configuration & Enums ═══════════════════════════════════════

class EmailIntent(Enum):
    """
    Email intent classification categories with business context.
    
    LOAD_TENDER: Primary target - new freight loads to process
    MISSING_INFO_RESPONSE: Shipper providing missing load information
    QUOTE_RESPONSE: Carrier pricing responses for QuoteCollector
    GENERAL_INQUIRY: Customer service requests requiring human attention
    BOOKING_CONFIRMATION: Load booking confirmations for tracking
    PAYMENT_INQUIRY: Billing/payment issues for accounting
    SPAM_IRRELEVANT: Marketing, spam, or irrelevant content
    UNKNOWN: Classification failed or insufficient information
    """
    LOAD_TENDER = "LOAD_TENDER"
    MISSING_INFO_RESPONSE = "MISSING_INFO_RESPONSE"
    QUOTE_RESPONSE = "QUOTE_RESPONSE"
    GENERAL_INQUIRY = "GENERAL_INQUIRY"
    BOOKING_CONFIRMATION = "BOOKING_CONFIRMATION"
    PAYMENT_INQUIRY = "PAYMENT_INQUIRY"
    SPAM_IRRELEVANT = "SPAM_IRRELEVANT"
    UNKNOWN = "UNKNOWN"

class ClassificationResult:
    """
    Structured result from email intent classification.
    
    FIELDS:
    - intent: Primary classification category
    - confidence: Classification confidence (0.0-1.0)
    - reasoning: Human-readable explanation of classification
    - secondary_intents: Alternative classifications with lower confidence
    - processing_metadata: Additional data for downstream processing
    """
    def __init__(self, intent: EmailIntent, confidence: float, reasoning: str = "", 
                 secondary_intents: list = None, processing_metadata: dict = None):
        self.intent = intent
        self.confidence = max(0.0, min(1.0, confidence))  # Clamp to valid range
        self.reasoning = reasoning
        self.secondary_intents = secondary_intents or []
        self.processing_metadata = processing_metadata or {}
        self.classified_at = datetime.now().isoformat()

    def to_dict(self) -> dict:
        """Convert classification result to dictionary format."""
        return {
            "intent": self.intent.value,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "secondary_intents": self.secondary_intents,
            "processing_metadata": self.processing_metadata,
            "classified_at": self.classified_at
        }

    def should_process_automatically(self, threshold: float = 0.85) -> bool:
        """
        Determine if classification confidence is high enough for automatic processing.
        
        BUSINESS LOGIC (per ARCHITECTURE.md):
        - High confidence (>0.85): Process automatically
        - Medium confidence (0.6-0.85): Requires human review
        - Low confidence (<0.6): Escalate to human
        """
        return self.confidence >= threshold

# ╔══════════ 2. Email Intent Classifier ═══════════════════════════════════════

class EmailIntentClassifier:
    """
    AI-powered email intent classification system.
    
    CLASSIFICATION STRATEGY:
    1. Analyze email subject and body content
    2. Use structured prompt with clear intent definitions
    3. Request confidence scoring and reasoning
    4. Handle edge cases and malformed responses
    5. Provide fallback classification when needed
    
    PROMPT ENGINEERING:
    - Detailed intent definitions with examples
    - Business context for freight brokerage
    - Confidence scoring guidelines
    - JSON response format for consistent parsing
    """
    
    def __init__(self, model: str = None, temperature: float = 0.1):
        """
        Initialize the email intent classifier.
        
        ARGS:
            model: OpenAI model name (defaults to environment variable)
            temperature: LLM temperature (low for consistent classification)
        """
        self.model = model or os.getenv("LLM_MODEL", "gpt-4o-mini")
        self.llm = ChatOpenAI(model=self.model, temperature=temperature)
    
    def classify_email(self, subject: str, body: str, sender_email: str = "") -> ClassificationResult:
        """
        Classify email intent using AI analysis.
        
        CLASSIFICATION PROCESS:
        1. Construct detailed prompt with email content
        2. Send to LLM for analysis
        3. Parse structured JSON response
        4. Validate and normalize results
        5. Handle errors with fallback logic
        
        ARGS:
            subject: Email subject line
            body: Email body content
            sender_email: Sender email address (optional, for context)
            
        RETURNS:
            ClassificationResult: Structured classification with confidence score
        """
        
        # Construct classification prompt
        prompt = self._build_classification_prompt(subject, body, sender_email)
        
        try:
            # Get LLM classification
            response = self.llm.invoke([HumanMessage(content=prompt)])
            result = self._parse_classification_response(response.content)
            
            print(f"📧 Email classified as: {result.intent.value} (confidence: {result.confidence:.2f})")
            
            return result
            
        except Exception as e:
            print(f"❌ Classification error: {e}")
            return self._create_fallback_classification(subject, body)
    
    def _build_classification_prompt(self, subject: str, body: str, sender_email: str) -> str:
        """
        Build structured prompt for email intent classification.
        
        PROMPT STRUCTURE:
        - Clear task definition
        - Detailed intent categories with examples
        - Business context for freight brokerage
        - Confidence scoring guidelines
        - JSON response format specification
        """
        
        prompt = f"""
        Classify the intent of this freight brokerage email and return ONLY a JSON object.

        EMAIL DETAILS:
        Subject: {subject}
        From: {sender_email}
        Body: {body}

        CLASSIFICATION CATEGORIES:

        1. LOAD_TENDER - New freight load requests from shippers
           Examples: "Need truck for urgent shipment", "Load available Dallas to Houston"
           
        2. MISSING_INFO_RESPONSE - Shipper providing missing load information
           Examples: "Re: Additional Information Needed - pickup is 3pm on Monday", 
                    "Here's the missing info: weight is 25000 lbs",
                    "In response to your email, the delivery zip is 30303"
           Key indicators: Reply to missing info request, provides specific load details
           
        3. QUOTE_RESPONSE - Carrier responses with pricing
           Examples: "Re: Load #123 - $2.50/mile", "Can cover for $3000 total"
           
        4. GENERAL_INQUIRY - Customer service or information requests
           Examples: "Need tracking update", "Question about billing"
           
        5. BOOKING_CONFIRMATION - Load booking confirmations
           Examples: "Load #456 confirmed", "Pickup scheduled for Monday"
           
        6. PAYMENT_INQUIRY - Billing or payment related
           Examples: "Invoice overdue", "Payment processing question"
           
        7. SPAM_IRRELEVANT - Marketing, spam, or irrelevant content
           Examples: "Special truck financing offer", "Unsubscribe", automated notifications
           
        8. UNKNOWN - Unable to classify with sufficient confidence

        CONFIDENCE SCORING:
        - 0.9+ = Very clear intent with explicit keywords
        - 0.7-0.9 = Clear intent with good context
        - 0.5-0.7 = Moderate confidence, some ambiguity
        - Below 0.5 = Low confidence, classify as UNKNOWN

        Return ONLY this JSON format:
        {{
            "intent": "CATEGORY_NAME",
            "confidence": 0.85,
            "reasoning": "Brief explanation of classification decision",
            "keywords_found": ["keyword1", "keyword2"]
        }}
        """
        
        return prompt.strip()
    
    def _parse_classification_response(self, response_content: str) -> ClassificationResult:
        """
        Parse LLM response into structured ClassificationResult.
        
        PARSING LOGIC:
        1. Clean JSON formatting (remove markdown)
        2. Parse JSON response
        3. Validate intent category
        4. Normalize confidence score
        5. Extract reasoning and metadata
        
        ARGS:
            response_content: Raw LLM response content
            
        RETURNS:
            ClassificationResult: Parsed and validated classification
        """
        
        # Clean up JSON formatting
        content = response_content.strip()
        if content.startswith("```"):
            content = content.strip("`").strip()
        
        try:
            # Parse JSON response
            data = json.loads(content)
            
            # Validate and extract fields
            intent_str = data.get("intent", "UNKNOWN")
            confidence = float(data.get("confidence", 0.0))
            reasoning = data.get("reasoning", "No reasoning provided")
            keywords = data.get("keywords_found", [])
            
            # Validate intent category
            try:
                intent = EmailIntent(intent_str)
            except ValueError:
                print(f"⚠️ Invalid intent '{intent_str}', defaulting to UNKNOWN")
                intent = EmailIntent.UNKNOWN
                confidence = 0.0
            
            # Create processing metadata
            metadata = {
                "keywords_found": keywords,
                "raw_response": data
            }
            
            return ClassificationResult(
                intent=intent,
                confidence=confidence,
                reasoning=reasoning,
                processing_metadata=metadata
            )
            
        except json.JSONDecodeError as e:
            print(f"❌ JSON parsing error: {e}")
            raise Exception(f"Failed to parse classification response: {e}")
    
    def _create_fallback_classification(self, subject: str, body: str) -> ClassificationResult:
        """
        Create fallback classification when AI processing fails.
        
        FALLBACK STRATEGY:
        1. Use simple keyword matching
        2. Assign low confidence scores
        3. Provide diagnostic reasoning
        4. Enable manual review workflow
        
        ARGS:
            subject: Email subject line
            body: Email body content
            
        RETURNS:
            ClassificationResult: Fallback classification with low confidence
        """
        
        # Simple keyword-based fallback
        text = f"{subject} {body}".lower()
        
        # Load tender keywords
        load_keywords = ["load", "freight", "shipment", "pickup", "delivery", "tender"]
        quote_keywords = ["quote", "rate", "price", "$", "per mile", "total"]
        
        if any(keyword in text for keyword in load_keywords):
            return ClassificationResult(
                intent=EmailIntent.LOAD_TENDER,
                confidence=0.3,  # Low confidence for fallback
                reasoning="Fallback classification based on load keywords"
            )
        elif any(keyword in text for keyword in quote_keywords):
            return ClassificationResult(
                intent=EmailIntent.QUOTE_RESPONSE,
                confidence=0.3,
                reasoning="Fallback classification based on quote keywords"
            )
        else:
            return ClassificationResult(
                intent=EmailIntent.UNKNOWN,
                confidence=0.1,
                reasoning="Fallback classification - unable to determine intent"
            )

# ╔══════════ 3. Convenience Functions ═══════════════════════════════════════

def classify_email_content(subject: str, body: str, sender_email: str = "") -> ClassificationResult:
    """
    Convenience function for email classification.
    
    This function provides a simple interface for email classification without
    requiring direct instantiation of the classifier class.
    
    ARGS:
        subject: Email subject line
        body: Email body content  
        sender_email: Sender email address (optional)
        
    RETURNS:
        ClassificationResult: Classification with confidence score
    """
    classifier = EmailIntentClassifier()
    return classifier.classify_email(subject, body, sender_email)

def should_process_for_load_intake(classification: ClassificationResult, 
                                   confidence_threshold: float = 0.85) -> bool:
    """
    Determine if email should be processed for load intake.
    
    BUSINESS LOGIC:
    - Only LOAD_TENDER emails with sufficient confidence
    - Allows for configurable confidence thresholds
    - Enables different processing paths based on intent
    
    ARGS:
        classification: Email classification result
        confidence_threshold: Minimum confidence for automatic processing
        
    RETURNS:
        bool: True if email should be processed for load intake
    """
    return (classification.intent == EmailIntent.LOAD_TENDER and 
            classification.confidence >= confidence_threshold)

# ╔══════════ 4. Command Line Interface ═══════════════════════════════════════

def main():
    """
    CLI for testing email intent classification.
    
    USAGE:
        python email_intent_classifier.py
        
    WORKFLOW:
    1. Prompts for email subject and body
    2. Classifies intent using AI
    3. Displays results with confidence score
    4. Shows processing recommendation
    """
    
    print("🔍 Email Intent Classifier - Test Mode")
    print("=" * 50)
    
    # Get user input
    subject = input("Enter email subject: ").strip()
    if not subject:
        subject = "Load Available: Dallas to Miami - Urgent"
    
    body = input("Enter email body: ").strip()
    if not body:
        body = """
        Hi, we have an urgent load that needs to be moved:
        
        Origin: Dallas, TX 75201
        Destination: Miami, FL 33166
        Pickup: Tomorrow morning
        Equipment: Dry Van
        Weight: 35,000 lbs
        Commodity: Electronics
        
        Please respond with your best rate.
        
        Thanks,
        Shipping Manager
        """
    
    sender = input("Enter sender email (optional): ").strip()
    
    print("\n🤖 Classifying email...")
    
    # Classify email
    result = classify_email_content(subject, body, sender)
    
    # Display results
    print("\n📊 Classification Results:")
    print(f"   Intent: {result.intent.value}")
    print(f"   Confidence: {result.confidence:.2f}")
    print(f"   Reasoning: {result.reasoning}")
    
    # Processing recommendation
    if should_process_for_load_intake(result):
        print("\n✅ Recommendation: Process for load intake")
    elif result.intent == EmailIntent.QUOTE_RESPONSE:
        print("\n📨 Recommendation: Route to QuoteCollector")
    elif result.confidence < 0.6:
        print("\n⚠️ Recommendation: Requires human review")
    else:
        print("\n🔄 Recommendation: Route to appropriate handler")
    
    # Show full result data
    print(f"\n📋 Full Classification Data:")
    print(json.dumps(result.to_dict(), indent=2))

if __name__ == "__main__":
    main()

# ╔══════════ INTEGRATION NOTES ═══════════════════════════════════════════
"""
INTEGRATION WITH EXISTING AGENTS:

1. INTAKE AGENT INTEGRATION:
   - Add intent classification before processing
   - Only process emails classified as LOAD_TENDER
   - Route other intents to appropriate handlers

2. QUOTECOLLECTOR INTEGRATION:
   - Filter for QUOTE_RESPONSE emails
   - Use confidence scores for processing decisions
   - Handle low-confidence quotes with human review

3. PDF INTAKE INTEGRATION:
   - Classify emails before checking for PDF attachments
   - Only process PDFs from LOAD_TENDER emails
   - Maintain classification metadata for audit trail

4. HUMAN-IN-THE-LOOP:
   - Low confidence classifications require human review
   - GENERAL_INQUIRY and PAYMENT_INQUIRY route to appropriate teams
   - SPAM_IRRELEVANT gets filtered out completely

CONFIGURATION RECOMMENDATIONS:
- LOAD_TENDER processing: confidence >= 0.7
- QUOTE_RESPONSE processing: confidence >= 0.6  
- Human review required: confidence < 0.6
- Auto-reject SPAM_IRRELEVANT: any confidence level

MONITORING METRICS:
- Classification accuracy rate
- Confidence score distributions
- False positive/negative rates
- Processing time per classification
"""
# --------------------------- end of file ------------------------------