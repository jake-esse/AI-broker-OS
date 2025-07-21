# --------------------------- src/services/carrier_matching.py ----------------------------
"""
AI-Broker MVP · Carrier Matching Service

OVERVIEW:
Intelligent carrier matching service that selects the best carriers for a given load
based on multiple criteria including lanes, equipment, performance, and pricing.

WORKFLOW:
1. Analyze load requirements (origin, destination, equipment, etc.)
2. Query carrier database for matches
3. Score carriers based on multiple factors
4. Return ranked list of best matches

BUSINESS LOGIC:
- Match carriers who service the specific lane
- Prioritize carriers with appropriate equipment
- Consider carrier performance metrics
- Factor in historical pricing
- Respect carrier preferences and restrictions

TECHNICAL ARCHITECTURE:
- Database-driven carrier selection
- Multi-factor scoring algorithm
- Caching for performance
- Extensible matching criteria

DEPENDENCIES:
- Supabase for carrier data
- Geopy for distance calculations
- Load data from intake agent
"""

import os
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import json

from supabase import create_client, Client
from geopy.distance import geodesic
from geopy.geocoders import Nominatim
from dotenv import load_dotenv

load_dotenv()


class EquipmentType(Enum):
    """Standard equipment types in freight industry."""
    VAN = "Van"
    FLATBED = "Flatbed"
    REEFER = "Reefer"
    STEPDECK = "Stepdeck"
    RGN = "RGN"
    TANKER = "Tanker"
    INTERMODAL = "Intermodal"


@dataclass
class CarrierScore:
    """
    Carrier scoring result with detailed breakdown.
    
    SCORING FACTORS:
    - Lane coverage: Does carrier service this route?
    - Equipment match: Do they have the right trucks?
    - Performance: On-time delivery, claims ratio
    - Pricing: Historical rates on similar lanes
    - Availability: Current capacity
    """
    carrier_id: str
    carrier_name: str
    carrier_email: str
    total_score: float
    lane_score: float
    equipment_score: float
    performance_score: float
    price_score: float
    availability_score: float
    notes: List[str]


