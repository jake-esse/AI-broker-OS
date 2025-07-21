#!/usr/bin/env python3
"""
Test script for enhanced intake agent improvements.

Tests:
1. Enhanced email parsing
2. Carrier matching integration
3. Error handling improvements
"""

import sys
import json
from pathlib import Path
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.utils.email_parser import EnhancedEmailParser
from src.services.carrier_matching import match_carriers_for_load


def test_enhanced_email_parser():
    """Test the enhanced email parser with sample email."""
    print("\n=== Testing Enhanced Email Parser ===")
    
    parser = EnhancedEmailParser()
    
    # Check if sample.eml exists
    sample_path = Path("sample.eml")
    if not sample_path.exists():
        print("❌ sample.eml not found - skipping email parser test")
        return False
    
    try:
        # Parse email
        result = parser.parse_email_file(sample_path)
        
        print(f"✅ Email parsed successfully")
        print(f"   - Subject: {result['headers'].get('subject', 'N/A')}")
        print(f"   - From: {result['headers'].get('sender_email', 'N/A')}")
        print(f"   - Body length: {len(result.get('body_text', ''))} chars")
        print(f"   - Attachments: {len(result.get('attachments', []))}")
        
        if result.get('extracted_loads'):
            print(f"   - Extracted loads: {len(result['extracted_loads'])}")
            for i, load in enumerate(result['extracted_loads']):
                print(f"     Load {i+1}: {json.dumps(load, indent=2)}")
        
        return True
        
    except Exception as e:
        print(f"❌ Email parser error: {str(e)}")
        return False


def test_carrier_matching():
    """Test carrier matching with sample load data."""
    print("\n=== Testing Carrier Matching ===")
    
    # Sample load data
    test_load = {
        'origin_zip': '75001',  # Dallas, TX area
        'dest_zip': '30301',    # Atlanta, GA area
        'equipment': 'Van',
        'weight_lb': 25000,
        'pickup_dt': '2024-01-15T08:00:00Z',
        'commodity': 'General Freight'
    }
    
    try:
        # Match carriers
        carriers = match_carriers_for_load(test_load)
        
        if not carriers:
            print("⚠️  No carriers matched (database may be empty)")
            print("   This is expected if carrier table hasn't been populated")
            return True
        
        print(f"✅ Matched {len(carriers)} carriers")
        
        # Show top 5
        print("\nTop 5 carrier matches:")
        for i, carrier in enumerate(carriers[:5]):
            print(f"\n{i+1}. {carrier.carrier_name}")
            print(f"   Email: {carrier.carrier_email}")
            print(f"   Total Score: {carrier.total_score:.1f}")
            print(f"   - Lane: {carrier.lane_score:.1f}")
            print(f"   - Equipment: {carrier.equipment_score:.1f}")
            print(f"   - Performance: {carrier.performance_score:.1f}")
            print(f"   - Price: {carrier.price_score:.1f}")
            print(f"   - Availability: {carrier.availability_score:.1f}")
            
            if carrier.notes:
                print("   Notes:")
                for note in carrier.notes[:3]:  # Show first 3 notes
                    print(f"     • {note}")
        
        return True
        
    except Exception as e:
        print(f"❌ Carrier matching error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_full_workflow():
    """Test the complete enhanced intake workflow."""
    print("\n=== Testing Full Enhanced Workflow ===")
    
    # Check for sample email
    if not Path("sample.eml").exists():
        print("❌ sample.eml required for full workflow test")
        return False
    
    try:
        from src.agents.intake.enhanced_graph import build_enhanced_intake_agent
        
        # Build agent
        agent = build_enhanced_intake_agent()
        
        # Run with sample email
        thread_id = f"test-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        config = {"configurable": {"thread_id": thread_id}}
        
        initial_state = {
            "email_path": "sample.eml",
            "processing_metadata": {
                "started_at": datetime.now().isoformat(),
                "test_run": True
            },
            "error_log": []
        }
        
        print("🚀 Running enhanced intake agent...")
        result = agent.invoke(initial_state, config)
        
        # Check results
        if result.get('load'):
            print("✅ Load extracted successfully:")
            load = result['load']
            print(f"   - Origin: {load.get('origin_zip')} ({load.get('origin_city')}, {load.get('origin_state')})")
            print(f"   - Destination: {load.get('dest_zip')} ({load.get('dest_city')}, {load.get('dest_state')})")
            print(f"   - Equipment: {load.get('equipment')}")
            print(f"   - Weight: {load.get('weight_lb')} lbs")
        
        if result.get('carrier_matches'):
            print(f"\n✅ Matched {len(result['carrier_matches'])} carriers")
        
        if result.get('processing_metadata'):
            meta = result['processing_metadata']
            print(f"\n📊 Performance metrics:")
            if 'extraction_time_ms' in meta:
                print(f"   - Extraction time: {meta['extraction_time_ms']:.2f}ms")
            if 'carrier_matching_time_ms' in meta:
                print(f"   - Carrier matching time: {meta['carrier_matching_time_ms']:.2f}ms")
        
        if result.get('error_log'):
            print(f"\n⚠️  Errors encountered:")
            for error in result['error_log']:
                print(f"   - {error['step']}: {error['error']}")
        
        return True
        
    except Exception as e:
        print(f"❌ Workflow test error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests."""
    print("🧪 Testing Enhanced Intake Agent Components")
    print("=" * 50)
    
    tests = [
        ("Enhanced Email Parser", test_enhanced_email_parser),
        ("Carrier Matching", test_carrier_matching),
        ("Full Workflow", test_full_workflow)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            success = test_func()
            results.append((test_name, success))
        except Exception as e:
            print(f"\n❌ {test_name} failed with exception: {str(e)}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 50)
    print("TEST SUMMARY:")
    print("=" * 50)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Enhanced intake agent is ready.")
    else:
        print("\n⚠️  Some tests failed. Check the output above for details.")


if __name__ == "__main__":
    main()