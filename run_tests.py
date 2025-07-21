#!/usr/bin/env python3
"""
Test Runner Script

This script runs all tests with the correct PYTHONPATH configuration
for the new project structure.

USAGE:
    python run_tests.py [specific_test_file]
"""

import os
import sys
import subprocess
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root))

def run_tests(specific_test=None):
    """Run tests with correct environment"""
    env = os.environ.copy()
    env['PYTHONPATH'] = str(project_root)
    
    if specific_test:
        # Run specific test
        cmd = ["python", "-m", "pytest", specific_test, "-v"]
    else:
        # Run all tests
        cmd = ["python", "-m", "pytest", "tests/", "-v"]
    
    print(f"Running command: {' '.join(cmd)}")
    print(f"PYTHONPATH: {env['PYTHONPATH']}")
    print("=" * 70)
    
    result = subprocess.run(cmd, env=env)
    return result.returncode

if __name__ == "__main__":
    specific_test = sys.argv[1] if len(sys.argv) > 1 else None
    exit_code = run_tests(specific_test)
    sys.exit(exit_code)