# --------------------------- src/services/distance_calculator.py ----------------------------
"""
AI-Broker MVP · Distance Calculation Service

OVERVIEW:
Provides accurate distance calculations between cities for freight pricing.
Uses multiple data sources with fallbacks for reliability.

WORKFLOW:
1. Try cache for known city pairs
2. Use ZIP code database for approximation
3. Call external API if needed (Google Maps, MapBox)
4. Cache results for performance

BUSINESS LOGIC:
- Accurate mileage is critical for pricing
- Road miles differ from straight-line distance
- Must account for truck-restricted routes
- Cache common lanes for performance

TECHNICAL ARCHITECTURE:
- Local ZIP code database for fast lookups
- External API integration with caching
- Haversine formula for approximation
- Database caching of results

DEPENDENCIES:
- ZIP code database or API
- Optional: Google Maps API
- Optional: MapBox API
"""

import os
import json
import math
from typing import Tuple, Optional, Dict
from datetime import datetime, timedelta
from functools import lru_cache
import requests
from geopy.distance import great_circle
from geopy.geocoders import Nominatim

from dotenv import load_dotenv
load_dotenv()


class DistanceCalculator:
    """
    Multi-source distance calculator for freight routes.
    
    BUSINESS CONTEXT:
    Accurate distance calculation directly impacts:
    - Quote accuracy (under/over pricing)
    - Carrier acceptance rates
    - Profit margins
    - Customer trust
    
    ARCHITECTURE ROLE:
    Central service used by pricing engine and
    other components needing distance data.
    """
    
    def __init__(self):
        """Initialize distance calculator with data sources."""
        # Initialize geocoder
        self.geolocator = Nominatim(user_agent="ai-broker-mvp")
        
        # Cache for geocoding results
        self._location_cache = {}
        
        # Static distance matrix for common lanes (MVP)
        self.distance_matrix = self._load_distance_matrix()
        
        # External API keys (optional)
        self.google_maps_key = os.getenv("GOOGLE_MAPS_API_KEY")
        self.mapbox_key = os.getenv("MAPBOX_API_KEY")
    
    def calculate_distance(self, origin_city: str, origin_state: str,
                         origin_zip: str, dest_city: str, 
                         dest_state: str, dest_zip: str) -> Dict[str, any]:
        """
        Calculate distance between two locations with metadata.
        
        CALCULATION HIERARCHY:
        1. Exact match in distance matrix
        2. ZIP code database lookup
        3. External routing API
        4. Haversine approximation with road factor
        
        ARGS:
            origin_city: Pickup city
            origin_state: Pickup state (2-letter)
            origin_zip: Pickup ZIP code
            dest_city: Delivery city
            dest_state: Delivery state (2-letter)
            dest_zip: Delivery ZIP code
            
        RETURNS:
            Dict containing:
            - miles: Estimated road miles
            - calculation_method: How distance was calculated
            - confidence: Confidence level (0-1)
            - straight_line_miles: Direct distance
            - route_factor: Road miles / straight line
        """
        
        # Try distance matrix first
        matrix_distance = self._check_distance_matrix(
            origin_city, origin_state, dest_city, dest_state
        )
        
        if matrix_distance:
            return {
                'miles': matrix_distance,
                'calculation_method': 'distance_matrix',
                'confidence': 0.95,
                'straight_line_miles': None,
                'route_factor': None
            }
        
        # Try ZIP-based calculation
        if origin_zip and dest_zip:
            zip_result = self._calculate_by_zip(origin_zip, dest_zip)
            if zip_result:
                return zip_result
        
        # Try external API
        if self.google_maps_key:
            api_result = self._calculate_by_google_maps(
                f"{origin_city}, {origin_state} {origin_zip}",
                f"{dest_city}, {dest_state} {dest_zip}"
            )
            if api_result:
                return api_result
        
        # Fallback to geocoding + Haversine
        return self._calculate_by_geocoding(
            origin_city, origin_state, dest_city, dest_state
        )
    
    def _load_distance_matrix(self) -> Dict[Tuple[str, str], int]:
        """
        Load pre-calculated distances for common lanes.
        
        MATRIX DATA:
        Contains verified road miles for frequently
        quoted lanes to ensure pricing accuracy.
        """
        matrix = {
            # Texas Triangle
            ("Dallas, TX", "Houston, TX"): 240,
            ("Houston, TX", "Dallas, TX"): 240,
            ("Dallas, TX", "San Antonio, TX"): 275,
            ("San Antonio, TX", "Dallas, TX"): 275,
            ("Houston, TX", "San Antonio, TX"): 200,
            ("San Antonio, TX", "Houston, TX"): 200,
            ("Dallas, TX", "Austin, TX"): 195,
            ("Austin, TX", "Dallas, TX"): 195,
            
            # Major lanes
            ("Los Angeles, CA", "Phoenix, AZ"): 370,
            ("Phoenix, AZ", "Los Angeles, CA"): 370,
            ("Chicago, IL", "Atlanta, GA"): 720,
            ("Atlanta, GA", "Chicago, IL"): 720,
            ("New York, NY", "Miami, FL"): 1280,
            ("Miami, FL", "New York, NY"): 1280,
            ("Seattle, WA", "Los Angeles, CA"): 1135,
            ("Los Angeles, CA", "Seattle, WA"): 1135,
            ("Denver, CO", "Chicago, IL"): 1000,
            ("Chicago, IL", "Denver, CO"): 1000,
            
            # Cross-country
            ("Los Angeles, CA", "New York, NY"): 2790,
            ("New York, NY", "Los Angeles, CA"): 2790,
            ("Seattle, WA", "Miami, FL"): 3300,
            ("Miami, FL", "Seattle, WA"): 3300,
            
            # Regional
            ("Atlanta, GA", "Miami, FL"): 665,
            ("Miami, FL", "Atlanta, GA"): 665,
            ("Dallas, TX", "Miami, FL"): 1310,
            ("Miami, FL", "Dallas, TX"): 1310,
            ("Chicago, IL", "Detroit, MI"): 285,
            ("Detroit, MI", "Chicago, IL"): 285,
            ("Boston, MA", "New York, NY"): 215,
            ("New York, NY", "Boston, MA"): 215,
        }
        
        return matrix
    
    def _check_distance_matrix(self, origin_city: str, origin_state: str,
                             dest_city: str, dest_state: str) -> Optional[int]:
        """Check if route exists in pre-calculated matrix."""
        origin = f"{origin_city}, {origin_state}"
        dest = f"{dest_city}, {dest_state}"
        
        return self.distance_matrix.get((origin, dest))
    
    def _calculate_by_zip(self, origin_zip: str, dest_zip: str) -> Optional[Dict]:
        """
        Calculate distance using ZIP code centroids.
        
        ZIP CODE APPROACH:
        - Each ZIP has a central lat/lon point
        - Calculate straight-line distance
        - Apply road factor (typically 1.2-1.3x)
        """
        # In production, use a ZIP code database
        # For MVP, use geocoding as fallback
        try:
            # Get coordinates for ZIPs
            origin_coords = self._geocode_location(origin_zip)
            dest_coords = self._geocode_location(dest_zip)
            
            if origin_coords and dest_coords:
                # Calculate straight-line distance
                straight_miles = great_circle(origin_coords, dest_coords).miles
                
                # Apply road factor (1.25 is typical)
                road_factor = 1.25
                road_miles = int(straight_miles * road_factor)
                
                return {
                    'miles': road_miles,
                    'calculation_method': 'zip_geocoding',
                    'confidence': 0.8,
                    'straight_line_miles': int(straight_miles),
                    'route_factor': road_factor
                }
                
        except Exception as e:
            print(f"ZIP calculation error: {e}")
        
        return None
    
    def _calculate_by_google_maps(self, origin: str, destination: str) -> Optional[Dict]:
        """
        Use Google Maps Distance Matrix API for accurate routing.
        
        GOOGLE MAPS BENEFITS:
        - Actual road routing
        - Traffic considerations
        - Truck restrictions
        - Toll road options
        """
        if not self.google_maps_key:
            return None
        
        try:
            url = "https://maps.googleapis.com/maps/api/distancematrix/json"
            params = {
                'origins': origin,
                'destinations': destination,
                'mode': 'driving',
                'units': 'imperial',
                'key': self.google_maps_key
            }
            
            response = requests.get(url, params=params, timeout=5)
            data = response.json()
            
            if data['status'] == 'OK' and data['rows'][0]['elements'][0]['status'] == 'OK':
                element = data['rows'][0]['elements'][0]
                meters = element['distance']['value']
                miles = int(meters * 0.000621371)  # Convert to miles
                
                return {
                    'miles': miles,
                    'calculation_method': 'google_maps_api',
                    'confidence': 0.99,
                    'straight_line_miles': None,
                    'route_factor': None,
                    'duration_hours': element['duration']['value'] / 3600
                }
                
        except Exception as e:
            print(f"Google Maps API error: {e}")
        
        return None
    
    def _calculate_by_geocoding(self, origin_city: str, origin_state: str,
                              dest_city: str, dest_state: str) -> Dict:
        """
        Fallback calculation using geocoding and Haversine formula.
        
        HAVERSINE LIMITATION:
        Calculates straight-line distance, not road miles.
        We apply a factor to estimate road distance.
        """
        origin = f"{origin_city}, {origin_state}"
        dest = f"{dest_city}, {dest_state}"
        
        # Get coordinates
        origin_coords = self._geocode_location(origin)
        dest_coords = self._geocode_location(dest)
        
        if not origin_coords or not dest_coords:
            # Ultimate fallback - rough estimate
            return {
                'miles': 500,  # Default estimate
                'calculation_method': 'fallback_estimate',
                'confidence': 0.3,
                'straight_line_miles': None,
                'route_factor': None
            }
        
        # Calculate distance
        straight_miles = great_circle(origin_coords, dest_coords).miles
        
        # Determine road factor based on distance
        if straight_miles < 200:
            road_factor = 1.2  # Short trips have less deviation
        elif straight_miles < 500:
            road_factor = 1.25  # Medium trips
        else:
            road_factor = 1.3  # Long trips have more deviation
        
        road_miles = int(straight_miles * road_factor)
        
        return {
            'miles': road_miles,
            'calculation_method': 'haversine_estimate',
            'confidence': 0.7,
            'straight_line_miles': int(straight_miles),
            'route_factor': road_factor
        }
    
    @lru_cache(maxsize=1000)
    def _geocode_location(self, location: str) -> Optional[Tuple[float, float]]:
        """
        Geocode a location string to coordinates.
        
        CACHING:
        Results are cached to avoid repeated API calls
        for common locations.
        """
        try:
            result = self.geolocator.geocode(location, timeout=3)
            if result:
                return (result.latitude, result.longitude)
        except Exception as e:
            print(f"Geocoding error for {location}: {e}")
        
        return None
    
    def get_drive_time_estimate(self, miles: int) -> float:
        """
        Estimate driving hours based on distance.
        
        INDUSTRY STANDARDS:
        - Average commercial truck speed: 50-55 mph
        - Includes stops, traffic, regulations
        - HOS (Hours of Service) compliance
        
        ARGS:
            miles: Total trip distance
            
        RETURNS:
            float: Estimated hours including breaks
        """
        # Base calculation at 50 mph average
        base_hours = miles / 50.0
        
        # Add time for stops and breaks
        if miles <= 300:
            # Short haul - minimal breaks
            total_hours = base_hours * 1.1
        elif miles <= 600:
            # Medium haul - meal break
            total_hours = base_hours * 1.15
        else:
            # Long haul - multiple breaks, possible overnight
            total_hours = base_hours * 1.2
        
        return round(total_hours, 1)


