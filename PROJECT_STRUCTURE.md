# AI-Broker Project Structure Best Practices

## Overview

This document outlines the recommended directory structure for the AI-Broker project, optimized for both human developers and AI coding agents.

## Key Principles for AI-Friendly Organization

1. **Clear Hierarchy**: Logical grouping makes it easier for AI to understand relationships
2. **Descriptive Names**: Self-documenting folder and file names reduce context requirements
3. **Consistent Patterns**: Predictable structure helps AI navigate efficiently
4. **Documentation Proximity**: Keep docs near related code for better context
5. **Separation of Concerns**: Clear boundaries between different system components
6. **Test Organization**: Tests mirror source structure for easy discovery

## Recommended Structure

```
ai-broker-os/
│
├── README.md                    # Project overview and quick start
├── .env.example                 # Template for environment variables
├── .gitignore                   # Git ignore rules
├── requirements.txt             # Python dependencies
├── docker-compose.yml           # Container orchestration (future)
│
├── docs/                        # All documentation
│   ├── README.md               # Documentation index
│   ├── architecture/           # System design docs
│   │   ├── ARCHITECTURE.md     # Technical architecture
│   │   ├── DATABASE_SCHEMA.md  # Database design
│   │   └── SYSTEM_FLOW.md      # Process flows
│   ├── business/               # Business context
│   │   ├── FREIGHT_BROKERAGE.md
│   │   ├── PRD.md             # Product requirements
│   │   └── ROADMAP.md         # Development roadmap
│   ├── development/            # Dev guides
│   │   ├── CLAUDE.md          # AI agent instructions
│   │   ├── DEV_PLAN.md        # Development timeline
│   │   ├── SETUP.md           # Setup instructions
│   │   └── CONTRIBUTING.md    # Contribution guidelines
│   └── api/                    # API documentation
│       └── ENDPOINTS.md        # API reference
│
├── src/                        # Main source code
│   ├── __init__.py
│   ├── agents/                 # LangGraph agents
│   │   ├── __init__.py
│   │   ├── intake/            # Intake agent components
│   │   │   ├── __init__.py
│   │   │   ├── graph.py       # Main intake graph
│   │   │   ├── nodes.py       # Node implementations
│   │   │   └── utils.py       # Helper functions
│   │   ├── loadblast/         # LoadBlast agent
│   │   │   ├── __init__.py
│   │   │   ├── graph.py
│   │   │   └── carrier_matcher.py
│   │   ├── quotecollector/    # Quote collection agent
│   │   │   ├── __init__.py
│   │   │   ├── graph.py
│   │   │   └── quote_parser.py
│   │   └── unified/           # Unified intake system
│   │       ├── __init__.py
│   │       └── intake.py
│   │
│   ├── services/              # Shared services
│   │   ├── __init__.py
│   │   ├── email/            # Email services
│   │   │   ├── __init__.py
│   │   │   ├── oauth.py      # OAuth management
│   │   │   ├── intake.py     # Email intake service
│   │   │   ├── imap.py       # IMAP polling
│   │   │   └── classifier.py # Intent classification
│   │   ├── pricing/          # Pricing services
│   │   │   ├── __init__.py
│   │   │   ├── engine.py
│   │   │   └── market_data.py
│   │   └── database/         # Database services
│   │       ├── __init__.py
│   │       ├── client.py     # Supabase client
│   │       └── models.py     # Data models
│   │
│   ├── core/                 # Core business logic
│   │   ├── __init__.py
│   │   ├── models/          # Domain models
│   │   │   ├── __init__.py
│   │   │   ├── load.py
│   │   │   ├── quote.py
│   │   │   └── carrier.py
│   │   └── constants.py     # Business constants
│   │
│   ├── ui/                  # User interfaces
│   │   ├── __init__.py
│   │   └── dashboard/       # Broker dashboard
│   │       ├── __init__.py
│   │       ├── app.py       # Streamlit app
│   │       └── components/  # UI components
│   │
│   └── utils/               # Shared utilities
│       ├── __init__.py
│       ├── complexity.py    # Freight complexity detection
│       └── validators.py    # Data validation
│
├── tests/                   # All tests
│   ├── __init__.py
│   ├── unit/               # Unit tests (mirrors src/)
│   │   ├── agents/
│   │   ├── services/
│   │   └── core/
│   ├── integration/        # Integration tests
│   │   ├── test_email_flow.py
│   │   └── test_quote_flow.py
│   ├── fixtures/           # Test data
│   │   ├── emails/        # Sample .eml files
│   │   └── data/          # Test datasets
│   └── conftest.py        # Pytest configuration
│
├── supabase/              # Supabase specific files
│   ├── functions/         # Edge Functions
│   ├── migrations/        # Database migrations
│   └── seed/             # Seed data
│
├── scripts/              # Utility scripts
│   ├── setup/           # Setup scripts
│   │   ├── create_database.py
│   │   └── configure_oauth.py
│   └── maintenance/     # Maintenance scripts
│       └── cleanup_logs.py
│
├── config/              # Configuration files
│   ├── __init__.py
│   ├── settings.py     # App settings
│   └── logging.py      # Logging config
│
└── data/               # Local data (git-ignored)
    ├── logs/          # Application logs
    └── temp/          # Temporary files
```

