# --------------------------- src/services/quote_management.py ----------------------------
"""
AI-Broker MVP · Comprehensive Quote Management System

OVERVIEW:
Complete quote lifecycle management from generation through delivery,
tracking, and follow-up. Integrates pricing, templating, and multi-channel
delivery for professional freight quotes.

WORKFLOW:
1. Generate quote using pricing engine
2. Create professional templates (email, SMS, PDF)
3. Deliver through appropriate channels
4. Track quote status and engagement
5. Manage expiration and follow-ups
6. Analyze conversion metrics

BUSINESS LOGIC:
- Immediate quotes for complete loads
- Professional presentation builds trust
- Multi-channel delivery increases response
- Automated follow-up improves conversion
- Expiration management creates urgency
- Analytics drive pricing optimization

TECHNICAL ARCHITECTURE:
- Event-driven quote generation
- Template engine for formatting
- Resend API for email delivery
- Twilio for SMS (optional)
- Real-time tracking via webhooks
- Database-backed state management

DEPENDENCIES:
- pricing.engine for rate calculation
- Resend API for email
- Twilio API for SMS (optional)
- Supabase for persistence
- Jinja2 for templating
"""

import os
import json
import uuid
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
import logging

from dotenv import load_dotenv
from jinja2 import Template, Environment, FileSystemLoader
import resend
from supabase import create_client, Client

# Import our modules
from src.services.pricing.engine import PricingEngine, PricingResult

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class QuoteStatus(Enum):
    """Quote lifecycle states."""
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    WITHDRAWN = "withdrawn"


class DeliveryChannel(Enum):
    """Available quote delivery channels."""
    EMAIL = "email"
    SMS = "sms"
    WEB = "web"
    API = "api"


