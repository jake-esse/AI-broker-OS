#!/usr/bin/env python3
"""
Project Reorganization Script

This script helps migrate the AI-Broker codebase to a more organized structure
that's optimized for both human developers and AI coding agents.

USAGE:
    python scripts/reorganize_project.py [--dry-run] [--phase PHASE]

OPTIONS:
    --dry-run: Show what would be done without making changes
    --phase: Run specific phase (1=structure, 2=docs, 3=agents, 4=services, 5=tests)
"""

import os
import shutil
import argparse
from pathlib import Path
from typing import List, Tuple

class ProjectReorganizer:
    def __init__(self, root_path: Path, dry_run: bool = False):
        self.root = root_path
        self.dry_run = dry_run
        self.moves = []
        
    def create_directory_structure(self):
        """Create new directory structure"""
        directories = [
            # Source directories
            "src/agents/intake",
            "src/agents/loadblast", 
            "src/agents/quotecollector",
            "src/agents/unified",
            "src/services/email",
            "src/services/pricing",
            "src/services/database",
            "src/core/models",
            "src/ui/dashboard/components",
            "src/utils",
            
            # Test directories
            "tests/unit/agents",
            "tests/unit/services",
            "tests/unit/core",
            "tests/integration",
            "tests/fixtures/emails",
            "tests/fixtures/data",
            
            # Documentation
            "docs/architecture",
            "docs/business",
            "docs/development",
            "docs/api",
            
            # Other directories
            "scripts/setup",
            "scripts/maintenance",
            "config",
            "data/logs",
            "data/temp",
        ]
        
        print("📁 Creating directory structure...")
        for dir_path in directories:
            full_path = self.root / dir_path
            if not self.dry_run:
                full_path.mkdir(parents=True, exist_ok=True)
            print(f"  ✓ {dir_path}")
            
        # Create __init__.py files
        self._create_init_files()
        
    def _create_init_files(self):
        """Create __init__.py files in Python packages"""
        python_dirs = [
            "src",
            "src/agents", "src/agents/intake", "src/agents/loadblast",
            "src/agents/quotecollector", "src/agents/unified",
            "src/services", "src/services/email", "src/services/pricing",
            "src/services/database", "src/core", "src/core/models",
            "src/ui", "src/ui/dashboard", "src/utils",
            "tests", "tests/unit", "tests/integration",
            "config"
        ]
        
        for dir_path in python_dirs:
            init_file = self.root / dir_path / "__init__.py"
            if not self.dry_run and not init_file.exists():
                init_file.write_text("")
                
    def move_documentation(self):
        """Move documentation files to organized structure"""
        doc_moves = [
            ("ARCHITECTURE.md", "docs/architecture/ARCHITECTURE.md"),
            ("DATABASE_SETUP.md", "docs/architecture/DATABASE_SCHEMA.md"),
            ("PRD.md", "docs/business/PRD.md"),
            ("FREIGHT_BROKERAGE.md", "docs/business/FREIGHT_BROKERAGE.md"),
            ("CLAUDE.md", "docs/development/CLAUDE.md"),
            ("DEV_PLAN.md", "docs/development/DEV_PLAN.md"),
            ("PROJECT_STRUCTURE.md", "docs/development/PROJECT_STRUCTURE.md"),
            ("supabase_email_security.md", "docs/architecture/EMAIL_SECURITY.md"),
        ]
        
        print("\n📚 Moving documentation files...")
        self._perform_moves(doc_moves)
        
    def move_agent_files(self):
        """Move agent-related files"""
        agent_moves = [
            ("src/agents/intake/graph.py", "src/agents/intake/graph.py"),
            ("src/agents/loadblast/graph.py", "src/agents/loadblast/graph.py"),
            ("src/agents/quotecollector/graph.py", "src/agents/quotecollector/graph.py"),
            ("src/agents/unified/intake.py", "src/agents/unified/intake.py"),
            ("pdf_intake_agent.py", "src/agents/intake/pdf_processor.py"),
            ("handle_missing_info_response.py", "src/agents/intake/missing_info_handler.py"),
        ]
        
        print("\n🤖 Moving agent files...")
        self._perform_moves(agent_moves)
        
    def move_service_files(self):
        """Move service-related files"""
        service_moves = [
            ("src/services/email/oauth.py", "src/services/email/oauth.py"),
            ("src/services/email/intake.py", "src/services/email/intake.py"),
            ("imap_email_service.py", "src/services/email/imap.py"),
            ("email_intent_classifier.py", "src/services/email/classifier.py"),
            ("src/services/pricing/engine.py", "src/services/pricing/engine.py"),
            ("quote_generator.py", "src/services/pricing/quote_generator.py"),
        ]
        
        print("\n⚙️  Moving service files...")
        self._perform_moves(service_moves)
        
    def move_test_files(self):
        """Move test files to organized structure"""
        test_moves = [
            # Integration tests
            ("test_edge_function.py", "tests/integration/test_edge_function.py"),
            ("test_email_integration.py", "tests/integration/test_email_integration.py"),
            ("test_email_processing_flow.py", "tests/integration/test_email_processing_flow.py"),
            ("test_intent_classifier.py", "tests/integration/test_intent_classifier.py"),
            ("test_missing_info_workflow.py", "tests/integration/test_missing_info_workflow.py"),
            ("test_oauth_config.py", "tests/integration/test_oauth_config.py"),
            ("test_oauth_integration.py", "tests/integration/test_oauth_integration.py"),
            ("test_simple_workflow.py", "tests/integration/test_simple_workflow.py"),
            ("test_unified_simple.py", "tests/integration/test_unified_simple.py"),
            
            # Test fixtures
            ("sample.eml", "tests/fixtures/emails/sample.eml"),
            ("sample_incomplete.eml", "tests/fixtures/emails/sample_incomplete.eml"),
            ("test_partial_load.eml", "tests/fixtures/emails/test_partial_load.eml"),
        ]
        
        # Demo files to examples
        demo_moves = [
            ("demo_missing_info_workflow.py", "examples/demo_missing_info_workflow.py"),
            ("demo_pdf_intake.py", "examples/demo_pdf_intake.py"),
        ]
        
        print("\n🧪 Moving test files...")
        self._perform_moves(test_moves)
        
        print("\n📋 Moving example files...")
        if not self.dry_run:
            (self.root / "examples").mkdir(exist_ok=True)
        self._perform_moves(demo_moves)
        
    def move_ui_files(self):
        """Move UI-related files"""
        ui_moves = [
            ("broker_dashboard.py", "src/ui/dashboard/app.py"),
        ]
        
        print("\n🖥️  Moving UI files...")
        self._perform_moves(ui_moves)
        
    def _perform_moves(self, moves: List[Tuple[str, str]]):
        """Perform file moves"""
        for src, dst in moves:
            src_path = self.root / src
            dst_path = self.root / dst
            
            if src_path.exists():
                if not self.dry_run:
                    dst_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(src_path), str(dst_path))
                print(f"  ✓ {src} → {dst}")
            else:
                print(f"  ⚠️  {src} not found")
                
    def create_config_files(self):
        """Create configuration files"""
        print("\n⚙️  Creating configuration files...")
        
        # Create settings.py
        settings_content = '''"""
AI-Broker Configuration Settings

This module contains all configuration settings for the AI-Broker application.
Settings can be overridden by environment variables.
"""

import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
LOGS_DIR = DATA_DIR / "logs"
TEMP_DIR = DATA_DIR / "temp"

# Ensure directories exist
LOGS_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# OAuth Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
MICROSOFT_CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID")
MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET")

# Model Configuration
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
CONFIDENCE_THRESHOLD_HIGH = 0.85
CONFIDENCE_THRESHOLD_LOW = 0.60

# Business Rules
REQUIRED_LOAD_FIELDS = ["origin_zip", "dest_zip", "pickup_dt", "equipment", "weight_lb"]
COMPLEXITY_FLAGS = ["HAZMAT", "OVERSIZE", "MULTI_STOP", "INTERMODAL", "LTL", "PARTIAL", "FLATBED"]
'''
        
        if not self.dry_run:
            (self.root / "config" / "settings.py").write_text(settings_content)
        print("  ✓ config/settings.py")
        
        # Create .env.example
        env_example = '''# AI-Broker Environment Variables Template
# Copy this to .env and fill in your values

# AI API Keys
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Email Service
RESEND_API_KEY=your_resend_api_key_here

# OAuth Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# Optional Configuration
LLM_MODEL=gpt-4o-mini
OAUTH_REDIRECT_URI=http://localhost:8501/auth/callback
'''
        
        if not self.dry_run:
            (self.root / ".env.example").write_text(env_example)
        print("  ✓ .env.example")
        
    def create_readme_files(self):
        """Create README files for major directories"""
        readmes = {
            "src/agents/README.md": "# AI-Broker Agents\n\nThis directory contains all LangGraph agents.",
            "src/services/README.md": "# AI-Broker Services\n\nShared services used across agents.",
            "src/core/README.md": "# Core Business Logic\n\nDomain models and business rules.",
            "docs/README.md": "# AI-Broker Documentation\n\nComprehensive project documentation.",
            "tests/README.md": "# AI-Broker Tests\n\nUnit and integration tests.",
        }
        
        print("\n📝 Creating README files...")
        for path, content in readmes.items():
            if not self.dry_run:
                (self.root / path).write_text(content)
            print(f"  ✓ {path}")
            
    def update_gitignore(self):
        """Update .gitignore for new structure"""
        gitignore_additions = """
# Data directories
data/logs/
data/temp/

# Python cache
**/__pycache__/
*.pyc
*.pyo

# Environment
.env
.env.local

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Database
*.sqlite
*.db
"""
        
        print("\n📄 Updating .gitignore...")
        if not self.dry_run:
            gitignore_path = self.root / ".gitignore"
            current_content = gitignore_path.read_text() if gitignore_path.exists() else ""
            if "data/logs/" not in current_content:
                with open(gitignore_path, "a") as f:
                    f.write(gitignore_additions)
        print("  ✓ .gitignore updated")