## Migration Plan

### Phase 1: Create New Structure (Immediate)
```bash
# Create new directory structure
mkdir -p src/{agents,services,core,ui,utils}
mkdir -p src/agents/{intake,loadblast,quotecollector,unified}
mkdir -p src/services/{email,pricing,database}
mkdir -p src/core/models
mkdir -p src/ui/dashboard/components
mkdir -p tests/{unit,integration,fixtures}
mkdir -p tests/fixtures/{emails,data}
mkdir -p docs/{architecture,business,development,api}
mkdir -p scripts/{setup,maintenance}
mkdir -p config
mkdir -p data/{logs,temp}
```

### Phase 2: Move Files (Systematic)

1. **Documentation Files**:
   - Move `docs/architecture/ARCHITECTURE.md` → `docs/architecture/`
   - Move `docs/business/PRD.md`, `docs/business/FREIGHT_BROKERAGE.md` → `docs/business/`
   - Move `docs/development/CLAUDE.md`, `docs/development/DEV_PLAN.md` → `docs/development/`

2. **Agent Files**:
   - Move `src/agents/intake/graph.py` → `src/agents/intake/graph.py`
   - Move `src/agents/loadblast/graph.py` → `src/agents/loadblast/graph.py`
   - Move `src/agents/quotecollector/graph.py` → `src/agents/quotecollector/graph.py`

3. **Service Files**:
   - Move `src/services/email/oauth.py` → `src/services/email/oauth.py`
   - Move `src/services/email/intake.py` → `src/services/email/intake.py`
   - Move `src/services/pricing/engine.py` → `src/services/pricing/engine.py`

4. **Test Files**:
   - Move `test_*.py` → `tests/integration/`
   - Move `*.eml` → `tests/fixtures/emails/`

### Phase 3: Update Imports

All imports need to be updated to reflect new structure:
```python
# Old
from intake_graph import GState, classify

# New
from src.agents.intake.graph import GState, classify
```

## Benefits for AI Agents

1. **Predictable Navigation**: AI can infer file locations from component names
2. **Clear Context Boundaries**: Each directory has a specific purpose
3. **Reduced Ambiguity**: No confusion about where code belongs
4. **Better Search Results**: Organized structure improves grep/search efficiency
5. **Explicit Dependencies**: Clear module boundaries show relationships

## Benefits for Human Developers

1. **Onboarding Speed**: New developers understand structure immediately
2. **Maintenance Ease**: Clear where to make changes
3. **Testing Clarity**: Tests mirror source structure
4. **Documentation Discovery**: Docs are logically organized
5. **Scalability**: Structure supports growth without reorganization

## Implementation Notes

1. **Gradual Migration**: Can be done incrementally without breaking functionality
2. **Import Management**: Use relative imports within modules
3. **Path Configuration**: Update `PYTHONPATH` or use proper package installation
4. **CI/CD Updates**: Update any hardcoded paths in deployment scripts
5. **Documentation Updates**: Update all path references in documentation

## AI Agent Instructions

When working with this structure:
1. Always check the appropriate directory before creating new files
2. Follow the established patterns for new components
3. Keep related code together in the same module
4. Update imports when moving files
5. Maintain symmetry between source and test structures