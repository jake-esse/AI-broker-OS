#!/usr/bin/env python3
"""
Update Imports Script

This script updates all Python imports to match the new project structure.
It handles both absolute and relative imports safely.

USAGE:
    python scripts/update_imports.py [--dry-run]
"""

import os
import re
import argparse
from pathlib import Path
from typing import List, Tuple, Dict

class ImportUpdater:
    def __init__(self, root_path: Path, dry_run: bool = False):
        self.root = root_path
        self.dry_run = dry_run
        
        # Map old imports to new imports
        self.import_mappings = {
            # Agent imports
            "from src.agents.intake.graph import": "from src.agents.intake.graph import",
            "import src.agents.intake.graph": "import src.agents.intake.graph",
            "from src.agents.loadblast.graph import": "from src.agents.loadblast.graph import",
            "import src.agents.loadblast.graph": "import src.agents.loadblast.graph",
            "from src.agents.quotecollector.graph import": "from src.agents.quotecollector.graph import",
            "import src.agents.quotecollector.graph": "import src.agents.quotecollector.graph",
            "from src.agents.unified.intake import": "from src.agents.unified.intake import",
            "import src.agents.unified.intake": "import src.agents.unified.intake",
            "from src.agents.intake.pdf_processor import": "from src.agents.intake.pdf_processor import",
            "import src.agents.intake.pdf_processor": "import src.agents.intake.pdf_processor",
            "from src.agents.intake.missing_info_handler import": "from src.agents.intake.missing_info_handler import",
            
            # Service imports
            "from src.services.email.oauth import": "from src.services.email.oauth import",
            "import src.services.email.oauth": "import src.services.email.oauth",
            "from src.services.email.intake import": "from src.services.email.intake import",
            "import src.services.email.intake": "import src.services.email.intake",
            "from src.services.email.imap import": "from src.services.email.imap import",
            "import src.services.email.imap": "import src.services.email.imap",
            "from src.services.email.classifier import": "from src.services.email.classifier import",
            "import src.services.email.classifier": "import src.services.email.classifier",
            "from src.services.pricing.engine import": "from src.services.pricing.engine import",
            "import src.services.pricing.engine": "import src.services.pricing.engine",
            "from src.services.pricing.quote_generator import": "from src.services.pricing.quote_generator import",
            "import src.services.pricing.quote_generator": "import src.services.pricing.quote_generator",
            
            # UI imports
            "from src.ui.dashboard.app import": "from src.ui.dashboard.app import",
            "import src.ui.dashboard.app": "import src.ui.dashboard.app",
        }
        
        # File reference mappings for strings and comments
        self.file_ref_mappings = {
            "src/agents/intake/graph.py": "src/agents/intake/graph.py",
            "src/agents/loadblast/graph.py": "src/agents/loadblast/graph.py",
            "src/agents/quotecollector/graph.py": "src/agents/quotecollector/graph.py",
            "src/agents/unified/intake.py": "src/agents/unified/intake.py",
            "src/services/email/oauth.py": "src/services/email/oauth.py",
            "src/services/email/intake.py": "src/services/email/intake.py",
            "src/services/pricing/engine.py": "src/services/pricing/engine.py",
        }
        
    def find_python_files(self) -> List[Path]:
        """Find all Python files in the project"""
        python_files = []
        
        # Directories to search
        search_dirs = ["src", "tests", "examples", "scripts"]
        
        for dir_name in search_dirs:
            dir_path = self.root / dir_name
            if dir_path.exists():
                for file_path in dir_path.rglob("*.py"):
                    if not file_path.name.startswith("__pycache__"):
                        python_files.append(file_path)
                        
        return python_files
        
    def update_file_imports(self, file_path: Path) -> Tuple[bool, List[str]]:
        """Update imports in a single file"""
        try:
            content = file_path.read_text()
            original_content = content
            changes = []
            
            # Update import statements
            for old_import, new_import in self.import_mappings.items():
                if old_import in content:
                    content = content.replace(old_import, new_import)
                    changes.append(f"  Updated: {old_import} → {new_import}")
            
            # Update file references in strings and comments
            for old_ref, new_ref in self.file_ref_mappings.items():
                # In strings
                old_string = f'"{old_ref}"'
                new_string = f'"{new_ref}"'
                if old_string in content:
                    content = content.replace(old_string, new_string)
                    changes.append(f"  Updated string: {old_string} → {new_string}")
                    
                old_string = f"'{old_ref}'"
                new_string = f"'{new_ref}'"
                if old_string in content:
                    content = content.replace(old_string, new_string)
                    changes.append(f"  Updated string: {old_string} → {new_string}")
                    
                # In comments
                comment_pattern = f"# .*{re.escape(old_ref)}"
                if re.search(comment_pattern, content):
                    content = re.sub(f"\\b{re.escape(old_ref)}\\b", new_ref, content)
                    changes.append(f"  Updated comment reference: {old_ref} → {new_ref}")
            
            # Write back if changed
            if content != original_content:
                if not self.dry_run:
                    file_path.write_text(content)
                return True, changes
            
            return False, []
            
        except Exception as e:
            return False, [f"  Error: {str(e)}"]
            
    def add_init_imports(self):
        """Add convenience imports to __init__.py files"""
        init_imports = {
            "src/agents/intake/__init__.py": '''"""Intake Agent Module"""
from .graph import GState, classify, ask_more, ack, route_after_classify, create_intake_graph

__all__ = ["GState", "classify", "ask_more", "ack", "route_after_classify", "create_intake_graph"]
''',
            "src/services/email/__init__.py": '''"""Email Services Module"""
from .oauth import OAuthService
from .intake import EmailIntakeService
from .imap import IMAPEmailService
from .classifier import EmailIntentClassifier

__all__ = ["OAuthService", "EmailIntakeService", "IMAPEmailService", "EmailIntentClassifier"]
''',
            "src/services/pricing/__init__.py": '''"""Pricing Services Module"""
from .engine import PricingEngine
from .quote_generator import QuoteGenerator

__all__ = ["PricingEngine", "QuoteGenerator"]
''',
        }
        
        print("\n📦 Adding module imports to __init__.py files...")
        for init_path, content in init_imports.items():
            full_path = self.root / init_path
            if full_path.exists() and not self.dry_run:
                full_path.write_text(content)
                print(f"  ✓ {init_path}")
                
    def run(self):
        """Run the import updater"""
        print("🔄 Updating Python imports...")
        print(f"   Mode: {'DRY RUN' if self.dry_run else 'ACTUAL'}")
        print("=" * 50)
        
        # Find all Python files
        python_files = self.find_python_files()
        print(f"\n📁 Found {len(python_files)} Python files")
        
        # Update imports
        total_updated = 0
        for file_path in python_files:
            relative_path = file_path.relative_to(self.root)
            updated, changes = self.update_file_imports(file_path)
            
            if updated:
                total_updated += 1
                print(f"\n✓ {relative_path}")
                for change in changes:
                    print(change)
                    
        # Add init imports
        if not self.dry_run:
            self.add_init_imports()
        
        print(f"\n✅ Updated {total_updated} files")
        if self.dry_run:
            print("\n⚠️  This was a dry run. Use without --dry-run to make changes.")

def main():
    parser = argparse.ArgumentParser(description="Update imports for new project structure")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    args = parser.parse_args()
    
    root_path = Path(__file__).parent.parent
    updater = ImportUpdater(root_path, args.dry_run)
    updater.run()

if __name__ == "__main__":
    main()