# Utility functions for easy integration
def calculate_freight_distance(origin_city: str, origin_state: str,
                             origin_zip: str, dest_city: str,
                             dest_state: str, dest_zip: str) -> int:
    """
    Simple function to get distance in miles.
    
    USAGE:
    ```python
    miles = calculate_freight_distance(
        "Dallas", "TX", "75201",
        "Houston", "TX", "77002"
    )
    ```
    """
    calculator = DistanceCalculator()
    result = calculator.calculate_distance(
        origin_city, origin_state, origin_zip,
        dest_city, dest_state, dest_zip
    )
    return result['miles']


def get_route_details(origin_city: str, origin_state: str,
                    origin_zip: str, dest_city: str,
                    dest_state: str, dest_zip: str) -> Dict:
    """
    Get detailed route information.
    
    RETURNS:
        Dict with miles, drive time, calculation method, etc.
    """
    calculator = DistanceCalculator()
    result = calculator.calculate_distance(
        origin_city, origin_state, origin_zip,
        dest_city, dest_state, dest_zip
    )
    
    # Add drive time estimate
    result['drive_time_hours'] = calculator.get_drive_time_estimate(result['miles'])
    
    return result


# Example usage and testing
if __name__ == "__main__":
    print("🗺️ Testing Distance Calculator")
    print("=" * 50)
    
    test_routes = [
        ("Dallas", "TX", "75201", "Houston", "TX", "77002"),
        ("Los Angeles", "CA", "90001", "Phoenix", "AZ", "85001"),
        ("Chicago", "IL", "60601", "Atlanta", "GA", "30301"),
        ("Portland", "OR", "97201", "Sacramento", "CA", "95814"),
    ]
    
    calculator = DistanceCalculator()
    
    for origin_city, origin_state, origin_zip, dest_city, dest_state, dest_zip in test_routes:
        print(f"\n{origin_city}, {origin_state} → {dest_city}, {dest_state}")
        
        result = calculator.calculate_distance(
            origin_city, origin_state, origin_zip,
            dest_city, dest_state, dest_zip
        )
        
        print(f"  Distance: {result['miles']} miles")
        print(f"  Method: {result['calculation_method']}")
        print(f"  Confidence: {result['confidence']:.0%}")
        
        drive_time = calculator.get_drive_time_estimate(result['miles'])
        print(f"  Drive time: {drive_time} hours")
        
        if result.get('straight_line_miles'):
            print(f"  Straight line: {result['straight_line_miles']} miles")
            print(f"  Route factor: {result['route_factor']:.2f}x")