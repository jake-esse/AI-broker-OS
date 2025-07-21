# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Running the intake agent
```bash
python src/agents/intake/graph.py path/to/email.eml
```

### Installing dependencies
```bash
pip install -r requirements.txt
```

### Environment setup
- Set `LLM_MODEL` environment variable (defaults to "gpt-4o-mini")
- Requires OpenAI API key configured
- Requires Postmark webhook configuration for incoming emails

## Architecture

This is an AI-Broker MVP focused on freight load intake processing using LangGraph. The system processes tender emails through a state-based workflow.

### Core Components

**src/agents/intake/graph.py** - Main application file containing the LangGraph workflow:
- `GState` - TypedDict defining the workflow state (raw_text, load, missing)
- `classify` - LLM node that extracts required fields from email text
- `ask_more` - Terminal node for incomplete loads (missing required fields)
- `ack` - Terminal node for complete loads (acknowledgment)
- `route_after_classify` - Conditional router determining next action

### Required Load Fields
The system expects these fields from tender emails:
- `origin_zip` - Pickup location zip code
- `dest_zip` - Delivery location zip code  
- `pickup_dt` - Pickup date/time
- `equipment` - Equipment type (Van, Flatbed, etc.)
- `weight_lb` - Weight in pounds

### State Management
- Uses SQLite checkpointing via `broker_state.sqlite`
- Each execution requires a unique `thread_id` for state persistence
- Generated as `intake-{uuid4()}` format

### Data Flow
1. Postmark webhook receives incoming email → raw text extraction
2. LLM classification → structured load data + missing field detection
3. Conditional routing → either request more info or acknowledge complete load
4. Terminal actions → placeholder print statements (production would send emails/SMS or call APIs)

### Sample Data
`sample.eml` contains a representative tender email with all required fields populated.

## Architecture Documentation Maintenance

**IMPORTANT**: This codebase includes a comprehensive `docs/architecture/ARCHITECTURE.md` file that documents the long-term vision for a multi-input, agentic freight brokerage system. This guide must be actively maintained as the codebase evolves.

### When to Update ARCHITECTURE.md

**Always update the architecture guide when:**

1. **Adding New Input Sources**: Document new adapters (SMS, voice, EDI, etc.) and their integration patterns
2. **Creating New Agents**: Add agent capabilities, decision criteria, and interaction patterns  
3. **Modifying Decision Logic**: Update confidence thresholds, routing rules, or escalation triggers
4. **Implementing Model Changes**: Document model upgrades, A/B testing results, or performance improvements
5. **Adding Human-in-the-Loop Features**: Document new escalation points or human interface changes
6. **Discovering New Best Practices**: Update implementation guidelines and development practices
7. **Performance Optimizations**: Document scaling improvements or architectural refinements

### How to Update ARCHITECTURE.md

**For each significant change:**

1. **Update Relevant Sections**: Modify existing sections to reflect current implementation
2. **Add New Patterns**: Document new architectural patterns discovered during development
3. **Update Code Examples**: Keep code snippets current with actual implementation
4. **Revise Best Practices**: Add lessons learned and new recommended approaches
5. **Update Integration Points**: Reflect changes in system boundaries and data flows

### Architecture Evolution Tracking

**Document architectural decisions by:**

- Adding decision rationale to relevant sections
- Including performance benchmarks and trade-offs
- Noting future migration paths for current implementations
- Maintaining a clear evolution path toward the long-term vision

The architecture guide serves as both current documentation and future roadmap. Keeping it updated ensures consistent development decisions and enables effective team onboarding as the system scales.

## Code Documentation Standards

**CRITICAL REQUIREMENT**: Every code file in this project MUST include comprehensive comments that serve both human developers and AI systems. This is essential for long-term maintainability and AI-assisted development.

### Comment Requirements for Every File

**1. File Header Documentation**
Every file must start with a comprehensive header that includes:
```python
# --------------------------- filename.py ----------------------------
"""
AI-Broker MVP · Component Name (Technology Stack)

OVERVIEW:
Brief description of the component's purpose and role in the system.
Explain what business problem it solves and how it fits into the larger architecture.

WORKFLOW:
Step-by-step description of the main process flow:
1. Input processing and validation
2. Core business logic execution  
3. Output generation and persistence
4. Error handling and recovery

BUSINESS LOGIC:
- Key business rules and requirements
- Decision-making criteria
- Integration points with other components
- Performance and scalability considerations

TECHNICAL ARCHITECTURE:
- Technology choices and rationale
- Design patterns and architectural decisions
- Data flow and state management
- External dependencies and integrations

DEPENDENCIES:
- Environment variables required
- External APIs and services
- Database schema requirements
- Input/output specifications
"""
```

