#!/usr/bin/env node

/**
 * Simple test runner for email classification
 * This version uses plain JavaScript to avoid TypeScript compilation issues
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Check for API key
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY not found');
  console.error('Please set it in ai-broker-web/.env.local');
  process.exit(1);
}

// We'll compile and run the TypeScript test
const { exec } = require('child_process');

console.log('🔧 Compiling TypeScript files...');

// First compile the TypeScript files
const compileCommand = `cd ${path.join(__dirname, '..')} && npx tsc scripts/test-email-classification.ts lib/agents/intake-llm-enhanced.ts --esModuleInterop --resolveJsonModule --skipLibCheck --moduleResolution node --module commonjs --outDir ./dist`;

exec(compileCommand, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Compilation error:', error);
    console.error(stderr);
    return;
  }

  console.log('✅ Compilation successful');
  console.log('🚀 Running tests...\n');

  // Now run the compiled JavaScript
  const runCommand = `cd ${path.join(__dirname, '..')} && node dist/scripts/test-email-classification.js`;
  
  const testProcess = exec(runCommand);

  testProcess.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  testProcess.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  testProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`\n❌ Tests failed with exit code ${code}`);
      process.exit(code);
    }
  });
});