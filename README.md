# AI-Broker: Intelligent Freight Brokerage Automation Platform 🚚🤖

AI-Broker is a web-based platform that automates freight brokerage operations for independent brokers, enabling them to handle 3-5x more loads while maintaining quality and compliance. The platform uses AI agents that communicate through multiple channels (email, SMS, phone) on behalf of brokers, managing the entire freight lifecycle from quoting through payment.

## 🏗️ Documentation-Driven Development

This project uses a comprehensive documentation system to facilitate effective human-AI collaboration in software development. All development decisions are guided by four core context files that work together to ensure technical implementation aligns with business requirements and industry best practices.

    

## 📋 Core Context Files

### DEV_PLAN.md - Development Roadmap & Implementation Guide
**Purpose**: Provides week-by-week development timeline with detailed technical implementation steps.

**Contents**:
- 24-week development plan from MVP to full platform
- Strategic analysis of development approach (freight types vs end-to-end automation)
- Detailed technical implementation for each phase
- External requirements (API keys, accounts, configurations)
- Code examples and database schemas
- Testing strategies and production checklists

**When to Reference**:
- Starting work on any new feature
- Planning sprint or weekly tasks
- Understanding current development phase
- Setting up external integrations
- Preparing for production deployment

### PRD.md - Product Requirements Document
**Purpose**: Defines what we're building, for whom, and why. Serves as the contract between business vision and technical implementation.

**Contents**:
- Market analysis and problem definition
- Target user personas and use cases
- Functional requirements for all features
- User experience specifications
- Non-functional requirements (performance, security, scalability)
- Success metrics and KPIs
- Technical architecture overview

**When to Reference**:
- Implementing any user-facing feature
- Making UX/UI decisions
- Defining API specifications
- Setting performance targets
- Validating feature completeness

### ARCHITECTURE.md - Technical Architecture & System Design
**Purpose**: Defines how we build the platform. Provides technical patterns, design principles, and implementation guidelines.

**Contents**:
- System architecture and component design
- Multi-channel communication strategy
- AI agent coordination and workflows
- Data architecture and models
- Performance optimization strategies
- Development best practices
- Scalability and continuous improvement frameworks

**When to Reference**:
- Writing any code
- Making technical architecture decisions
- Setting up integrations
- Optimizing performance
- Designing new components

### FREIGHT_BROKERAGE.md - Industry Context & Business Logic
**Purpose**: Provides deep freight industry knowledge to ensure our technical solutions address real business problems correctly.

**Contents**:
- Complete freight brokerage process flows
- Industry terminology and stakeholder relationships
- Freight type variations (FTL, LTL, Reefer, Flatbed, Hazmat)
- Regulatory environment and compliance requirements
- Pain points and automation opportunities
- Current industry technology landscape

**When to Reference**:
- Implementing business logic
- Handling industry-specific edge cases
- Making decisions about freight processes
- Understanding user workflows
- Designing automation features

## 🔄 How They Work Together

### Development Workflow
```
1. DEV_PLAN.md → What am I building this week?
2. PRD.md → What are the exact requirements?
3. ARCHITECTURE.md → How should I implement this?
4. FREIGHT_BROKERAGE.md → What industry rules apply?
5. Implement with comprehensive documentation references
6. Update context files if new insights are discovered
```

### Decision-Making Hierarchy
1. **Business Requirements** (PRD.md) - What the product must do
2. **Industry Context** (FREIGHT_BROKERAGE.md) - How the freight industry works
3. **Technical Architecture** (ARCHITECTURE.md) - How to implement it correctly
4. **Development Plan** (DEV_PLAN.md) - When and how to build it

### Quality Assurance
Every code commit must:
- Reference specific sections from relevant context files
- Include business context from FREIGHT_BROKERAGE.md
- Follow patterns defined in ARCHITECTURE.md  
- Meet requirements specified in PRD.md
- Align with current phase in DEV_PLAN.md

## 🤖 Human-AI Collaboration Model

### AI Responsibilities
- **Context Consultation**: Always check relevant documentation before implementation
- **Pattern Following**: Implement according to architectural guidelines
- **Documentation Updates**: Keep context files current as development progresses
- **Question Surfacing**: Ask for clarification when requirements are unclear

### Human Responsibilities
- **Strategic Decisions**: Business priorities, feature scope, timeline adjustments
- **Industry Expertise**: Freight brokerage process clarifications and edge cases
- **External Setup**: API keys, accounts, third-party service configurations
- **Quality Review**: Testing, user feedback, performance validation

### Collaboration Principles
1. **Transparency**: All decisions are documented and traceable
2. **Context-Driven**: No implementation without proper context consultation
3. **Iterative Improvement**: Documentation evolves with implementation learning
4. **Question-Friendly**: Ambiguity is surfaced immediately, not assumed

## 🚀 Getting Started

### For Developers
1. Read CLAUDE.md for complete development workflow
2. Review DEV_PLAN.md to understand current phase
3. Study PRD.md for feature requirements  
4. Understand ARCHITECTURE.md patterns
5. Familiarize with FREIGHT_BROKERAGE.md industry context

### For Business Stakeholders
1. PRD.md provides complete product vision and requirements
2. DEV_PLAN.md shows development timeline and milestones
3. ARCHITECTURE.md explains technical approach and scalability
4. FREIGHT_BROKERAGE.md validates industry alignment

## 📊 Current Status

**Phase**: MVP Development (Weeks 1-4)
**Focus**: FTL Dry Van Quoting Automation
**Next**: Multi-Modal Freight Type Expansion (Weeks 5-9)

See DEV_PLAN.md for detailed current status and next steps.

## 🏛️ Architecture Overview

AI-Broker is a Next.js web application with AI agents that communicate through multiple channels:

- **Frontend**: Next.js web app (broker command center)
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **AI Orchestration**: LangChain/LangGraph agents
- **Communication**: Resend (email), Postmark (inbound), Twilio (SMS/voice)
- **Payments**: Stripe (billing and carrier payments)
- **Documents**: DocuSign (rate confirmations), Reducto (OCR)

## 📈 Success Metrics

**MVP Targets (Week 4)**:
- 10 active brokers
- 100 quotes generated
- 90% data extraction accuracy
- <5s quote generation time

**Full Platform (Week 24)**:
- 500 active brokers  
- 10K loads/month processed
- $50K MRR
- 3-5x broker productivity increase

## 🤝 Contributing

This project follows a documentation-driven development process. All contributors must:

1. Read and understand all context files
2. Follow the development workflow in CLAUDE.md
3. Reference documentation in all code implementations
4. Update context files when discovering new requirements
5. Surface questions when requirements are unclear

## 📞 Support

For questions about:
- **Product Features**: Reference PRD.md
- **Technical Implementation**: Reference ARCHITECTURE.md  
- **Development Timeline**: Reference DEV_PLAN.md
- **Industry Context**: Reference FREIGHT_BROKERAGE.md
- **Development Process**: Reference CLAUDE.md

---

*This documentation system enables rapid, high-quality development by ensuring all technical decisions are grounded in business requirements, industry expertise, and architectural best practices.*
