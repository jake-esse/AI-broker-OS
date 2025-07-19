# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Running the intake agent
```bash
python intake_graph.py path/to/email.eml
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

**intake_graph.py** - Main application file containing the LangGraph workflow:
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

**IMPORTANT**: This codebase includes a comprehensive `ARCHITECTURE.md` file that documents the long-term vision for a multi-input, agentic freight brokerage system. This guide must be actively maintained as the codebase evolves.

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

**ESSENTIAL READING**: This codebase includes a comprehensive `FREIGHT_BROKERAGE.md` file that documents the complete freight brokerage business process. This file is **critical for both human developers and AI systems** working on this project.

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
- Update `intake_graph.py` to call the Edge Function instead of just printing

**Learning Focus**: How databases work, what APIs are, and how serverless functions work

### Phase 3: LoadBlast Agent (Day 4-6)
**Goal**: Build the system that emails carriers about available loads

**What We'll Build**:
- `loadblast_graph.py` - New LangGraph workflow
- Carrier database table and sample data
- Email templates for load offers
- Integration with Resend API for sending emails
- Staggered tier system (send to best carriers first, then others)

**Learning Focus**: Email automation, workflow design, and business logic

### Phase 4: QuoteCollector Agent (Day 7-9)
**Goal**: Parse carrier responses and extract their quotes

**What We'll Build**:
- `quotecollector_graph.py` - New LangGraph workflow
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