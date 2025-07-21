# --------------------------- pricing_engine.py ----------------------------
"""
AI-Broker MVP · Intelligent Pricing Engine (LangGraph Component)

OVERVIEW:
This module provides intelligent freight pricing and quote generation for the
AI-Broker platform. It analyzes market conditions, historical data, and load
characteristics to generate competitive yet profitable quotes for shippers.

WORKFLOW:
1. Analyze load characteristics (distance, weight, equipment, dates)
2. Fetch market rate data from multiple sources
3. Apply business rules and margin targets
4. Generate quote with confidence scoring
5. Provide pricing recommendations and insights

BUSINESS LOGIC:
- Base rate calculation using mileage and equipment type
- Market adjustment factors (supply/demand, seasonality)
- Fuel surcharge calculations based on current diesel prices
- Accessorial charges (detention, layover, special handling)
- Margin optimization based on broker targets
- Risk assessment for pricing decisions

TECHNICAL ARCHITECTURE:
- Modular pricing components for different freight types
- Integration with external rate APIs (DAT, Truckstop)
- Historical rate analysis from database
- Machine learning for rate prediction (future)
- Caching for performance optimization

DEPENDENCIES:
- Environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY
- External APIs: DAT RateView (optional), fuel price APIs
- Database: loads, quotes, market_rates tables
- Input: Load details dictionary
- Output: Pricing recommendation with confidence score
"""

# ─── Standard-library imports ───────────────────────────────────────────
import os, json, math
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum

# ─── Environment setup ─────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

# ─── Third-party imports ────────────────────────────────────────────────
from supabase import create_client, Client
import requests

# ╔══════════ 1. Configuration & Data Models ═══════════════════════════════════

class EquipmentType(Enum):
    """
    Standard freight equipment types with base rate multipliers.
    
    BUSINESS CONTEXT:
    Different equipment types have different operating costs and availability,
    which impacts pricing. Specialized equipment commands premium rates.
    """
    VAN = ("Van", 1.0)              # Standard dry van (baseline)
    REEFER = ("Reefer", 1.25)       # Refrigerated (25% premium)
    FLATBED = ("Flatbed", 1.15)     # Open deck (15% premium)
    STEPDECK = ("Stepdeck", 1.20)   # Lower deck height (20% premium)
    POWER_ONLY = ("Power Only", 0.85) # No trailer (15% discount)
    
    def __init__(self, display_name: str, rate_multiplier: float):
        self.display_name = display_name
        self.rate_multiplier = rate_multiplier

class MarketCondition(Enum):
    """
    Market supply/demand conditions affecting rates.
    
    BUSINESS CONTEXT:
    Freight rates fluctuate based on truck availability and load volume.
    Understanding market conditions is critical for competitive pricing.
    """
    TIGHT = "tight"          # High demand, low supply (+10-20% rates)
    BALANCED = "balanced"    # Normal market conditions
    LOOSE = "loose"         # Low demand, high supply (-10-20% rates)

class PricingResult:
    """
    Comprehensive pricing recommendation with supporting data.
    
    Contains all components of the freight rate calculation including
    base rate, fuel surcharge, accessorials, and margin analysis.
    """
    
    def __init__(self):
        # Core pricing components
        self.base_rate_per_mile: Decimal = Decimal("0.00")
        self.total_miles: int = 0
        self.linehaul_rate: Decimal = Decimal("0.00")
        self.fuel_surcharge: Decimal = Decimal("0.00")
        self.accessorial_charges: Dict[str, Decimal] = {}
        
        # Final pricing
        self.total_rate: Decimal = Decimal("0.00")
        self.rate_per_mile: Decimal = Decimal("0.00")
        
        # Market analysis
        self.market_average: Optional[Decimal] = None
        self.market_low: Optional[Decimal] = None
        self.market_high: Optional[Decimal] = None
        self.market_condition: MarketCondition = MarketCondition.BALANCED
        
        # Confidence and recommendations
        self.confidence_score: float = 0.0
        self.pricing_notes: List[str] = []
        self.margin_percentage: float = 0.0
        self.recommended_quote_to_shipper: Decimal = Decimal("0.00")
    
    def to_dict(self) -> dict:
        """Convert pricing result to dictionary for serialization."""
        return {
            "base_rate_per_mile": str(self.base_rate_per_mile),
            "total_miles": self.total_miles,
            "linehaul_rate": str(self.linehaul_rate),
            "fuel_surcharge": str(self.fuel_surcharge),
            "accessorial_charges": {k: str(v) for k, v in self.accessorial_charges.items()},
            "total_rate": str(self.total_rate),
            "rate_per_mile": str(self.rate_per_mile),
            "market_average": str(self.market_average) if self.market_average else None,
            "market_low": str(self.market_low) if self.market_low else None,
            "market_high": str(self.market_high) if self.market_high else None,
            "market_condition": self.market_condition.value,
            "confidence_score": self.confidence_score,
            "pricing_notes": self.pricing_notes,
            "margin_percentage": self.margin_percentage,
            "recommended_quote_to_shipper": str(self.recommended_quote_to_shipper)
        }