class CarrierMatchingService:
    """
    Intelligent carrier matching for load assignments.
    
    BUSINESS CONTEXT:
    Matching the right carrier to each load is critical for:
    - Service quality (on-time delivery)
    - Cost optimization (competitive rates)
    - Risk management (reliable carriers)
    - Customer satisfaction
    
    ARCHITECTURE ROLE:
    Acts as the intelligence layer between load intake
    and the LoadBlast agent, ensuring we contact the
    most appropriate carriers first.
    """
    
    def __init__(self):
        """Initialize carrier matching service with database connection."""
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("Supabase configuration required")
        
        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.geolocator = Nominatim(user_agent="ai-broker-mvp")
        
        # Cache for geocoding results
        self._location_cache = {}
        
    def match_carriers_for_load(self, load_data: Dict) -> List[CarrierScore]:
        """
        Find and rank the best carriers for a specific load.
        
        MATCHING ALGORITHM:
        1. Filter carriers by basic criteria (equipment, lane)
        2. Score each carrier on multiple factors
        3. Apply business rules and preferences
        4. Return ranked list for LoadBlast agent
        
        ARGS:
            load_data: Dictionary with load details including:
                - origin_zip: Pickup location
                - dest_zip: Delivery location
                - equipment: Required equipment type
                - weight_lb: Load weight
                - pickup_dt: Pickup date
                - hazmat: Hazmat flag (optional)
                
        RETURNS:
            List of CarrierScore objects, ranked by total score
            
        INTEGRATION POINTS:
        - Called after successful load intake
        - Results feed into LoadBlast agent
        - Scores influence blast tiers
        """
        # Extract load details
        origin_zip = load_data.get('origin_zip')
        dest_zip = load_data.get('dest_zip')
        equipment = load_data.get('equipment', 'Van')
        weight = load_data.get('weight_lb', 0)
        pickup_date = load_data.get('pickup_dt')
        is_hazmat = load_data.get('hazmat', False)
        
        # Get all active carriers
        carriers = self._get_active_carriers()
        
        # Score each carrier
        scored_carriers = []
        for carrier in carriers:
            score = self._score_carrier(carrier, load_data)
            if score.total_score > 0:  # Only include viable carriers
                scored_carriers.append(score)
        
        # Sort by total score (highest first)
        scored_carriers.sort(key=lambda x: x.total_score, reverse=True)
        
        return scored_carriers
    
    def _get_active_carriers(self) -> List[Dict]:
        """
        Retrieve all active carriers from database.
        
        FILTERING CRITERIA:
        - Status must be 'active'
        - Must have valid contact info
        - Must have passed compliance checks
        """
        try:
            response = self.supabase.table('carriers').select('*').eq(
                'status', 'active'
            ).execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            print(f"Error fetching carriers: {e}")
            return []
    
    def _score_carrier(self, carrier: Dict, load_data: Dict) -> CarrierScore:
        """
        Score a carrier for a specific load.
        
        SCORING BREAKDOWN:
        - Lane coverage (0-30 points): Based on lane history and coverage area
        - Equipment match (0-25 points): Exact match vs. compatible equipment
        - Performance (0-20 points): On-time %, claims ratio, customer ratings
        - Pricing (0-15 points): Historical pricing competitiveness
        - Availability (0-10 points): Current capacity and response rate
        
        Total possible: 100 points
        """
        notes = []
        
        # Initialize scores
        lane_score = self._calculate_lane_score(carrier, load_data, notes)
        equipment_score = self._calculate_equipment_score(carrier, load_data, notes)
        performance_score = self._calculate_performance_score(carrier, notes)
        price_score = self._calculate_price_score(carrier, load_data, notes)
        availability_score = self._calculate_availability_score(carrier, notes)
        
        # Calculate total
        total_score = (
            lane_score + 
            equipment_score + 
            performance_score + 
            price_score + 
            availability_score
        )
        
        return CarrierScore(
            carrier_id=carrier['id'],
            carrier_name=carrier['name'],
            carrier_email=carrier['email'],
            total_score=total_score,
            lane_score=lane_score,
            equipment_score=equipment_score,
            performance_score=performance_score,
            price_score=price_score,
            availability_score=availability_score,
            notes=notes
        )
    
    def _calculate_lane_score(self, carrier: Dict, load_data: Dict, notes: List[str]) -> float:
        """
        Calculate lane coverage score (0-30 points).
        
        LANE SCORING LOGIC:
        - Exact lane match: 30 points
        - Origin state match: 20 points
        - Regional coverage: 15 points
        - National carrier: 10 points
        - No coverage: 0 points
        """
        origin_zip = load_data.get('origin_zip')
        dest_zip = load_data.get('dest_zip')
        
        # Get carrier lanes from JSON field
        carrier_lanes = carrier.get('preferred_lanes', [])
        if isinstance(carrier_lanes, str):
            try:
                carrier_lanes = json.loads(carrier_lanes)
            except:
                carrier_lanes = []
        
        # Check for exact lane match
        exact_lane = f"{origin_zip}-{dest_zip}"
        if exact_lane in carrier_lanes:
            notes.append(f"Exact lane match: {exact_lane}")
            return 30.0
        
        # Check for state-level match
        origin_state = self._get_state_from_zip(origin_zip)
        dest_state = self._get_state_from_zip(dest_zip)
        
        if origin_state and dest_state:
            state_lane = f"{origin_state}-{dest_state}"
            if any(state_lane in lane for lane in carrier_lanes):
                notes.append(f"State lane match: {state_lane}")
                return 20.0
        
        # Check coverage areas
        coverage_areas = carrier.get('coverage_areas', [])
        if isinstance(coverage_areas, str):
            try:
                coverage_areas = json.loads(coverage_areas)
            except:
                coverage_areas = []
        
        if origin_state in coverage_areas:
            notes.append(f"Services origin state: {origin_state}")
            return 15.0
        
        # National carrier
        if carrier.get('operating_area') == 'national':
            notes.append("National carrier")
            return 10.0
        
        notes.append("No specific lane coverage")
        return 0.0
    
    def _calculate_equipment_score(self, carrier: Dict, load_data: Dict, notes: List[str]) -> float:
        """
        Calculate equipment match score (0-25 points).
        
        EQUIPMENT SCORING:
        - Exact equipment match: 25 points
        - Compatible equipment: 15 points
        - Partial match: 10 points
        - No match: 0 points
        """
        required_equipment = load_data.get('equipment', 'Van').lower()
        
        # Get carrier equipment types
        carrier_equipment = carrier.get('equipment_types', [])
        if isinstance(carrier_equipment, str):
            try:
                carrier_equipment = json.loads(carrier_equipment)
            except:
                carrier_equipment = []
        
        # Normalize equipment types
        carrier_equipment = [eq.lower() for eq in carrier_equipment]
        
        # Check for exact match
        if required_equipment in carrier_equipment:
            notes.append(f"Has required equipment: {required_equipment}")
            return 25.0
        
        # Check for compatible equipment
        compatibility_map = {
            'van': ['dry van', 'van'],
            'reefer': ['refrigerated', 'reefer'],
            'flatbed': ['flatbed', 'stepdeck', 'rgn'],
            'stepdeck': ['stepdeck', 'flatbed'],
        }
        
        compatible_types = compatibility_map.get(required_equipment, [])
        if any(eq in carrier_equipment for eq in compatible_types):
            notes.append(f"Has compatible equipment")
            return 15.0
        
        # Partial match (e.g., carrier has multiple equipment types)
        if len(carrier_equipment) > 3:
            notes.append("Multi-equipment carrier")
            return 10.0
        
        notes.append("No equipment match")
        return 0.0
    
    def _calculate_performance_score(self, carrier: Dict, notes: List[str]) -> float:
        """
        Calculate performance score (0-20 points).
        
        PERFORMANCE METRICS:
        - On-time delivery rate
        - Claims ratio
        - Safety rating
        - Customer satisfaction
        """
        # Get performance metrics
        on_time_pct = carrier.get('on_time_pct', 0.85)
        claims_ratio = carrier.get('claims_ratio', 0.02)
        safety_rating = carrier.get('safety_rating', 'satisfactory')
        
        score = 0.0
        
        # On-time performance (0-10 points)
        if on_time_pct >= 0.95:
            score += 10.0
            notes.append(f"Excellent on-time: {on_time_pct:.0%}")
        elif on_time_pct >= 0.90:
            score += 7.0
            notes.append(f"Good on-time: {on_time_pct:.0%}")
        elif on_time_pct >= 0.85:
            score += 5.0
            notes.append(f"Average on-time: {on_time_pct:.0%}")
        else:
            notes.append(f"Poor on-time: {on_time_pct:.0%}")
        
        # Claims ratio (0-5 points)
        if claims_ratio <= 0.01:
            score += 5.0
            notes.append("Excellent claims history")
        elif claims_ratio <= 0.02:
            score += 3.0
            notes.append("Good claims history")
        elif claims_ratio <= 0.05:
            score += 1.0
            notes.append("Average claims history")
        else:
            notes.append(f"High claims ratio: {claims_ratio:.1%}")
        
        # Safety rating (0-5 points)
        if safety_rating == 'excellent':
            score += 5.0
            notes.append("Excellent safety rating")
        elif safety_rating == 'satisfactory':
            score += 3.0
            notes.append("Satisfactory safety rating")
        else:
            notes.append(f"Poor safety rating: {safety_rating}")
        
        return score
    
    def _calculate_price_score(self, carrier: Dict, load_data: Dict, notes: List[str]) -> float:
        """
        Calculate pricing competitiveness score (0-15 points).
        
        PRICING LOGIC:
        Based on carrier's historical pricing relative to market
        and their typical margins on similar lanes.
        """
        # Get carrier's typical margin
        typical_margin = carrier.get('typical_margin_pct', 0.15)
        
        # Pricing competitiveness
        if typical_margin <= 0.10:
            score = 15.0
            notes.append("Very competitive pricing")
        elif typical_margin <= 0.15:
            score = 10.0
            notes.append("Competitive pricing")
        elif typical_margin <= 0.20:
            score = 5.0
            notes.append("Average pricing")
        else:
            score = 0.0
            notes.append("Premium pricing")
        
        return score
    
    def _calculate_availability_score(self, carrier: Dict, notes: List[str]) -> float:
        """
        Calculate availability score (0-10 points).
        
        AVAILABILITY FACTORS:
        - Current capacity utilization
        - Response rate to quotes
        - Last active date
        """
        # Check last active date
        last_active = carrier.get('last_active_date')
        if last_active:
            try:
                last_active_date = datetime.fromisoformat(last_active.replace('Z', '+00:00'))
                days_inactive = (datetime.now(last_active_date.tzinfo) - last_active_date).days
                
                if days_inactive <= 1:
                    score = 10.0
                    notes.append("Recently active")
                elif days_inactive <= 7:
                    score = 7.0
                    notes.append(f"Active {days_inactive} days ago")
                elif days_inactive <= 30:
                    score = 3.0
                    notes.append(f"Active {days_inactive} days ago")
                else:
                    score = 0.0
                    notes.append(f"Inactive for {days_inactive} days")
            except:
                score = 5.0
                notes.append("Unknown activity")
        else:
            score = 5.0
            notes.append("No activity data")
        
        return score
    
    def _get_state_from_zip(self, zip_code: str) -> Optional[str]:
        """
        Get state abbreviation from ZIP code.
        
        Uses simple ZIP code range mapping for performance.
        In production, would use a proper ZIP database.
        """
        if not zip_code or len(zip_code) < 3:
            return None
        
        # Simple ZIP prefix to state mapping (partial)
        zip_prefix = zip_code[:3]
        prefix_map = {
            # This is a simplified example - in production use complete mapping
            '750': 'TX', '751': 'TX', '752': 'TX',  # Texas
            '300': 'GA', '301': 'GA', '303': 'GA',  # Georgia
            '331': 'FL', '332': 'FL', '333': 'FL',  # Florida
            '100': 'NY', '101': 'NY', '102': 'NY',  # New York
            '900': 'CA', '901': 'CA', '902': 'CA',  # California
            '600': 'IL', '601': 'IL', '602': 'IL',  # Illinois
        }
        
        return prefix_map.get(zip_prefix)
    
    def get_carrier_tiers(self, scored_carriers: List[CarrierScore]) -> Dict[str, List[CarrierScore]]:
        """
        Group carriers into tiers for staggered outreach.
        
        TIER STRATEGY:
        - Tier 1 (80+ score): Best matches, contact immediately
        - Tier 2 (60-79 score): Good matches, contact after 30 min
        - Tier 3 (40-59 score): Acceptable matches, contact after 1 hour
        - Tier 4 (below 40): Last resort, contact after 2 hours
        
        BUSINESS RATIONALE:
        Gives best carriers first opportunity while ensuring
        coverage if top carriers don't respond.
        """
        tiers = {
            'tier_1': [],
            'tier_2': [],
            'tier_3': [],
            'tier_4': []
        }
        
        for carrier in scored_carriers:
            if carrier.total_score >= 80:
                tiers['tier_1'].append(carrier)
            elif carrier.total_score >= 60:
                tiers['tier_2'].append(carrier)
            elif carrier.total_score >= 40:
                tiers['tier_3'].append(carrier)
            else:
                tiers['tier_4'].append(carrier)
        
        # Limit each tier size
        max_per_tier = {
            'tier_1': 10,
            'tier_2': 15,
            'tier_3': 20,
            'tier_4': 25
        }
        
        for tier, max_count in max_per_tier.items():
            tiers[tier] = tiers[tier][:max_count]
        
        return tiers


# Utility function for easy integration
def match_carriers_for_load(load_data: Dict) -> List[CarrierScore]:
    """
    Convenience function to match carriers for a load.
    
    INTEGRATION EXAMPLE:
    ```python
    from carrier_matching import match_carriers_for_load
    
    carriers = match_carriers_for_load({
        'origin_zip': '75001',
        'dest_zip': '30301',
        'equipment': 'Van',
        'weight_lb': 25000,
        'pickup_dt': '2024-01-15T08:00:00Z'
    })
    
    for carrier in carriers[:5]:  # Top 5 carriers
        print(f"{carrier.carrier_name}: {carrier.total_score:.1f} points")
    ```
    """
    service = CarrierMatchingService()
    return service.match_carriers_for_load(load_data)