**2. Class and Function Documentation**
Every class and function must include:
```python
class ComponentName:
    """
    Brief purpose statement with business context.
    
    BUSINESS CONTEXT:
    Explanation of why this class exists and what business value it provides.
    
    ARCHITECTURE ROLE:
    How this class fits into the overall system architecture.
    
    KEY METHODS:
    - method_name(): Brief description of purpose
    - another_method(): Brief description of purpose
    
    USAGE PATTERNS:
    Common ways this class is instantiated and used.
    """
    
    def process_data(self, input_data: dict) -> dict:
        """
        Process input data according to business rules.
        
        BUSINESS LOGIC:
        Detailed explanation of what business problem this solves,
        including edge cases and decision criteria.
        
        TECHNICAL APPROACH:
        How the function implements the business logic,
        including algorithms, data transformations, and validations.
        
        ARGS:
            input_data: Description with expected format and constraints
            
        RETURNS:
            dict: Description of return format and possible values
            
        RAISES:
            SpecificException: When and why this exception occurs
            
        INTEGRATION POINTS:
        How this function interacts with other components.
        """
```

**3. Complex Logic Sections**
Inline comments for complex business logic:
```python
# BUSINESS RULE: Only process loads with confidence > 85%
# This threshold was determined through testing and ensures
# that automated processing maintains 99%+ accuracy
if extraction_confidence > 0.85:
    # High confidence - proceed with automated processing
    # This path handles ~80% of all inputs successfully
    return self._process_automatically(load_data)
else:
    # Lower confidence requires human review
    # Escalation ensures quality while maintaining efficiency
    return self._escalate_for_review(load_data, confidence_issues)
```

**4. Integration and Architecture Comments**
Document how components integrate:
```python
# INTEGRATION POINT: This function connects to the LoadBlast agent
# After saving a load with status="NEW_RFQ", the LoadBlast agent
# will automatically pick it up for carrier outreach within 5 minutes
result = supabase.table("loads").insert(load_data).execute()

# ARCHITECTURE NOTE: Using Supabase real-time subscriptions here
# enables the broker dashboard to update immediately when new loads arrive
```

### Why These Comments Matter

**For Human Developers:**
- Faster onboarding of new team members
- Reduced debugging time and fewer misunderstandings  
- Clear business context for technical decisions
- Easier maintenance and feature additions

**For AI Systems:**
- Better code comprehension for AI-assisted development
- More accurate suggestions and code generation
- Improved debugging and error analysis
- Enhanced ability to maintain architectural consistency

**For Business Stakeholders:**
- Technical documentation that explains business value
- Clear traceability from requirements to implementation
- Easier impact analysis for business changes

### Comment Maintenance

**Always update comments when:**
- Changing business logic or algorithms
- Modifying integration points or data flows
- Adding new error handling or edge cases
- Updating dependencies or external integrations
- Refactoring code structure or patterns

**Comment Quality Standards:**
- Use clear, non-technical language for business explanations
- Include specific examples where helpful
- Explain the "why" not just the "what"
- Keep comments current with code changes
- Write for someone who has never seen the codebase before

This documentation approach ensures the codebase remains maintainable and AI-friendly as it scales and evolves.

## Freight Industry Business Context

**ESSENTIAL READING**: This codebase includes a comprehensive `docs/business/FREIGHT_BROKERAGE.md` file that documents the complete freight brokerage business process. This file is **critical for both human developers and AI systems** working on this project.

### Why This Business Context Matters

**For AI Development:**
- Provides essential business logic for making intelligent architectural decisions
- Enables AI to understand industry terminology, pain points, and automation opportunities
- Helps AI generate code that aligns with real-world freight brokerage workflows
- Guides feature prioritization based on actual business value

**For Human Developers:**
- Rapidly onboards new team members to freight industry processes
- Ensures technical solutions address genuine business problems
- Provides context for edge cases and exception handling requirements
- Explains the business rationale behind technical architecture decisions

### Key Business Process Areas Covered

1. **Complete Load Lifecycle:** From tender receipt to final payment across all freight types
2. **Freight Type Variations:** FTL, LTL, Partial, Reefer, Flatbed, Hazmat with specific workflows
3. **Industry Stakeholders:** Shippers, carriers, brokers, and their interactions
4. **Pain Points & Automation:** Manual inefficiencies and high-value automation targets
5. **Regulatory Environment:** DOT, FMCSA, state requirements affecting operations
6. **Technology Integration:** Current systems and future automation opportunities