# ╔══════════ 2. Distance Calculation ═══════════════════════════════════════

def calculate_distance(origin_city: str, origin_state: str, 
                      dest_city: str, dest_state: str) -> int:
    """
    Calculate approximate road miles between cities.
    
    BUSINESS LOGIC:
    Accurate mileage is critical for pricing. In production, this would
    integrate with professional routing APIs (PC*Miler, Google Maps, etc).
    For MVP, we use a simplified calculation based on major city pairs.
    
    ARGS:
        origin_city: Pickup city name
        origin_state: Pickup state code
        dest_city: Delivery city name
        dest_state: Delivery state code
        
    RETURNS:
        int: Estimated road miles
    """
    
    # MVP: Simplified distance matrix for common lanes
    # In production, integrate with routing API
    distance_matrix = {
        ("Dallas, TX", "Houston, TX"): 240,
        ("Dallas, TX", "Miami, FL"): 1300,
        ("Los Angeles, CA", "Phoenix, AZ"): 370,
        ("Chicago, IL", "Atlanta, GA"): 720,
        ("New York, NY", "Los Angeles, CA"): 2800,
    }
    
    # Create location strings
    origin = f"{origin_city}, {origin_state}"
    dest = f"{dest_city}, {dest_state}"
    
    # Check matrix both directions
    if (origin, dest) in distance_matrix:
        return distance_matrix[(origin, dest)]
    elif (dest, origin) in distance_matrix:
        return distance_matrix[(dest, origin)]
    else:
        # Fallback: rough estimate based on state-to-state
        # In production, this would call a routing API
        return 500  # Default estimate

# ╔══════════ 3. Market Rate Analysis ═══════════════════════════════════════

class MarketRateAnalyzer:
    """
    Analyzes current market rates for freight lanes.
    
    BUSINESS CONTEXT:
    Understanding market rates is essential for competitive pricing.
    This class aggregates data from multiple sources to provide
    accurate rate guidance.
    """
    
    def __init__(self, supabase_client: Client):
        self.supabase = supabase_client
        
    def get_market_rates(self, origin_state: str, dest_state: str, 
                        equipment_type: str) -> Tuple[Optional[Decimal], Optional[Decimal], Optional[Decimal]]:
        """
        Fetch market rate data for a specific lane and equipment.
        
        MARKET SOURCES:
        1. Historical loads in our database
        2. External rate APIs (DAT, Truckstop)
        3. Seasonal adjustments
        4. Equipment-specific factors
        
        RETURNS:
            Tuple of (average, low, high) rates per mile
        """
        
        # Query historical rates from database
        try:
            # Look for similar loads in the past 30 days
            thirty_days_ago = (datetime.now() - timedelta(days=30)).isoformat()
            
            result = self.supabase.table("quotes").select(
                "rate", 
                "loads!inner(origin_state, dest_state, equipment_type, total_miles)"
            ).eq(
                "loads.origin_state", origin_state
            ).eq(
                "loads.dest_state", dest_state
            ).eq(
                "loads.equipment_type", equipment_type
            ).gte(
                "created_at", thirty_days_ago
            ).execute()
            
            if result.data and len(result.data) > 0:
                rates = [Decimal(str(q["rate"])) / Decimal(str(q["loads"]["total_miles"])) 
                        for q in result.data if q["loads"]["total_miles"] > 0]
                
                if rates:
                    avg_rate = sum(rates) / len(rates)
                    low_rate = min(rates)
                    high_rate = max(rates)
                    
                    return (avg_rate, low_rate, high_rate)
            
        except Exception as e:
            print(f"Error fetching market rates: {e}")
        
        # Fallback: Use default rates by equipment type
        base_rates = {
            "Van": (Decimal("2.00"), Decimal("1.75"), Decimal("2.50")),
            "Reefer": (Decimal("2.50"), Decimal("2.20"), Decimal("3.00")),
            "Flatbed": (Decimal("2.30"), Decimal("2.00"), Decimal("2.80")),
        }
        
        return base_rates.get(equipment_type, (Decimal("2.00"), Decimal("1.75"), Decimal("2.50")))
    
    def assess_market_condition(self, origin_state: str, dest_state: str,
                               pickup_date: str) -> MarketCondition:
        """
        Assess current market conditions for the lane.
        
        FACTORS CONSIDERED:
        - Day of week (Monday/Friday typically tighter)
        - Seasonal patterns (produce season, holidays)
        - Regional events (weather, ports)
        - Historical load-to-truck ratios
        
        RETURNS:
            MarketCondition enum value
        """
        
        # Parse pickup date
        pickup_dt = datetime.strptime(pickup_date, "%Y-%m-%d")
        day_of_week = pickup_dt.weekday()
        
        # Monday (0) and Friday (4) typically have tighter capacity
        if day_of_week in [0, 4]:
            return MarketCondition.TIGHT
        
        # Weekend pickups often have looser capacity
        elif day_of_week in [5, 6]:
            return MarketCondition.LOOSE
        
        # Default to balanced for other days
        return MarketCondition.BALANCED

