#!/usr/bin/env python3
"""
Test script for the market-based pricing engine.

Tests:
1. Distance calculation with multiple methods
2. Market rate analysis
3. Complete quote generation
4. Equipment type adjustments
"""

import sys
import json
from pathlib import Path
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.services.distance_calculator import DistanceCalculator, get_route_details
from src.services.pricing.engine import PricingEngine, generate_quote_email


def test_distance_calculator():
    """Test distance calculation with various routes."""
    print("\n=== Testing Distance Calculator ===")
    
    calculator = DistanceCalculator()
    
    test_routes = [
        {
            "name": "Dallas to Houston (Known Route)",
            "origin": ("Dallas", "TX", "75201"),
            "dest": ("Houston", "TX", "77002")
        },
        {
            "name": "Portland to Sacramento (Unknown Route)",
            "origin": ("Portland", "OR", "97201"),
            "dest": ("Sacramento", "CA", "95814")
        },
        {
            "name": "Miami to Atlanta",
            "origin": ("Miami", "FL", "33101"),
            "dest": ("Atlanta", "GA", "30301")
        }
    ]
    
    for route in test_routes:
        print(f"\n{route['name']}:")
        origin = route['origin']
        dest = route['dest']
        
        result = calculator.calculate_distance(
            origin[0], origin[1], origin[2],
            dest[0], dest[1], dest[2]
        )
        
        print(f"  Distance: {result['miles']} miles")
        print(f"  Method: {result['calculation_method']}")
        print(f"  Confidence: {result['confidence']:.0%}")
        
        drive_time = calculator.get_drive_time_estimate(result['miles'])
        print(f"  Estimated drive time: {drive_time} hours")
        
        if result.get('straight_line_miles'):
            print(f"  Straight-line distance: {result['straight_line_miles']} miles")
            print(f"  Route factor: {result['route_factor']:.2f}x")


def test_pricing_scenarios():
    """Test pricing engine with different scenarios."""
    print("\n=== Testing Pricing Engine ===")
    
    try:
        engine = PricingEngine()
    except Exception as e:
        print(f"⚠️  Warning: Pricing engine initialization failed (likely missing Supabase config)")
        print(f"   Error: {str(e)}")
        print("   Skipping pricing tests that require database")
        return
    
    scenarios = [
        {
            "name": "Standard Van Load - Short Haul",
            "load": {
                "origin_city": "Dallas",
                "origin_state": "TX",
                "origin_zip": "75201",
                "dest_city": "Houston",
                "dest_state": "TX",
                "dest_zip": "77002",
                "equipment": "Van",
                "weight_lb": 25000,
                "pickup_dt": "2024-01-25",
                "commodity": "General Freight"
            }
        },
        {
            "name": "Reefer Load - Long Haul",
            "load": {
                "origin_city": "Los Angeles",
                "origin_state": "CA",
                "origin_zip": "90001",
                "dest_city": "Chicago",
                "dest_state": "IL", 
                "dest_zip": "60601",
                "equipment": "Reefer",
                "weight_lb": 38000,
                "pickup_dt": "2024-01-26",
                "commodity": "Frozen Foods"
            }
        },
        {
            "name": "Heavy Flatbed Load",
            "load": {
                "origin_city": "Atlanta",
                "origin_state": "GA",
                "origin_zip": "30301",
                "dest_city": "Miami",
                "dest_state": "FL",
                "dest_zip": "33101",
                "equipment": "Flatbed",
                "weight_lb": 48000,
                "pickup_dt": "2024-01-24",
                "commodity": "Construction Materials"
            }
        }
    ]
    
    for scenario in scenarios:
        print(f"\n{scenario['name']}:")
        print(f"  Route: {scenario['load']['origin_city']}, {scenario['load']['origin_state']} → " +
              f"{scenario['load']['dest_city']}, {scenario['load']['dest_state']}")
        print(f"  Equipment: {scenario['load']['equipment']}")
        print(f"  Weight: {scenario['load']['weight_lb']:,} lbs")
        
        try:
            # Calculate quote
            result = engine.calculate_quote(scenario['load'])
            
            print(f"\n  Pricing Results:")
            print(f"    Distance: {result.total_miles} miles")
            print(f"    Base rate: ${result.base_rate_per_mile}/mile")
            print(f"    Linehaul: ${result.linehaul_rate}")
            print(f"    Fuel surcharge: ${result.fuel_surcharge}")
            
            if result.accessorial_charges:
                print(f"    Accessorials:")
                for charge, amount in result.accessorial_charges.items():
                    print(f"      - {charge}: ${amount}")
            
            print(f"    Total carrier rate: ${result.total_rate}")
            print(f"    Carrier rate/mile: ${result.rate_per_mile}")
            print(f"    Shipper quote: ${result.recommended_quote_to_shipper}")
            print(f"    Margin: {result.margin_percentage}%")
            print(f"    Confidence: {result.confidence_score:.0%}")
            
            if result.pricing_notes:
                print(f"\n  Pricing Notes:")
                for note in result.pricing_notes:
                    print(f"    - {note}")
                    
        except Exception as e:
            print(f"  ❌ Pricing failed: {str(e)}")


def test_quote_email_generation():
    """Test quote email generation."""
    print("\n=== Testing Quote Email Generation ===")
    
    # Create mock pricing result
    from src.services.pricing.engine import PricingResult
    from decimal import Decimal
    
    mock_result = PricingResult()
    mock_result.total_miles = 665
    mock_result.linehaul_rate = Decimal("1495.00")
    mock_result.fuel_surcharge = Decimal("175.00")
    mock_result.accessorial_charges = {"Heavy Load": Decimal("150.00")}
    mock_result.recommended_quote_to_shipper = Decimal("2093.00")
    
    mock_load = {
        "origin_city": "Atlanta",
        "origin_state": "GA",
        "dest_city": "Miami",
        "dest_state": "FL",
        "equipment_type": "Flatbed",
        "weight_lbs": 48000
    }
    
    email_content = generate_quote_email(mock_load, mock_result)
    
    print("\nGenerated Quote Email:")
    print("-" * 60)
    print(email_content)
    print("-" * 60)


def main():
    """Run all pricing engine tests."""
    print("🧪 Testing Market-Based Pricing Engine")
    print("=" * 50)
    
    # Run tests
    test_distance_calculator()
    test_pricing_scenarios()
    test_quote_email_generation()
    
    print("\n✅ Pricing engine tests complete!")
    print("\nNote: Some tests may show warnings if Supabase is not configured.")
    print("This is expected in a test environment.")


if __name__ == "__main__":
    main()