# AI-Broker Architecture Guide

## Overview & Philosophy

AI-Broker is designed as a **multi-input, agentic freight brokerage automation system** that evolves with advancing AI capabilities. The core philosophy is to create a unified platform that can intelligently process freight requests from any source, make autonomous decisions where appropriate, and seamlessly escalate to human operators when needed.

### Design Principles

1. **Input Source Agnostic**: The system treats all input sources uniformly through a common abstraction layer
2. **Agentic Decision Making**: AI agents make autonomous decisions within defined confidence thresholds
3. **Human-in-the-Loop**: Graceful escalation to human operators for edge cases and low-confidence scenarios
4. **Model Evolution Ready**: Architecture supports swapping and upgrading foundation models without system rewrites
5. **Continuous Learning**: System improves through feedback loops and telemetry data
6. **Modular & Composable**: Components can be independently developed, tested, and deployed

## System Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Input Sources  │    │   Orchestrator  │    │ Output Systems  │
│                 │    │                 │    │                 │
│ • Email         │────│ • Intent Router │────│ • Database      │
│ • PDF           │    │ • Agent Manager │    │ • Email API     │
│ • EDI           │    │ • Human Router  │    │ • Notifications │
│ • Phone/Voice   │    │ • Model Manager │    │ • Dashboard     │
│ • SMS           │    │                 │    │                 │
│ • API           │    │                 │    │                 │
│ • Meetings      │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Input Source Architecture

#### Universal Input Abstraction

All input sources are normalized into a common `UniversalInput` format:

```python
class UniversalInput:
    source_type: str          # "email", "pdf", "edi", "voice", "sms", "api"
    source_metadata: dict     # Source-specific metadata
    content: str             # Normalized text content
    attachments: List[dict]  # Structured attachment data
    timestamp: datetime      # When input was received
    confidence: float        # Source extraction confidence
    raw_data: dict          # Original data for debugging
```

#### Input Processing Pipeline

1. **Source Adapters**: Convert raw input to `UniversalInput` format
2. **Content Normalization**: Extract and clean text content
3. **Intent Classification**: Determine input purpose and urgency
4. **Routing Decision**: Route to appropriate agent or human queue

### Agentic Decision Framework

#### Decision Hierarchy

```python
class DecisionFramework:
    def route_input(self, input: UniversalInput) -> Decision:
        # 1. High-confidence autonomous processing
        if self.can_process_autonomously(input):
            return AutomatedDecision(agent=self.select_agent(input))
        
        # 2. Medium-confidence with human review
        elif self.requires_human_review(input):
            return HumanReviewDecision(priority=self.calculate_priority(input))
        
        # 3. Low-confidence immediate escalation
        else:
            return EscalationDecision(reason=self.get_failure_reason(input))
```

#### Confidence Thresholds

- **Autonomous Processing**: >85% confidence
- **Human Review Required**: 60-85% confidence  
- **Immediate Escalation**: <60% confidence

#### Agent Selection Logic

```python
def select_agent(self, input: UniversalInput) -> Agent:
    intent = self.classify_intent(input)
    
    agent_map = {
        "LOAD_TENDER": LoadIntakeAgent,
        "QUOTE_REQUEST": QuoteProcessingAgent,
        "CARRIER_RESPONSE": QuoteCollectorAgent,
        "PAYMENT_INQUIRY": AccountingAgent,
        "GENERAL_INQUIRY": CustomerServiceAgent,
    }
    
    return agent_map.get(intent, GeneralProcessingAgent)
```

### Human-in-the-Loop Design

#### Escalation Triggers

1. **Low Confidence**: AI extraction confidence below threshold
2. **Edge Cases**: Unusual input formats or content
3. **High Value**: Loads above specified dollar thresholds
4. **Compliance**: Regulatory or policy exceptions
5. **Customer Preference**: VIP customers requiring human touch

#### Human Interface Points

```python
class HumanInterface:
    def create_review_task(self, input: UniversalInput, reason: str):
        """Create structured task for human review"""
        
    def request_clarification(self, input: UniversalInput, questions: List[str]):
        """Send clarification request to input source"""
        
    def escalate_exception(self, input: UniversalInput, exception: Exception):
        """Escalate processing failures"""
```

### Model Evolution Strategy

#### Model Abstraction Layer

```python
class ModelManager:
    def __init__(self):
        self.models = {
            "extraction": ExtractionModel(),
            "classification": ClassificationModel(),
            "generation": GenerationModel(),
        }
    
    def upgrade_model(self, model_type: str, new_model: BaseModel):
        """Hot-swap models without system downtime"""
        
    def evaluate_performance(self, model_type: str) -> Metrics:
        """Continuous model performance monitoring"""
```

#### Version Management

- **A/B Testing**: Compare model versions on live traffic
- **Rollback Capability**: Instant rollback to previous model versions
- **Performance Monitoring**: Track accuracy, latency, and cost metrics
- **Gradual Rollouts**: Progressive deployment of new models

#### Training Data Pipeline

```python
class TrainingDataPipeline:
    def collect_feedback(self, prediction: dict, actual_outcome: dict):
        """Collect human corrections and outcomes"""
        
    def generate_training_data(self) -> Dataset:
        """Create training datasets from production data"""
        
    def trigger_retraining(self, performance_threshold: float):
        """Automatically trigger model retraining"""
```

## Current Implementation Status

### ✅ Implemented Components

**Email Intent Classification (`email_intent_classifier.py`)**
- AI-powered email classification with 7 categories
- Confidence scoring and reasoning
- Fallback classification for edge cases
- Ready for production use with configurable thresholds