# ╔══════════ 4. Fuel Surcharge Calculation ═══════════════════════════════════

def calculate_fuel_surcharge(miles: int, base_fuel_price: Decimal = Decimal("3.00"),
                           current_fuel_price: Decimal = Decimal("4.00")) -> Decimal:
    """
    Calculate fuel surcharge based on current diesel prices.
    
    INDUSTRY STANDARD:
    Fuel surcharge compensates for diesel price fluctuations above a baseline.
    Formula: (Current Price - Base Price) / MPG * Miles
    
    ARGS:
        miles: Total trip miles
        base_fuel_price: Baseline diesel price (typically $3.00)
        current_fuel_price: Current diesel price
        
    RETURNS:
        Decimal: Total fuel surcharge amount
    """
    
    # Industry standard: 6 MPG for loaded truck
    TRUCK_MPG = Decimal("6.0")
    
    if current_fuel_price <= base_fuel_price:
        return Decimal("0.00")
    
    price_difference = current_fuel_price - base_fuel_price
    gallons_needed = Decimal(str(miles)) / TRUCK_MPG
    surcharge = price_difference * gallons_needed
    
    return surcharge.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

# ╔══════════ 5. Main Pricing Engine ═══════════════════════════════════════

class PricingEngine:
    """
    Core pricing engine for freight rate calculation.
    
    PRICING PHILOSOPHY:
    Balance competitive market rates with profitable margins while
    considering risk factors and operational costs. Transparency
    in pricing builds trust with both shippers and carriers.
    """
    
    def __init__(self):
        # Initialize Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
        self.supabase: Client = create_client(supabase_url, supabase_key)
        
        # Initialize market analyzer
        self.market_analyzer = MarketRateAnalyzer(self.supabase)
        
        # Business configuration
        self.target_margin = 0.15  # 15% target margin
        self.min_margin = 0.10     # 10% minimum margin
        self.max_margin = 0.25     # 25% maximum margin
    
    def calculate_quote(self, load_data: dict) -> PricingResult:
        """
        Calculate comprehensive freight quote for a load.
        
        PRICING COMPONENTS:
        1. Base linehaul rate (mileage * rate per mile)
        2. Equipment adjustments
        3. Market condition adjustments
        4. Fuel surcharge
        5. Accessorial charges
        6. Margin calculation
        
        ARGS:
            load_data: Dictionary with load details
            
        RETURNS:
            PricingResult: Complete pricing recommendation
        """
        
        result = PricingResult()
        
        # Extract load details
        origin_city = load_data.get("origin_city", "")
        origin_state = load_data.get("origin_state", "")
        dest_city = load_data.get("dest_city", "")
        dest_state = load_data.get("dest_state", "")
        equipment_type = load_data.get("equipment_type", "Van")
        weight_lbs = load_data.get("weight_lbs", 0)
        pickup_date = load_data.get("pickup_date", datetime.now().strftime("%Y-%m-%d"))
        
        # Step 1: Calculate distance
        miles = calculate_distance(origin_city, origin_state, dest_city, dest_state)
        result.total_miles = miles
        result.pricing_notes.append(f"Calculated distance: {miles} miles")
        
        # Step 2: Get market rates
        avg_rate, low_rate, high_rate = self.market_analyzer.get_market_rates(
            origin_state, dest_state, equipment_type
        )
        result.market_average = avg_rate
        result.market_low = low_rate
        result.market_high = high_rate
        
        # Step 3: Assess market conditions
        market_condition = self.market_analyzer.assess_market_condition(
            origin_state, dest_state, pickup_date
        )
        result.market_condition = market_condition
        
        # Step 4: Calculate base rate with adjustments
        base_rate = avg_rate
        
        # Apply market condition adjustment
        if market_condition == MarketCondition.TIGHT:
            base_rate *= Decimal("1.10")  # 10% increase
            result.pricing_notes.append("Applied 10% increase for tight market")
        elif market_condition == MarketCondition.LOOSE:
            base_rate *= Decimal("0.90")  # 10% decrease
            result.pricing_notes.append("Applied 10% decrease for loose market")
        
        # Apply equipment type multiplier
        equipment_enum = self._get_equipment_enum(equipment_type)
        if equipment_enum:
            base_rate *= Decimal(str(equipment_enum.rate_multiplier))
            if equipment_enum.rate_multiplier != 1.0:
                result.pricing_notes.append(f"Applied {equipment_enum.display_name} equipment adjustment")
        
        result.base_rate_per_mile = base_rate.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        
        # Step 5: Calculate linehaul rate
        result.linehaul_rate = (base_rate * Decimal(str(miles))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        
        # Step 6: Calculate fuel surcharge
        result.fuel_surcharge = calculate_fuel_surcharge(miles)
        if result.fuel_surcharge > 0:
            result.pricing_notes.append(f"Fuel surcharge: ${result.fuel_surcharge}")
        
        # Step 7: Add accessorial charges if applicable
        # Heavy load charge (over 45,000 lbs)
        if weight_lbs > 45000:
            heavy_charge = Decimal("150.00")
            result.accessorial_charges["Heavy Load"] = heavy_charge
            result.pricing_notes.append("Added heavy load charge")
        
        # Step 8: Calculate total carrier rate
        total_accessorials = sum(result.accessorial_charges.values(), Decimal("0.00"))
        carrier_rate = result.linehaul_rate + result.fuel_surcharge + total_accessorials
        
        # Step 9: Apply broker margin
        margin_multiplier = Decimal(str(1 + self.target_margin))
        shipper_rate = (carrier_rate * margin_multiplier).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        
        # Step 10: Set final values
        result.total_rate = carrier_rate
        result.rate_per_mile = (carrier_rate / Decimal(str(miles))).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        result.recommended_quote_to_shipper = shipper_rate
        result.margin_percentage = self.target_margin * 100
        
        # Step 11: Calculate confidence score
        confidence_factors = []
        
        # Distance confidence (known routes score higher)
        if miles > 0:
            confidence_factors.append(0.9)
        else:
            confidence_factors.append(0.5)
        
        # Market data confidence
        if result.market_average:
            confidence_factors.append(0.95)
        else:
            confidence_factors.append(0.7)
        
        # Equipment type confidence
        if equipment_enum:
            confidence_factors.append(0.95)
        else:
            confidence_factors.append(0.8)
        
        result.confidence_score = sum(confidence_factors) / len(confidence_factors)
        
        # Add summary note
        result.pricing_notes.append(
            f"Quote: ${shipper_rate} (${result.rate_per_mile}/mile to carrier + {self.target_margin*100}% margin)"
        )
        
        return result
    
    def _get_equipment_enum(self, equipment_type: str) -> Optional[EquipmentType]:
        """Map equipment type string to enum."""
        equipment_map = {
            "Van": EquipmentType.VAN,
            "Reefer": EquipmentType.REEFER,
            "Flatbed": EquipmentType.FLATBED,
            "Stepdeck": EquipmentType.STEPDECK,
            "Power Only": EquipmentType.POWER_ONLY,
        }
        return equipment_map.get(equipment_type)

# ╔══════════ 6. Quote Generation ═══════════════════════════════════════

def generate_quote_email(load_data: dict, pricing_result: PricingResult) -> str:
    """
    Generate professional quote email content for shippers.
    
    BUSINESS CONTEXT:
    Clear, professional quotes build trust and win business.
    Include all relevant details while keeping it concise.
    
    ARGS:
        load_data: Load details dictionary
        pricing_result: Calculated pricing result
        
    RETURNS:
        str: Email body content
    """
    
    email_template = f"""
Thank you for your freight quote request. We're pleased to provide the following rate:

LOAD DETAILS:
Origin: {load_data.get('origin_city')}, {load_data.get('origin_state')}
Destination: {load_data.get('dest_city')}, {load_data.get('dest_state')}
Equipment: {load_data.get('equipment_type')}
Weight: {load_data.get('weight_lbs', 'TBD')} lbs
Distance: {pricing_result.total_miles} miles

QUOTED RATE: ${pricing_result.recommended_quote_to_shipper}

This all-inclusive rate includes:
- Linehaul: ${pricing_result.linehaul_rate}
- Fuel Surcharge: ${pricing_result.fuel_surcharge}
"""
    
    # Add accessorials if any
    if pricing_result.accessorial_charges:
        for charge_name, amount in pricing_result.accessorial_charges.items():
            email_template += f"- {charge_name}: ${amount}\n"
    
    email_template += f"""
Rate is valid for 24 hours and subject to carrier availability.

Ready to book? Simply reply to this email or call us at (555) 123-4567.

Best regards,
AI-Broker Team
"""
    
    return email_template.strip()

# ╔══════════ 7. Integration Functions ═══════════════════════════════════════

def price_load_for_quoting(load_id: str) -> Optional[PricingResult]:
    """
    Price a specific load from the database.
    
    INTEGRATION POINT:
    Called by the quoting workflow after load intake to generate
    pricing for shipper quotes.
    
    ARGS:
        load_id: Database ID of the load to price
        
    RETURNS:
        PricingResult or None if load not found
    """
    
    # Initialize pricing engine
    engine = PricingEngine()
    
    try:
        # Fetch load from database
        result = engine.supabase.table("loads").select("*").eq("id", load_id).single().execute()
        
        if not result.data:
            print(f"Load {load_id} not found")
            return None
        
        load_data = result.data
        
        # Calculate pricing
        pricing_result = engine.calculate_quote(load_data)
        
        # Store quote in database
        quote_data = {
            "load_id": load_id,
            "quoted_rate": str(pricing_result.recommended_quote_to_shipper),
            "carrier_rate": str(pricing_result.total_rate),
            "rate_per_mile": str(pricing_result.rate_per_mile),
            "margin_percentage": pricing_result.margin_percentage,
            "confidence_score": pricing_result.confidence_score,
            "pricing_notes": pricing_result.pricing_notes,
            "valid_until": (datetime.now() + timedelta(hours=24)).isoformat(),
            "status": "pending"
        }
        
        engine.supabase.table("quotes").insert(quote_data).execute()
        
        return pricing_result
        
    except Exception as e:
        print(f"Error pricing load {load_id}: {e}")
        return None

# ╔══════════ 8. Command Line Interface ═══════════════════════════════════════

def main():
    """
    CLI for testing the pricing engine.
    
    USAGE:
        python pricing_engine.py [load_id]
        python pricing_engine.py --test
    """
    
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        # Test mode with sample data
        test_load = {
            "origin_city": "Dallas",
            "origin_state": "TX",
            "dest_city": "Houston", 
            "dest_state": "TX",
            "equipment_type": "Van",
            "weight_lbs": 35000,
            "pickup_date": "2024-01-22"
        }
        
        print("🧮 Testing Pricing Engine with sample load...")
        print(json.dumps(test_load, indent=2))
        
        engine = PricingEngine()
        result = engine.calculate_quote(test_load)
        
        print("\n💰 Pricing Result:")
        print(json.dumps(result.to_dict(), indent=2))
        
        print("\n📧 Sample Quote Email:")
        print(generate_quote_email(test_load, result))
        
    elif len(sys.argv) > 1:
        # Price specific load ID
        load_id = sys.argv[1]
        print(f"💰 Pricing load {load_id}...")
        
        result = price_load_for_quoting(load_id)
        
        if result:
            print("\nPricing Result:")
            print(json.dumps(result.to_dict(), indent=2))
        else:
            print("Failed to price load")
    else:
        print("Usage: python pricing_engine.py [load_id]")
        print("   or: python pricing_engine.py --test")

if __name__ == "__main__":
    main()

# ╔══════════ INTEGRATION NOTES ═══════════════════════════════════════
"""
INTEGRATION WITH EXISTING SYSTEM:

1. INTAKE WORKFLOW INTEGRATION:
   - After load is saved, call price_load_for_quoting()
   - Store pricing result in quotes table
   - Send quote email to shipper

2. DATABASE SCHEMA REQUIREMENTS:
   - quotes table with pricing fields
   - market_rates table for historical data (future)
   - fuel_prices table for surcharge calculation (future)

3. EXTERNAL API INTEGRATION (Future):
   - DAT RateView API for real-time market rates
   - PC*Miler or Google Maps for accurate mileage
   - EIA API for diesel fuel prices

4. MONITORING AND OPTIMIZATION:
   - Track quote-to-book conversion rates
   - Analyze margin performance by lane
   - A/B test pricing strategies
   - Monitor competitive win/loss rates

5. BUSINESS RULES ENGINE (Future):
   - Customer-specific pricing rules
   - Volume discounts
   - Seasonal adjustments
   - Contract rate management

This pricing engine provides the foundation for intelligent,
market-based freight pricing that can evolve with the business.
"""
# --------------------------- end of file ------------------------------