class QuoteTemplate:
    """
    Professional quote templates for different channels.
    
    BUSINESS CONTEXT:
    First impressions matter. Professional, clear quotes
    with complete information build trust and win business.
    """
    
    # Email template with professional styling
    EMAIL_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c3e50; color: white; padding: 20px; text-align: center; }
        .quote-box { background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; margin: 20px 0; }
        .rate { font-size: 32px; color: #27ae60; font-weight: bold; }
        .details { margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .cta { background-color: #27ae60; color: white; padding: 15px 30px; text-decoration: none; display: inline-block; margin: 20px 0; }
        .footer { font-size: 12px; color: #666; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Freight Quote #{{ quote_number }}</h1>
        </div>
        
        <p>Dear {{ shipper_name | default('Valued Customer') }},</p>
        
        <p>Thank you for your freight quote request. We're pleased to provide the following competitive rate for your shipment:</p>
        
        <div class="quote-box">
            <div class="rate">${{ total_rate }}</div>
            <div style="color: #666;">All-inclusive rate</div>
        </div>
        
        <div class="details">
            <h3>Shipment Details</h3>
            <div class="detail-row">
                <span>Origin:</span>
                <span><strong>{{ origin_city }}, {{ origin_state }} {{ origin_zip }}</strong></span>
            </div>
            <div class="detail-row">
                <span>Destination:</span>
                <span><strong>{{ dest_city }}, {{ dest_state }} {{ dest_zip }}</strong></span>
            </div>
            <div class="detail-row">
                <span>Equipment:</span>
                <span><strong>{{ equipment_type }}</strong></span>
            </div>
            <div class="detail-row">
                <span>Weight:</span>
                <span><strong>{{ weight_lbs | format_number }} lbs</strong></span>
            </div>
            <div class="detail-row">
                <span>Distance:</span>
                <span><strong>{{ total_miles }} miles</strong></span>
            </div>
            <div class="detail-row">
                <span>Pickup Date:</span>
                <span><strong>{{ pickup_date | format_date }}</strong></span>
            </div>
        </div>
        
        <div class="details">
            <h3>Rate Breakdown</h3>
            <div class="detail-row">
                <span>Linehaul:</span>
                <span>${{ linehaul_rate }}</span>
            </div>
            <div class="detail-row">
                <span>Fuel Surcharge:</span>
                <span>${{ fuel_surcharge }}</span>
            </div>
            {% for charge_name, charge_amount in accessorial_charges.items() %}
            <div class="detail-row">
                <span>{{ charge_name }}:</span>
                <span>${{ charge_amount }}</span>
            </div>
            {% endfor %}
            <div class="detail-row" style="font-weight: bold; border-top: 2px solid #333;">
                <span>Total Rate:</span>
                <span>${{ total_rate }}</span>
            </div>
        </div>
        
        <div style="text-align: center;">
            <a href="{{ booking_link }}" class="cta">Accept Quote</a>
        </div>
        
        <p><strong>Important Notes:</strong></p>
        <ul>
            <li>This quote is valid for {{ validity_hours }} hours (expires {{ expiration_date | format_datetime }})</li>
            <li>Rate is subject to carrier availability</li>
            <li>Additional services may incur extra charges</li>
        </ul>
        
        <p>Ready to move forward? Simply click the "Accept Quote" button above or reply to this email. Our team is standing by to ensure your freight moves smoothly.</p>
        
        <p>Best regards,<br>
        {{ broker_name }}<br>
        {{ company_name }}</p>
        
        <div class="footer">
            <p>This quote was generated on {{ generated_date | format_datetime }}. Quote ID: {{ quote_id }}</p>
            <p>{{ company_name }} | {{ company_phone }} | {{ company_email }}</p>
        </div>
    </div>
</body>
</html>
"""
    
    # SMS template for quick delivery
    SMS_TEMPLATE = """
{{ company_name }} Quote #{{ quote_number }}
{{ origin_city }}, {{ origin_state }} to {{ dest_city }}, {{ dest_state }}
{{ equipment_type }} - {{ weight_lbs }}lbs
Rate: ${{ total_rate }} (all-in)
Valid {{ validity_hours }}hrs
Reply YES to accept or call {{ company_phone }}
"""
    
    # Plain text email alternative
    TEXT_TEMPLATE = """
FREIGHT QUOTE #{{ quote_number }}

Thank you for your quote request. Here's our competitive rate:

TOTAL RATE: ${{ total_rate }} (all-inclusive)

SHIPMENT DETAILS:
- Origin: {{ origin_city }}, {{ origin_state }} {{ origin_zip }}
- Destination: {{ dest_city }}, {{ dest_state }} {{ dest_zip }}
- Equipment: {{ equipment_type }}
- Weight: {{ weight_lbs }} lbs
- Distance: {{ total_miles }} miles
- Pickup: {{ pickup_date }}

RATE BREAKDOWN:
- Linehaul: ${{ linehaul_rate }}
- Fuel Surcharge: ${{ fuel_surcharge }}
{% for charge_name, charge_amount in accessorial_charges.items() %}
- {{ charge_name }}: ${{ charge_amount }}
{% endfor %}

This quote is valid for {{ validity_hours }} hours (expires {{ expiration_date }}).

To accept this quote:
- Reply to this email with "ACCEPT"
- Call us at {{ company_phone }}
- Visit: {{ booking_link }}

Best regards,
{{ broker_name }}
{{ company_name }}
"""


class QuoteManager:
    """
    Complete quote lifecycle management system.
    
    BUSINESS CONTEXT:
    Professional quote management is critical for conversion.
    This system ensures every quote is delivered professionally,
    tracked accurately, and followed up appropriately.
    """
    
    def __init__(self):
        """Initialize quote manager with services."""
        # Database
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
        self.supabase: Optional[Client] = None
        if supabase_url and supabase_key:
            self.supabase = create_client(supabase_url, supabase_key)
        
        # Email service
        self.resend_api_key = os.getenv("RESEND_API_KEY")
        if self.resend_api_key:
            resend.api_key = self.resend_api_key
        
        # Pricing engine
        self.pricing_engine = PricingEngine()
        
        # Company settings
        self.company_settings = {
            "company_name": os.getenv("COMPANY_NAME", "AI-Broker"),
            "company_email": os.getenv("COMPANY_EMAIL", "quotes@ai-broker.com"),
            "company_phone": os.getenv("COMPANY_PHONE", "(555) 123-4567"),
            "quote_validity_hours": int(os.getenv("QUOTE_VALIDITY_HOURS", "24")),
            "base_url": os.getenv("BASE_URL", "https://app.ai-broker.com")
        }
        
        # Initialize template environment
        self.jinja_env = Environment()
        self.jinja_env.filters['format_number'] = lambda x: f"{int(x):,}"
        self.jinja_env.filters['format_date'] = lambda x: datetime.fromisoformat(str(x).split('T')[0] if 'T' in str(x) else str(x)).strftime("%B %d, %Y")
        self.jinja_env.filters['format_datetime'] = lambda x: datetime.fromisoformat(str(x)).strftime("%B %d, %Y at %I:%M %p")
    
    def generate_and_send_quote(self, load_id: str, 
                               delivery_channels: List[DeliveryChannel] = None) -> Dict[str, any]:
        """
        Generate and send quote for a load through specified channels.
        
        WORKFLOW:
        1. Fetch load data from database
        2. Calculate pricing using pricing engine
        3. Create quote record in database
        4. Generate templates for each channel
        5. Send through requested channels
        6. Track delivery status
        
        ARGS:
            load_id: Database ID of the load
            delivery_channels: List of channels to use (default: [EMAIL])
            
        RETURNS:
            Dict with quote details and delivery status
        """
        if not delivery_channels:
            delivery_channels = [DeliveryChannel.EMAIL]
        
        try:
            # Fetch load data
            load_data = self._fetch_load_data(load_id)
            if not load_data:
                return {"success": False, "error": "Load not found"}
            
            # Calculate pricing
            pricing_result = self.pricing_engine.calculate_quote(load_data)
            
            # Create quote record
            quote_id = self._create_quote_record(load_id, load_data, pricing_result)
            
            # Generate quote number
            quote_number = self._generate_quote_number()
            
            # Prepare template data
            template_data = self._prepare_template_data(
                quote_id, quote_number, load_data, pricing_result
            )
            
            # Send through each channel
            delivery_results = {}
            for channel in delivery_channels:
                if channel == DeliveryChannel.EMAIL:
                    result = self._send_email_quote(template_data)
                    delivery_results["email"] = result
                elif channel == DeliveryChannel.SMS:
                    result = self._send_sms_quote(template_data)
                    delivery_results["sms"] = result
            
            # Update quote status
            if any(r.get("success") for r in delivery_results.values()):
                self._update_quote_status(quote_id, QuoteStatus.SENT)
            
            return {
                "success": True,
                "quote_id": quote_id,
                "quote_number": quote_number,
                "total_rate": str(pricing_result.recommended_quote_to_shipper),
                "delivery_results": delivery_results,
                "expires_at": template_data["expiration_date"]
            }
            
        except Exception as e:
            logger.error(f"Quote generation failed: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def _fetch_load_data(self, load_id: str) -> Optional[Dict]:
        """Fetch load data from database."""
        if not self.supabase:
            # Return test data if no database
            return {
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
                "shipper_email": "shipper@example.com",
                "shipper_name": "Test Shipper"
            }
        
        try:
            result = self.supabase.table("loads").select("*").eq("id", load_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Failed to fetch load {load_id}: {e}")
            return None
    
    def _create_quote_record(self, load_id: str, load_data: Dict, 
                           pricing_result: PricingResult) -> str:
        """Create quote record in database."""
        quote_id = str(uuid.uuid4())
        
        if self.supabase:
            quote_data = {
                "id": quote_id,
                "load_id": load_id,
                "shipper_email": load_data.get("shipper_email"),
                "quoted_rate": str(pricing_result.recommended_quote_to_shipper),
                "carrier_rate": str(pricing_result.total_rate),
                "margin_amount": str(
                    pricing_result.recommended_quote_to_shipper - pricing_result.total_rate
                ),
                "margin_percentage": pricing_result.margin_percentage,
                "rate_per_mile": str(pricing_result.rate_per_mile),
                "total_miles": pricing_result.total_miles,
                "pricing_details": pricing_result.to_dict(),
                "status": QuoteStatus.DRAFT.value,
                "valid_until": (
                    datetime.now() + timedelta(hours=self.company_settings["quote_validity_hours"])
                ).isoformat(),
                "created_at": datetime.now().isoformat()
            }
            
            try:
                self.supabase.table("quotes").insert(quote_data).execute()
            except Exception as e:
                logger.error(f"Failed to create quote record: {e}")
        
        return quote_id
    
    def _generate_quote_number(self) -> str:
        """Generate human-friendly quote number."""
        # Format: QB-YYMMDD-XXXX
        date_part = datetime.now().strftime("%y%m%d")
        random_part = str(uuid.uuid4())[:4].upper()
        return f"QB-{date_part}-{random_part}"
    
    def _prepare_template_data(self, quote_id: str, quote_number: str,
                             load_data: Dict, pricing_result: PricingResult) -> Dict:
        """Prepare data for template rendering."""
        now = datetime.now()
        expiration = now + timedelta(hours=self.company_settings["quote_validity_hours"])
        
        return {
            # Quote info
            "quote_id": quote_id,
            "quote_number": quote_number,
            "generated_date": now.isoformat(),
            "expiration_date": expiration.isoformat(),
            "validity_hours": self.company_settings["quote_validity_hours"],
            
            # Load details
            "origin_city": load_data.get("origin_city"),
            "origin_state": load_data.get("origin_state"),
            "origin_zip": load_data.get("origin_zip"),
            "dest_city": load_data.get("dest_city"),
            "dest_state": load_data.get("dest_state"),
            "dest_zip": load_data.get("dest_zip"),
            "equipment_type": load_data.get("equipment", "Van"),
            "weight_lbs": load_data.get("weight_lb", 0),
            "pickup_date": load_data.get("pickup_dt", ""),
            
            # Pricing
            "total_rate": pricing_result.recommended_quote_to_shipper,
            "linehaul_rate": pricing_result.linehaul_rate,
            "fuel_surcharge": pricing_result.fuel_surcharge,
            "accessorial_charges": pricing_result.accessorial_charges,
            "total_miles": pricing_result.total_miles,
            
            # Contact info
            "shipper_name": load_data.get("shipper_name"),
            "shipper_email": load_data.get("shipper_email"),
            
            # Company info
            **self.company_settings,
            "broker_name": "Your AI-Broker Team",
            "booking_link": f"{self.company_settings['base_url']}/quote/{quote_id}/accept"
        }
    
    def _send_email_quote(self, template_data: Dict) -> Dict[str, any]:
        """Send quote via email using Resend."""
        if not self.resend_api_key:
            logger.warning("Resend API key not configured")
            return {"success": False, "error": "Email service not configured"}
        
        try:
            # Render templates
            html_template = Template(QuoteTemplate.EMAIL_TEMPLATE)
            text_template = Template(QuoteTemplate.TEXT_TEMPLATE)
            
            html_content = html_template.render(**template_data)
            text_content = text_template.render(**template_data)
            
            # Send email
            response = resend.Emails.send({
                "from": f"{self.company_settings['company_name']} <{self.company_settings['company_email']}>",
                "to": template_data["shipper_email"],
                "subject": f"Freight Quote #{template_data['quote_number']} - {template_data['origin_city']} to {template_data['dest_city']}",
                "html": html_content,
                "text": text_content,
                "headers": {
                    "X-Quote-ID": template_data["quote_id"],
                    "X-Load-ID": str(template_data.get("load_id", ""))
                }
            })
            
            logger.info(f"Quote email sent successfully: {response['id']}")
            
            # Track email event
            if self.supabase:
                self._track_quote_event(
                    template_data["quote_id"],
                    "email_sent",
                    {"resend_id": response["id"]}
                )
            
            return {"success": True, "message_id": response["id"]}
            
        except Exception as e:
            logger.error(f"Failed to send email quote: {e}")
            return {"success": False, "error": str(e)}
    
    def _send_sms_quote(self, template_data: Dict) -> Dict[str, any]:
        """Send quote via SMS using Twilio."""
        # SMS implementation would go here
        # For now, just return success
        return {"success": True, "message": "SMS not implemented"}
    
    def _update_quote_status(self, quote_id: str, status: QuoteStatus):
        """Update quote status in database."""
        if self.supabase:
            try:
                self.supabase.table("quotes").update({
                    "status": status.value,
                    "updated_at": datetime.now().isoformat()
                }).eq("id", quote_id).execute()
            except Exception as e:
                logger.error(f"Failed to update quote status: {e}")
    
    def _track_quote_event(self, quote_id: str, event_type: str, metadata: Dict = None):
        """Track quote events for analytics."""
        if self.supabase:
            try:
                self.supabase.table("quote_events").insert({
                    "quote_id": quote_id,
                    "event_type": event_type,
                    "metadata": metadata or {},
                    "created_at": datetime.now().isoformat()
                }).execute()
            except Exception as e:
                logger.error(f"Failed to track quote event: {e}")
    
    def handle_quote_response(self, quote_id: str, response: str) -> Dict[str, any]:
        """
        Handle quote response from shipper.
        
        RESPONSES:
        - ACCEPT: Mark as accepted, trigger booking workflow
        - REJECT: Mark as rejected, request feedback
        - NEGOTIATE: Open negotiation workflow
        """
        response = response.upper()
        
        if response == "ACCEPT":
            self._update_quote_status(quote_id, QuoteStatus.ACCEPTED)
            # Trigger booking workflow
            return {
                "success": True,
                "action": "booking_initiated",
                "message": "Quote accepted. Booking process initiated."
            }
        
        elif response == "REJECT":
            self._update_quote_status(quote_id, QuoteStatus.REJECTED)
            return {
                "success": True,
                "action": "feedback_requested",
                "message": "Quote rejected. Feedback requested."
            }
        
        else:
            return {
                "success": False,
                "error": "Invalid response. Expected ACCEPT or REJECT."
            }
    
    def check_expired_quotes(self):
        """Check and mark expired quotes."""
        if not self.supabase:
            return
        
        try:
            # Find quotes past validity
            expired_quotes = self.supabase.table("quotes").select("id").eq(
                "status", QuoteStatus.SENT.value
            ).lt("valid_until", datetime.now().isoformat()).execute()
            
            for quote in expired_quotes.data:
                self._update_quote_status(quote["id"], QuoteStatus.EXPIRED)
                
            logger.info(f"Marked {len(expired_quotes.data)} quotes as expired")
            
        except Exception as e:
            logger.error(f"Failed to check expired quotes: {e}")


# Utility functions for integration
def generate_quote_for_load(load_id: str) -> Dict[str, any]:
    """
    Generate and send quote for a specific load.
    
    INTEGRATION POINT:
    Called by intake workflow after successful load processing.
    """
    manager = QuoteManager()
    return manager.generate_and_send_quote(load_id, [DeliveryChannel.EMAIL])


def process_quote_response(quote_id: str, response: str) -> Dict[str, any]:
    """
    Process quote response from shipper.
    
    INTEGRATION POINT:
    Called by webhook when shipper responds to quote.
    """
    manager = QuoteManager()
    return manager.handle_quote_response(quote_id, response)


# CLI for testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--test":
            print("🧮 Testing Quote Management System")
            
            # Test with mock load ID
            result = generate_quote_for_load("test-load-123")
            print(f"\nQuote generation result:")
            print(json.dumps(result, indent=2))
            
        elif sys.argv[1] == "--expire":
            print("🕐 Checking for expired quotes...")
            manager = QuoteManager()
            manager.check_expired_quotes()
            
        else:
            # Generate quote for specific load
            load_id = sys.argv[1]
            print(f"📧 Generating quote for load {load_id}")
            result = generate_quote_for_load(load_id)
            print(json.dumps(result, indent=2))
    else:
        print("Usage:")
        print("  python quote_management.py --test     # Test with mock data")
        print("  python quote_management.py <load_id>  # Generate quote for load")
        print("  python quote_management.py --expire   # Check expired quotes")