#!/bin/bash

# Test freight validation with GPT-4o model for comparison

echo "🧪 Testing Freight Validation with GPT-4o Model"
echo "============================================="
echo ""

# Set the model to gpt-4o for extraction
export EXTRACTION_LLM_MODEL="gpt-4o"

echo "Model set to: $EXTRACTION_LLM_MODEL"
echo ""

# Run the validation extraction tests
echo "Running validation tests..."
npx tsx scripts/test-validation-extraction.ts