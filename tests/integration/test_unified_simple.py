#!/usr/bin/env python3
"""
Simple test for unified intake agent debugging
"""

from src.agents.unified.intake import (
    UniversalInput, 
    InputSourceType, 
    classify_email_content,
    IntakeDecisionFramework
)
from src.services.email.classifier import EmailIntent
from datetime import datetime

def test_components():
    print("🧪 Testing Unified Intake Components")
    print("=" * 50)
    
    # Test 1: Universal Input Creation
    print("\n1. Testing Universal Input...")
    universal_input = UniversalInput(
        source_type=InputSourceType.EMAIL,
        source_metadata={
            "sender": "shipping@acmecorp.com",
            "subject": "Load Available: Dallas to Miami - Urgent",
            "date": datetime.now().isoformat()
        },
        content="""
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
        """,
        attachments=[]
    )
    
    print(f"✅ Universal Input created: {universal_input.source_type.value}")
    print(f"   Processing ID: {universal_input.processing_id}")
    
    # Test 2: Intent Classification
    print("\n2. Testing Intent Classification...")
    subject = universal_input.source_metadata["subject"]
    content = universal_input.content
    sender = universal_input.source_metadata["sender"]
    
    intent_result = classify_email_content(subject, content, sender)
    print(f"✅ Intent: {intent_result.intent.value} (confidence: {intent_result.confidence:.2f})")
    
    # Test 3: Decision Framework
    print("\n3. Testing Decision Framework...")
    framework = IntakeDecisionFramework()
    decision = framework.make_processing_decision(universal_input, intent_result)
    
    print(f"✅ Decision: {decision.decision_type.value}")
    print(f"   Target: {decision.target_agent}")
    print(f"   Reasoning: {decision.reasoning}")
    
    print("\n🎉 All components working correctly!")

if __name__ == "__main__":
    test_components()