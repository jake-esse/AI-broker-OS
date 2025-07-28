#!/bin/bash

# Test freight validation with GPT-o3 model
# This script sets the extraction model environment variable and runs tests

echo "🧪 Testing Freight Validation with GPT-o3 Model"
echo "============================================="
echo ""

# Set the model to o3 for extraction
export EXTRACTION_LLM_MODEL="o3"

# You can also try other model names like:
# export EXTRACTION_LLM_MODEL="o1-preview"
# export EXTRACTION_LLM_MODEL="o1-mini"
# export EXTRACTION_LLM_MODEL="gpt-4-turbo-preview"
# export EXTRACTION_LLM_MODEL="gpt-4"

echo "Model set to: $EXTRACTION_LLM_MODEL"
echo ""

# Run the validation extraction tests
echo "Running validation tests..."
npx tsx scripts/test-validation-extraction.ts