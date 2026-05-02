from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime
import json

@dataclass
class Requirements:
    """R - Requirements: What problem are we solving, and what is DoD?"""
    problem_statement: str
    definition_of_done: List[str]
    acceptance_criteria: List[str]
    business_value: str
    scope_in: List[str]
    scope_out: List[str]

@dataclass
class Entities:
    """E - Entities: Domain entities and relationships"""
    domain_entities: Dict[str, str]  # entity_name: description
    relationships: List[str]
    business_rules: List[str]
    data_models: Dict[str, Any]

@dataclass
class Approach:
    """A - Approach: The strategy of how we'll meet the requirements"""
    solution_strategy: str
    design_decisions: List[str]
    trade_offs: List[str]
    technical_approach: str
    patterns_used: List[str]

@dataclass
class Structure:
    """S - Structure: Where the change fits in the system; components and dependencies"""
    system_components: List[str]
    dependencies: Dict[str, List[str]]
    interfaces: List[str]
    integration_points: List[str]
    architecture_layers: List[str]

@dataclass
class Operations:
    """O - Operations: Break the abstract strategy into concrete, testable implementation steps"""
    implementation_steps: List[str]
    method_signatures: List[str]
    execution_order: List[str]
    testing_strategy: List[str]
    validation_steps: List[str]

@dataclass
class Norms:
    """N - Norms: Cross-cutting engineering norms (naming, observability, defensive coding, etc.)"""
    naming_conventions: List[str]
    coding_standards: List[str]
    observability_requirements: List[str]
    error_handling_patterns: List[str]
    performance_guidelines: List[str]

@dataclass
class Safeguards:
    """S - Safeguards: Non-negotiable boundaries (invariants, performance limits, security rules, etc.)"""
    invariants: List[str]
    performance_limits: List[str]
    security_rules: List[str]
    compliance_requirements: List[str]
    validation_rules: List[str]

@dataclass
class ReasonsCanvas:
    """Complete REASONS Canvas structure for SPDD"""
    id: str
    title: str
    version: str
    created_at: datetime
    updated_at: datetime
    status: str  # draft, reviewed, approved, implemented
    
    requirements: Requirements
    entities: Entities
    approach: Approach
    structure: Structure
    operations: Operations
    norms: Norms
    safeguards: Safeguards
    
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_json(self) -> str:
        """Convert canvas to JSON for storage"""
        canvas_dict = {
            'id': self.id,
            'title': self.title,
            'version': self.version,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'status': self.status,
            'requirements': {
                'problem_statement': self.requirements.problem_statement,
                'definition_of_done': self.requirements.definition_of_done,
                'acceptance_criteria': self.requirements.acceptance_criteria,
                'business_value': self.requirements.business_value,
                'scope_in': self.requirements.scope_in,
                'scope_out': self.requirements.scope_out
            },
            'entities': {
                'domain_entities': self.entities.domain_entities,
                'relationships': self.entities.relationships,
                'business_rules': self.entities.business_rules,
                'data_models': self.entities.data_models
            },
            'approach': {
                'solution_strategy': self.approach.solution_strategy,
                'design_decisions': self.approach.design_decisions,
                'trade_offs': self.approach.trade_offs,
                'technical_approach': self.approach.technical_approach,
                'patterns_used': self.approach.patterns_used
            },
            'structure': {
                'system_components': self.structure.system_components,
                'dependencies': self.structure.dependencies,
                'interfaces': self.structure.interfaces,
                'integration_points': self.structure.integration_points,
                'architecture_layers': self.structure.architecture_layers
            },
            'operations': {
                'implementation_steps': self.operations.implementation_steps,
                'method_signatures': self.operations.method_signatures,
                'execution_order': self.operations.execution_order,
                'testing_strategy': self.operations.testing_strategy,
                'validation_steps': self.operations.validation_steps
            },
            'norms': {
                'naming_conventions': self.norms.naming_conventions,
                'coding_standards': self.norms.coding_standards,
                'observability_requirements': self.norms.observability_requirements,
                'error_handling_patterns': self.norms.error_handling_patterns,
                'performance_guidelines': self.norms.performance_guidelines
            },
            'safeguards': {
                'invariants': self.safeguards.invariants,
                'performance_limits': self.safeguards.performance_limits,
                'security_rules': self.safeguards.security_rules,
                'compliance_requirements': self.safeguards.compliance_requirements,
                'validation_rules': self.safeguards.validation_rules
            },
            'metadata': self.metadata
        }
        return json.dumps(canvas_dict, indent=2, ensure_ascii=False)
    
    @classmethod
    def from_json(cls, json_str: str) -> 'ReasonsCanvas':
        """Create canvas from JSON"""
        data = json.loads(json_str)
        
        return cls(
            id=data['id'],
            title=data['title'],
            version=data['version'],
            created_at=datetime.fromisoformat(data['created_at']),
            updated_at=datetime.fromisoformat(data['updated_at']),
            status=data['status'],
            requirements=Requirements(**data['requirements']),
            entities=Entities(**data['entities']),
            approach=Approach(**data['approach']),
            structure=Structure(**data['structure']),
            operations=Operations(**data['operations']),
            norms=Norms(**data['norms']),
            safeguards=Safeguards(**data['safeguards']),
            metadata=data.get('metadata', {})
        )