### Using Business Context in Development

**When Writing Code:**
- Reference business processes to ensure features solve real problems
- Use industry terminology consistently throughout the codebase
- Design workflows that align with established freight practices
- Consider regulatory and compliance requirements in technical decisions

**When Making Architecture Decisions:**
- Prioritize features based on business impact and automation potential
- Design for scalability patterns that match industry growth trends
- Plan integration points with existing freight technology ecosystem
- Consider data requirements for analytics and business intelligence

**When Handling Edge Cases:**
- Understand industry-specific exceptions and special handling requirements
- Design fallback processes that align with manual broker workflows
- Ensure compliance with regulatory and safety requirements
- Maintain audit trails for business and legal purposes

### Integration with Technical Documentation

- **ARCHITECTURE.md:** Technical patterns for implementing business processes
- **FREIGHT_BROKERAGE.md:** Business context and process requirements
- **Individual agent files:** Specific implementations with business logic comments

Always consult the freight brokerage guide when developing features to ensure technical solutions create genuine business value and align with industry best practices.

## Product Requirements Document (PRD) Management

**CRITICAL REFERENCE**: This codebase includes a comprehensive `docs/business/PRD.md` file that serves as the definitive product specification for the AI-Broker MVP. This document must be actively referenced and maintained throughout development.

### When to Reference the PRD

**Always consult PRD.md when:**

1. **Starting New Features**: Verify feature requirements, user experience specifications, and technical constraints
2. **Making Architecture Decisions**: Ensure decisions align with defined non-functional requirements and scalability goals
3. **Implementing User Interface**: Reference UX requirements for chat-based interactions and navigation structure
4. **Integrating Third-Party Services**: Check specified tools (Resend, Reducto, Stripe, DocuSign, etc.) and integration patterns
5. **Defining Success Metrics**: Use defined KPIs to evaluate feature effectiveness and system performance
6. **Handling Edge Cases**: Reference risk mitigation strategies and error handling approaches
7. **Planning Development Tasks**: Use roadmap phases to prioritize work and maintain project timeline

### When to Update the PRD

**Always update PRD.md when:**

1. **Requirements Change**: User feedback or business needs modify functional requirements
2. **Technical Constraints Discovered**: Infrastructure limitations require scope or approach changes
3. **New Features Added**: Expansion beyond original MVP scope requires documentation
4. **User Experience Insights**: Usability testing reveals needed interface or workflow changes
5. **Performance Requirements Evolve**: Scale demands or user behavior changes performance needs
6. **Integration Challenges**: Third-party service limitations require alternative approaches
7. **Success Metrics Validation**: Early results suggest different KPIs would better measure success
8. **Risk Assessment Updates**: New risks identified or mitigation strategies proven ineffective

### How to Update the PRD

**For each significant change:**

1. **Document Rationale**: Explain why the change is needed and what problem it solves
2. **Update Affected Sections**: Modify functional requirements, technical architecture, or UX specifications
3. **Revise Success Metrics**: Adjust KPIs if the change impacts measurable outcomes
4. **Update Development Roadmap**: Reflect timeline or priority changes in the development phases
5. **Cross-Reference Dependencies**: Update related sections that may be impacted by the change
6. **Maintain Consistency**: Ensure changes align with overall product vision and user personas

### PRD Integration with Development Process

**Daily Development Practice:**
- Reference PRD sections relevant to current work
- Validate implementations match specified requirements
- Update PRD immediately when requirements change during development
- Use PRD as source of truth for feature scope and definition

**Technical Implementation:**
- Ensure code comments reference PRD sections for business context
- Align database schema with PRD data models
- Follow specified technology choices and integration patterns
- Implement success metrics tracking as defined in PRD

**Quality Assurance:**
- Test against PRD acceptance criteria
- Verify user experience matches specified designs
- Validate performance meets non-functional requirements
- Ensure security implementations follow PRD specifications

### Integration with Other Documentation

- **PRD.md:** Product requirements and business specifications
- **ARCHITECTURE.md:** Technical implementation patterns and system design
- **FREIGHT_BROKERAGE.md:** Industry context and business process requirements
- **Individual component files:** Specific implementations with PRD cross-references

The PRD serves as the contract between business requirements and technical implementation. Keeping it current ensures all development work delivers the intended product value and user experience.

## Context-Driven Development Process