**PDF Intake Agent (`pdf_intake_agent.py`)**
- Reducto API integration for PDF document extraction
- OpenAI fallback when Reducto unavailable
- Structured schema-based extraction
- Complete LangGraph workflow with validation

**Unified Intake Agent (`unified_intake_agent.py`)**
- Implements Universal Input abstraction
- Intelligent routing based on confidence thresholds
- Multi-input support (email text, PDF attachments)
- Human-in-the-loop escalation framework

**Decision Framework**
- Confidence-based routing (>85% autonomous, 60-85% review, <60% escalation)
- Agent selection based on input characteristics
- Priority-based human escalation
- Complete audit trail and reasoning

### 🏗️ Architecture Patterns Implemented

1. **Universal Input Abstraction**: All inputs normalized to common `UniversalInput` format
2. **Agentic Decision Making**: AI-driven routing with configurable confidence thresholds
3. **Human-in-the-Loop**: Automatic escalation for low-confidence or edge cases
4. **Model Evolution Ready**: Modular design supports model upgrades and A/B testing

## Implementation Guidelines

### 1. Input Source Integration

When adding new input sources, follow the established pattern:

```python
class NewInputAdapter(BaseInputAdapter):
    def normalize(self, raw_input: Any) -> UniversalInput:
        """Convert source-specific input to universal format"""
        
    def extract_metadata(self, raw_input: Any) -> dict:
        """Extract source-specific metadata"""
        
    def validate_input(self, raw_input: Any) -> bool:
        """Validate input format and content"""
```

**Example: EDI Integration**
```python
def create_universal_input_from_edi(edi_message: str) -> UniversalInput:
    return UniversalInput(
        source_type=InputSourceType.EDI,
        source_metadata={"transaction_set": "204", "sender_id": "ACME"},
        content=parsed_edi_content,
        confidence=1.0  # EDI is structured, high confidence
    )
```

### 2. Agent Development

All agents should implement:

```python
class BaseAgent:
    def can_handle(self, input: UniversalInput) -> float:
        """Return confidence score for handling this input"""
        
    def process(self, input: UniversalInput) -> AgentResult:
        """Process input and return structured result"""
        
    def get_human_review_criteria(self) -> List[str]:
        """Define when human review is required"""
```

### 3. Telemetry & Monitoring

Every component must emit telemetry:

```python
class TelemetryLogger:
    def log_input_received(self, source_type: str, metadata: dict)
    def log_processing_started(self, agent_type: str, input_id: str)
    def log_decision_made(self, decision_type: str, confidence: float)
    def log_human_escalation(self, reason: str, input_id: str)
    def log_outcome(self, success: bool, processing_time: float)
```

### 4. Error Handling

Implement graceful degradation:

```python
class ErrorHandler:
    def handle_model_failure(self, error: Exception) -> FallbackStrategy
    def handle_api_failure(self, service: str) -> RetryStrategy
    def handle_data_validation_error(self, input: UniversalInput) -> ValidationStrategy
```

## Best Practices

### Development

1. **Test-Driven Development**: Write tests before implementing features
2. **Schema Validation**: Validate all inputs and outputs against schemas
3. **Configuration Management**: Use environment-based configuration
4. **Dependency Injection**: Loose coupling between components
5. **API Versioning**: Version all external APIs for backward compatibility

### AI/ML Operations

1. **Model Versioning**: Track all model versions and their performance
2. **Feature Flags**: Control model rollouts with feature flags
3. **Shadow Mode**: Test new models alongside production models
4. **Performance Baselines**: Establish and monitor performance baselines
5. **Feedback Loops**: Implement human feedback collection mechanisms

### Data Management

1. **Data Privacy**: Implement data anonymization and retention policies
2. **Audit Trails**: Maintain complete audit trails for all decisions
3. **Data Quality**: Continuous monitoring of data quality metrics
4. **Backup & Recovery**: Robust backup and disaster recovery procedures
5. **Compliance**: Ensure compliance with industry regulations

### Scalability

1. **Horizontal Scaling**: Design stateless components for easy scaling
2. **Load Balancing**: Implement proper load balancing strategies
3. **Caching**: Cache expensive operations and model predictions
4. **Rate Limiting**: Implement rate limiting for external APIs
5. **Resource Management**: Monitor and optimize resource usage

## Future Considerations

### Advanced AI Capabilities

- **Multi-Modal Processing**: Handle voice, image, and video inputs
- **Reasoning Agents**: Implement chain-of-thought reasoning for complex decisions
- **Self-Improving Systems**: Agents that optimize their own performance
- **Cross-Agent Learning**: Agents that learn from each other's experiences

### Integration Opportunities

- **Industry APIs**: Direct integration with major freight platforms
- **IoT Integration**: Real-time tracking and sensor data integration
- **Blockchain**: Supply chain transparency and smart contracts
- **Edge Computing**: Process inputs closer to their sources

### Business Intelligence

- **Predictive Analytics**: Forecast market conditions and pricing
- **Customer Behavior Analysis**: Understand shipper and carrier patterns
- **Optimization Algorithms**: Route and resource optimization
- **Risk Assessment**: Automated risk scoring for loads and carriers

## Maintenance Notes

This architecture guide should be updated whenever:

1. New input sources are added
2. New AI models or capabilities are integrated
3. Significant architectural changes are made
4. New best practices are discovered
5. Performance benchmarks change significantly

The goal is to maintain this as a living document that guides development decisions and onboards new team members effectively.