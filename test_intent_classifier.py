#!/usr/bin/env python3
"""
Test script for email intent classifier
"""

from email_intent_classifier import classify_email_content, should_process_for_load_intake

# Test cases
test_emails = [
    {
        "name": "Load Tender Email",
        "subject": "Load Available: Dallas to Miami - Urgent",
        "body": """
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
        "sender": "shipping@acmecorp.com"
    },
    {
        "name": "Quote Response Email",
        "subject": "Re: Load #123 - Our Quote",
        "body": """
        Hi dispatch,
        
        I can cover your load #123 from San Antonio to Miami for $2.75 per mile.
        I can pickup on Monday 7/22 and deliver by Wednesday 7/24.
        
        Let me know if this works.
        
        Thanks,
        Mike - Express Carriers Inc
        """,
        "sender": "ops@expresscarriers.com"
    },
    {
        "name": "Spam Email",
        "subject": "🚛 SPECIAL FINANCING OFFERS FOR TRUCKERS! 💰",
        "body": """
        AMAZING TRUCK FINANCING DEALS!
        
        Get pre-approved for truck loans with rates as low as 3.99%!
        
        Click here to apply now and get $1000 cash back!
        
        Unsubscribe | Privacy Policy
        """,
        "sender": "offers@truckfinance.com"
    }
]

def test_classifier():
    print("🧪 Testing Email Intent Classifier")
    print("=" * 60)
    
    for i, test_case in enumerate(test_emails, 1):
        print(f"\n📧 Test {i}: {test_case['name']}")
        print("-" * 40)
        
        # Classify the email
        result = classify_email_content(
            subject=test_case['subject'],
            body=test_case['body'],
            sender_email=test_case['sender']
        )
        
        # Display results
        print(f"Subject: {test_case['subject']}")
        print(f"Intent: {result.intent.value}")
        print(f"Confidence: {result.confidence:.2f}")
        print(f"Reasoning: {result.reasoning}")
        
        # Processing recommendation
        if should_process_for_load_intake(result):
            print("✅ Action: Process for load intake")
        elif result.confidence < 0.6:
            print("⚠️ Action: Requires human review")
        else:
            print(f"🔄 Action: Route to {result.intent.value} handler")

if __name__ == "__main__":
    test_classifier()