**CRITICAL WORKFLOW**: This project uses a comprehensive documentation system to ensure all development decisions are informed by business requirements, technical architecture, and industry expertise. Always follow this process.

### Required Context Consultation

**Before making any development decision, ALWAYS consult these files in order:**

1. **docs/development/DEV_PLAN.md** - Check current phase, week-specific tasks, and implementation priorities
2. **docs/business/PRD.md** - Verify feature requirements, user experience specifications, and success metrics
3. **docs/architecture/ARCHITECTURE.md** - Ensure technical approach aligns with system design and patterns
4. **docs/business/FREIGHT_BROKERAGE.md** - Understand industry context and business process requirements

### Decision-Making Framework

**For Feature Development:**
```
1. Check DEV_PLAN.md → What phase are we in? What's the current priority?
2. Check PRD.md → What are the exact requirements for this feature?
3. Check ARCHITECTURE.md → How should this be implemented technically?
4. Check FREIGHT_BROKERAGE.md → What industry considerations apply?
5. Implement with comprehensive comments referencing these contexts
6. Update relevant files if implementation reveals new requirements
```

**For Bug Fixes:**
```
1. Check ARCHITECTURE.md → What's the intended design pattern?
2. Check PRD.md → What's the expected behavior?
3. Check FREIGHT_BROKERAGE.md → Are there industry-specific edge cases?
4. Fix the issue maintaining architectural consistency
```

**For New Requirements:**
```
1. Update PRD.md → Add or modify functional requirements
2. Update ARCHITECTURE.md → Adjust technical design if needed
3. Update DEV_PLAN.md → Adjust timeline and priorities
4. Ensure FREIGHT_BROKERAGE.md → Covers any new industry processes
```

### When to Surface Questions

**ALWAYS ask the user for clarification when:**

1. **Conflicting Requirements**: Documentation files seem to contradict each other
2. **Missing Information**: Feature requirements aren't clear from existing documentation
3. **Industry Expertise Needed**: Freight brokerage process questions beyond documentation
4. **Architecture Decisions**: Multiple valid technical approaches, need business input
5. **Priority Conflicts**: Unclear which features take precedence
6. **Scope Ambiguity**: Uncertain if a feature belongs in current phase or later
7. **Performance Trade-offs**: Business decisions needed on speed vs accuracy vs cost
8. **Integration Challenges**: Third-party service limitations require business decisions

### Question Format

When surfacing questions, use this format:
```
**Context**: [Brief explanation of what you're trying to implement]
**Question**: [Specific question that needs clarification]
**Options Considered**: [Brief list of potential approaches]
**Recommendation**: [Your suggested approach with rationale]
**Impact**: [How this decision affects timeline/scope/architecture]
```

### Documentation Maintenance

**Update context files immediately when:**

1. **Requirements Change**: User provides new or modified requirements
2. **Architecture Evolves**: Technical implementation patterns change
3. **Industry Learning**: New understanding of freight brokerage processes
4. **Feature Completion**: Implementation reveals gaps in documentation
5. **Performance Insights**: Optimization work changes architectural decisions
6. **Integration Discoveries**: Third-party service limitations affect design
7. **User Feedback**: Testing reveals need for requirement adjustments

### File Maintenance Responsibilities

**DEV_PLAN.md Updates:**
- Mark completed tasks as done
- Add new tasks discovered during implementation
- Adjust timelines based on actual progress
- Note blockers and their resolutions

**PRD.md Updates:**
- Add new functional requirements
- Modify user experience specifications
- Update success metrics based on learning
- Revise technical architecture as needed

**ARCHITECTURE.md Updates:**
- Document new architectural patterns
- Update performance metrics and targets
- Add new integration patterns
- Revise best practices based on implementation

**FREIGHT_BROKERAGE.md Updates:**
- Add newly discovered industry processes
- Clarify business logic based on implementation
- Update regulatory requirements as needed
- Document industry-specific edge cases

### Implementation Comments Standard

**Every significant code block must reference relevant documentation:**

```python
# PRD Section 3.2: Load Intake Processing
# ARCHITECTURE: Universal Input Abstraction pattern
# FREIGHT_BROKERAGE: FTL Load Tender Receipt process (lines 80-102)
def process_load_tender(self, tender_data: Dict) -> LoadProcessingResult:
    """
    Process incoming load tender according to freight industry standards.
    
    BUSINESS CONTEXT (from FREIGHT_BROKERAGE.md):
    Load tenders require validation of all required fields before 
    proceeding to quote generation. Missing information must be 
    requested from shipper to prevent delays.
    
    TECHNICAL APPROACH (from ARCHITECTURE.md):
    Uses Universal Input Abstraction to normalize data from any source
    before applying business logic validation.
    """
```