def main():
    parser = argparse.ArgumentParser(description="Reorganize AI-Broker project structure")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    parser.add_argument("--phase", type=int, help="Run specific phase (1-5)")
    args = parser.parse_args()
    
    root_path = Path(__file__).parent.parent
    reorganizer = ProjectReorganizer(root_path, args.dry_run)
    
    phases = {
        1: reorganizer.create_directory_structure,
        2: reorganizer.move_documentation,
        3: reorganizer.move_agent_files,
        4: reorganizer.move_service_files,
        5: reorganizer.move_test_files,
        6: reorganizer.move_ui_files,
        7: reorganizer.create_config_files,
        8: reorganizer.create_readme_files,
        9: reorganizer.update_gitignore,
    }
    
    if args.phase:
        if args.phase in phases:
            phases[args.phase]()
        else:
            print(f"Invalid phase: {args.phase}")
    else:
        # Run all phases
        print("🚀 Starting AI-Broker Project Reorganization")
        print(f"   Root: {root_path}")
        print(f"   Mode: {'DRY RUN' if args.dry_run else 'ACTUAL'}")
        print("=" * 50)
        
        for phase_num, phase_func in phases.items():
            phase_func()
            
        print("\n✅ Reorganization complete!")
        if args.dry_run:
            print("\n⚠️  This was a dry run. Use without --dry-run to make changes.")
        else:
            print("\n📌 Next steps:")
            print("  1. Update all imports in Python files")
            print("  2. Update documentation with new paths")
            print("  3. Test that everything still works")
            print("  4. Commit the reorganization")

if __name__ == "__main__":
    main()