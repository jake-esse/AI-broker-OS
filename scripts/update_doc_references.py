#!/usr/bin/env python3
"""
Update Documentation References Script

This script updates all file path references in documentation files
to match the new project structure.

USAGE:
    python scripts/update_doc_references.py [--dry-run]
"""

import os
import re
import argparse
from pathlib import Path
from typing import List, Tuple, Dict

class DocReferenceUpdater:
    def __init__(self, root_path: Path, dry_run: bool = False):
        self.root = root_path
        self.dry_run = dry_run
        
        # Map old paths to new paths
        self.path_mappings = {
            # Documentation files
            "ARCHITECTURE.md": "docs/architecture/ARCHITECTURE.md",
            "DATABASE_SETUP.md": "docs/architecture/DATABASE_SCHEMA.md",
            "PRD.md": "docs/business/PRD.md",
            "FREIGHT_BROKERAGE.md": "docs/business/FREIGHT_BROKERAGE.md",
            "CLAUDE.md": "docs/development/CLAUDE.md",
            "DEV_PLAN.md": "docs/development/DEV_PLAN.md",
            "PROJECT_STRUCTURE.md": "docs/development/PROJECT_STRUCTURE.md",
            
            # Agent files
            "intake_graph.py": "src/agents/intake/graph.py",
            "loadblast_graph.py": "src/agents/loadblast/graph.py",
            "quotecollector_graph.py": "src/agents/quotecollector/graph.py",
            "unified_intake_agent.py": "src/agents/unified/intake.py",
            "pdf_intake_agent.py": "src/agents/intake/pdf_processor.py",
            "handle_missing_info_response.py": "src/agents/intake/missing_info_handler.py",
            
            # Service files
            "oauth_service.py": "src/services/email/oauth.py",
            "email_intake_service.py": "src/services/email/intake.py",
            "imap_email_service.py": "src/services/email/imap.py",
            "email_intent_classifier.py": "src/services/email/classifier.py",
            "pricing_engine.py": "src/services/pricing/engine.py",
            "quote_generator.py": "src/services/pricing/quote_generator.py",
            
            # UI files
            "broker_dashboard.py": "src/ui/dashboard/app.py",
        }
        
    def find_markdown_files(self) -> List[Path]:
        """Find all markdown files in the docs directory"""
        md_files = []
        docs_dir = self.root / "docs"
        
        if docs_dir.exists():
            for file_path in docs_dir.rglob("*.md"):
                md_files.append(file_path)
                
        return md_files
        
    def update_file_references(self, file_path: Path) -> Tuple[bool, List[str]]:
        """Update file references in a single markdown file"""
        try:
            content = file_path.read_text()
            original_content = content
            changes = []
            
            # Update references in various contexts
            for old_path, new_path in self.path_mappings.items():
                # In backticks
                old_ref = f"`{old_path}`"
                new_ref = f"`{new_path}`"
                if old_ref in content:
                    content = content.replace(old_ref, new_ref)
                    changes.append(f"  Updated: {old_ref} → {new_ref}")
                
                # In bold
                old_ref = f"**{old_path}**"
                new_ref = f"**{new_path}**"
                if old_ref in content:
                    content = content.replace(old_ref, new_ref)
                    changes.append(f"  Updated: {old_ref} → {new_ref}")
                    
                # In parentheses
                old_ref = f"({old_path})"
                new_ref = f"({new_path})"
                if old_ref in content:
                    content = content.replace(old_ref, new_ref)
                    changes.append(f"  Updated: {old_ref} → {new_ref}")
                    
                # In quotes
                for quote in ['"', "'"]:
                    old_ref = f"{quote}{old_path}{quote}"
                    new_ref = f"{quote}{new_path}{quote}"
                    if old_ref in content:
                        content = content.replace(old_ref, new_ref)
                        changes.append(f"  Updated: {old_ref} → {new_ref}")
                
                # In markdown links
                old_pattern = f"\\[([^\\]]+)\\]\\({re.escape(old_path)}\\)"
                if re.search(old_pattern, content):
                    content = re.sub(old_pattern, f"[\\1]({new_path})", content)
                    changes.append(f"  Updated link: [{old_path}] → [{new_path}]")
                    
                # Command examples
                old_cmd = f"python {old_path}"
                new_cmd = f"python {new_path}"
                if old_cmd in content:
                    content = content.replace(old_cmd, new_cmd)
                    changes.append(f"  Updated command: {old_cmd} → {new_cmd}")
            
            # Write back if changed
            if content != original_content:
                if not self.dry_run:
                    file_path.write_text(content)
                return True, changes
            
            return False, []
            
        except Exception as e:
            return False, [f"  Error: {str(e)}"]
            
    def update_claude_md(self):
        """Special handling for CLAUDE.md commands section"""
        claude_path = self.root / "docs" / "development" / "CLAUDE.md"
        if not claude_path.exists():
            return
            
        content = claude_path.read_text()
        original_content = content
        
        # Update the intake command
        content = re.sub(
            r"python intake_graph\.py",
            "python src/agents/intake/graph.py",
            content
        )
        
        if content != original_content and not self.dry_run:
            claude_path.write_text(content)
            print(f"✓ Updated commands in {claude_path.relative_to(self.root)}")
            
    def run(self):
        """Run the documentation reference updater"""
        print("📝 Updating Documentation References...")
        print(f"   Mode: {'DRY RUN' if self.dry_run else 'ACTUAL'}")
        print("=" * 50)
        
        # Find all markdown files
        md_files = self.find_markdown_files()
        print(f"\n📁 Found {len(md_files)} markdown files")
        
        # Update references
        total_updated = 0
        for file_path in md_files:
            relative_path = file_path.relative_to(self.root)
            updated, changes = self.update_file_references(file_path)
            
            if updated:
                total_updated += 1
                print(f"\n✓ {relative_path}")
                for change in changes:
                    print(change)
                    
        # Special handling for CLAUDE.md
        self.update_claude_md()
        
        print(f"\n✅ Updated {total_updated} files")
        if self.dry_run:
            print("\n⚠️  This was a dry run. Use without --dry-run to make changes.")

def main():
    parser = argparse.ArgumentParser(description="Update documentation references")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done")
    args = parser.parse_args()
    
    root_path = Path(__file__).parent.parent
    updater = DocReferenceUpdater(root_path, args.dry_run)
    updater.run()

if __name__ == "__main__":
    main()