### Quality Assurance Checklist

**Before committing any code:**
- [ ] Referenced all relevant context files
- [ ] Implementation matches PRD requirements
- [ ] Code follows ARCHITECTURE.md patterns
- [ ] Business logic aligns with FREIGHT_BROKERAGE.md
- [ ] Comments reference specific documentation sections
- [ ] Context files updated if new requirements discovered
- [ ] Surfaced questions if any ambiguity exists

---

## 🚀 MVP Development Plan

This plan builds the complete MVP from the current Intake Agent through to the Broker Inbox UI, with learning explanations for non-technical users.

### Phase 1: Foundation & Environment Setup (Day 1)
**Goal**: Get all tools and accounts ready for development

**Your Tasks (Outside Terminal)**:
1. **Supabase Account**: Sign up at supabase.com and create a new project
2. **OpenAI API Key**: Get API key from platform.openai.com (you'll need this for the LLM)
3. **Postmark Account**: Sign up at postmarkapp.com for incoming email webhooks (free tier available)
4. **Resend Account**: Sign up at resend.com for email sending (free tier available)
5. **Twilio Account**: Sign up at twilio.com for SMS (optional, can skip initially)

**What We'll Build Together**:
- Set up environment variables (.env file)
- Create Supabase database schema (loads table)
- Configure Postmark webhook for incoming emails
- Test the existing Intake Agent with your API keys

**Learning Focus**: Understanding APIs, environment variables, webhooks, and database schemas

### Phase 2: Supabase Integration (Day 2-3)
**Goal**: Connect our Python code to a real database instead of just printing

**What We'll Build**:
- `supabase/` directory structure
- `fn_create_load` Edge Function (JavaScript/TypeScript that runs in Supabase)
- Database trigger for `pg_notify('load.created')` (notifies when new loads are added)
- Update `src/agents/intake/graph.py` to call the Edge Function instead of just printing

**Learning Focus**: How databases work, what APIs are, and how serverless functions work

### Phase 3: LoadBlast Agent (Day 4-6)
**Goal**: Build the system that emails carriers about available loads

**What We'll Build**:
- `src/agents/loadblast/graph.py` - New LangGraph workflow
- Carrier database table and sample data
- Email templates for load offers
- Integration with Resend API for sending emails
- Staggered tier system (send to best carriers first, then others)

**Learning Focus**: Email automation, workflow design, and business logic

### Phase 4: QuoteCollector Agent (Day 7-9)
**Goal**: Parse carrier responses and extract their quotes

**What We'll Build**:
- `src/agents/quotecollector/graph.py` - New LangGraph workflow
- Email parsing logic (regex + LLM backup)
- Carrier quotes database table
- Quote normalization and scoring system
- Integration with email webhooks from Resend

**Learning Focus**: Text processing, webhooks, and data normalization

### Phase 5: Broker Inbox UI (Day 10-14)
**Goal**: Build a web interface for brokers to manage loads

**What We'll Build**:
- Next.js web application
- Load dashboard showing all active loads
- Real-time updates using Supabase Realtime
- Carrier quotes display and comparison
- Load assignment/booking interface

**Learning Focus**: Web development, real-time systems, and user interfaces

### Phase 6: Integration & Testing (Day 15-16)
**Goal**: Connect everything together and test end-to-end

**What We'll Build**:
- Complete workflow from email → load → blast → quotes → UI
- Error handling and edge cases
- Basic monitoring and logging
- Deployment to production

**Learning Focus**: System integration, testing, and deployment

### Development Approach
**How We'll Work Together**:
1. **I'll write the code** - You focus on learning and business logic
2. **You'll handle external setups** - API keys, accounts, configurations
3. **We'll test together** - You'll test the UI, I'll handle technical debugging
4. **I'll explain everything** - Every piece of code, every decision, every concept

### Success Metrics
By the end, you'll have:
- A working freight brokerage system processing real emails
- Understanding of APIs, databases, and web applications
- Ability to modify business logic and add new features
- Production-ready MVP deployed and accessible online

### Daily Structure
- **30 minutes**: Review previous day's work
- **2-3 hours**: Core development session
- **30 minutes**: Testing and explanation
- **15 minutes**: Plan next day's work

This plan is aggressive but achievable. We'll adjust timeline based on your learning pace and any technical challenges we encounter.

## Development Progress Tracking

**CRITICAL FOR SESSION CONTINUITY**: All development progress must be tracked in `docs/development/DEV_PLAN.md` to enable seamless session resumption and prevent work duplication.

### Progress Tracking Requirements

**After completing any task, ALWAYS update DEV_PLAN.md:**

1. **Mark Completed Tasks**: Change status from "pending" to "completed"
2. **Document Implementation Details**: Add notes about what was actually built
3. **Record Blockers/Challenges**: Note any issues encountered and their resolutions
4. **Update Dependencies**: Mark dependent tasks as ready if prerequisites are complete
5. **Adjust Timeline**: Revise estimates based on actual completion times
6. **Add New Tasks**: Document any additional work discovered during implementation

### Session Resumption Protocol

**At the start of each session, ALWAYS:**

1. **Read DEV_PLAN.md** to understand current progress and next priorities
2. **Verify Implementation**: Quick check that completed tasks are actually done
3. **Identify Blockers**: Review any outstanding issues that need resolution
4. **Plan Current Session**: Select appropriate tasks for current session scope
5. **Update Status**: Mark selected tasks as "in_progress" before beginning work

### Progress Documentation Format

**When updating DEV_PLAN.md, use this format:**

```markdown
### [Task Name] - COMPLETED
**Status**: Completed on [Date]
**Implementation Notes**: 
- Specific details of what was built
- File locations and key functions
- Integration points established
- Testing completed

**Blockers Resolved**:
- Issue description and solution
- Dependencies that were addressed

**Next Steps Enabled**:
- List tasks that can now proceed
- Dependencies that are now satisfied
```

### Status Values

**Use these consistent status values:**
- `pending` - Task not yet started
- `in_progress` - Currently being worked on
- `blocked` - Waiting for dependency or external factor
- `completed` - Fully implemented and tested
- `deferred` - Postponed to later phase

### Integration with Git Workflow

**When committing code:**
- Include DEV_PLAN.md updates in the same commit
- Reference specific plan sections in commit messages
- Ensure plan status matches actual code state

### Mandatory Progress Tracking on Commits

**CRITICAL REQUIREMENT**: Every commit MUST include progress tracking updates to maintain project continuity and prevent work duplication across sessions.

**Before creating any commit, ALWAYS execute these steps:**

1. **Update DEV_PLAN.md Status**: Mark completed tasks and update implementation details
2. **Document What Was Built**: Record specific files changed, features implemented, and integration points
3. **Note Any New Tasks Discovered**: Add newly identified work to the development plan
4. **Update Dependencies**: Mark dependent tasks as ready if prerequisites are now complete
5. **Record Blockers/Challenges**: Document any issues encountered and their resolutions

**Commit Message Format**:
```
[Phase/Component]: Brief description of changes

Progress Updates:
- Completed: [Task names from DEV_PLAN.md]
- In Progress: [Currently active tasks]
- New Tasks Added: [Any newly discovered work]
- Blockers: [Any impediments and their status]

Technical Changes:
- [List of key files modified]
- [Integration points established]
- [Tests completed]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Example Commit Message**:
```
Edge Functions: Deploy corrected fn_create_load with schema alignment

Progress Updates:
- Completed: Deploy Supabase Edge Function (fn_create_load) to production
- Completed: Test complete multi-provider email processing workflow
- New Tasks Added: Update intake_graph.py field name mapping for consistency
- Blockers: None - all Phase 1 foundation work complete

Technical Changes:
- Updated supabase/functions/fn_create_load/index.ts with correct schema mapping
- Fixed validation to match actual database field names (pickup_dt, weight_lb, equipment)
- Deployed to production and verified with test_edge_function.py
- End-to-end email processing workflow tested and operational

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Why This Matters**:
- **Session Continuity**: Next session can immediately understand current progress
- **Context Preservation**: Technical decisions and implementation details are captured
- **Work Duplication Prevention**: Clear record of what's been completed vs. what needs work
- **Debugging Support**: Detailed record of changes helps with troubleshooting
- **Team Coordination**: Clear progress visibility for all project stakeholders

### Quality Assurance

**Before ending any session:**
- [ ] DEV_PLAN.md reflects all work completed in session
- [ ] Status values are accurate and current
- [ ] Next session priorities are clearly identified
- [ ] Any blockers are documented with context
- [ ] Timeline adjustments are realistic and noted

This tracking system ensures that development momentum is maintained across sessions and prevents time waste from rediscovering previous work or decisions.