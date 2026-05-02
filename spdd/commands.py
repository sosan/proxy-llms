from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import os
import json
from dataclasses import asdict

from litai import LLM
from .reasons_canvas import ReasonsCanvas, Requirements, Entities, Approach, Structure, Operations, Norms, Safeguards

class SPDDCommands:
    """Commands for SPDD workflow automation"""
    
    def __init__(self, model: str = "openai/gpt-4"):
        self.llm = LLM(model=model)
        self.canvas_dir = "spdd/canvas"
        self.stories_dir = "spdd/stories"
        self.analysis_dir = "spdd/analysis"
        self.ensure_directories()
    
    def ensure_directories(self):
        """Create necessary directories"""
        for dir_path in [self.canvas_dir, self.stories_dir, self.analysis_dir]:
            os.makedirs(dir_path, exist_ok=True)
    
    def spdd_story(self, requirement_text: str) -> str:
        """
        /spdd-story: Breaks a large requirement into independent, deliverable user stories
        following the INVEST principle
        """
        prompt = f"""
        You are an expert Business Analyst. Break down the following large requirement into independent, 
        deliverable user stories following the INVEST principle (Independent, Negotiable, Valuable, 
        Estimable, Small, Testable). Each story should be 1-5 days of work.

        Large Requirement:
        {requirement_text}

        For each story, provide:
        1. Title
        2. Background
        3. Business Value
        4. Scope In
        5. Scope Out
        6. Acceptance Criteria (Given/When/Then format with concrete examples)

        Format each story as a separate section with clear headers.
        """
        
        response = self.llm.chat(prompt)
        
        # Save story breakdown
        story_id = f"STORY-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        story_path = f"{self.stories_dir}/{story_id}.md"
        
        with open(story_path, 'w', encoding='utf-8') as f:
            f.write(f"# User Story Breakdown\n\n")
            f.write(f"**ID:** {story_id}\n")
            f.write(f"**Created:** {datetime.now().isoformat()}\n\n")
            f.write(f"## Original Requirement\n\n{requirement_text}\n\n")
            f.write(f"## Story Breakdown\n\n{response}")
        
        return f"Stories created and saved to {story_path}"
    
    def spdd_analysis(self, story_file: str, codebase_path: str = ".") -> str:
        """
        /spdd-analysis: Extracts domain keywords from requirements, scans relevant code, 
        and produces strategic analysis
        """
        # Read story file
        with open(story_file, 'r', encoding='utf-8') as f:
            story_content = f.read()
        
        # Scan relevant codebase files
        codebase_context = self._scan_codebase(codebase_path)
        
        prompt = f"""
        You are a Senior Software Architect. Analyze the following user story and existing codebase 
        to produce a strategic analysis.

        User Story:
        {story_content}

        Existing Codebase Context:
        {codebase_context}

        Provide analysis covering:

        ## Domain Concept Recognition
        - Existing domain concepts that will be affected
        - New domain concepts to be introduced
        - Relationships between concepts
        - Key business rules

        ## Strategic Direction
        - High-level solution approach
        - Architectural patterns to apply
        - Integration strategy with existing system
        - Key design decisions and trade-offs

        ## Risk Analysis
        - Technical risks and mitigation strategies
        - Edge cases to consider
        - Potential integration issues
        - Performance considerations
        - Security implications

        ## Implementation Guidance
        - Recommended implementation order
        - Critical dependencies
        - Testing strategy recommendations
        - Rollback considerations

        Focus on the "what" and "why" - avoid granular implementation details at this stage.
        """
        
        response = self.llm.chat(prompt)
        
        # Save analysis
        analysis_id = f"ANALYSIS-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        analysis_path = f"{self.analysis_dir}/{analysis_id}.md"
        
        with open(analysis_path, 'w', encoding='utf-8') as f:
            f.write(f"# Strategic Analysis\n\n")
            f.write(f"**ID:** {analysis_id}\n")
            f.write(f"**Created:** {datetime.now().isoformat()}\n")
            f.write(f"**Story File:** {story_file}\n\n")
            f.write(response)
        
        return f"Analysis created and saved to {analysis_path}"
    
    def spdd_reasons_canvas(self, analysis_file: str) -> str:
        """
        /spdd-reasons-canvas: Generates the full REASONS Canvas from analysis
        """
        # Read analysis file
        with open(analysis_file, 'r', encoding='utf-8') as f:
            analysis_content = f.read()
        
        prompt = f"""
        You are a Senior Software Architect. Based on the strategic analysis provided, 
        generate a complete REASONS Canvas that serves as an executable blueprint.

        Strategic Analysis:
        {analysis_content}

        Generate a detailed REASONS Canvas with the following structure:

        ## R - REQUIREMENTS
        - Problem Statement: Clear, one-sentence problem definition
        - Definition of Done: Specific, measurable completion criteria
        - Acceptance Criteria: Given/When/Then scenarios with concrete examples
        - Business Value: Why this matters to the business
        - Scope In: What will be delivered
        - Scope Out: What will NOT be delivered

        ## E - ENTITIES
        - Domain Entities: Key business objects and their descriptions
        - Relationships: How entities relate to each other
        - Business Rules: Invariant rules that must be maintained
        - Data Models: Structure of key data objects

        ## A - APPROACH
        - Solution Strategy: High-level approach to solving the problem
        - Design Decisions: Key architectural choices made
        - Trade-offs: What we're optimizing for and what we're accepting
        - Technical Approach: Specific technical strategy
        - Patterns Used: Design patterns to be applied

        ## S - STRUCTURE
        - System Components: Major components that will be created/modified
        - Dependencies: What depends on what
        - Interfaces: APIs and contracts between components
        - Integration Points: How this connects to existing systems
        - Architecture Layers: Which layers of the architecture are involved

        ## O - OPERATIONS
        - Implementation Steps: Concrete tasks in order
        - Method Signatures: Specific method/function signatures
        - Execution Order: Sequence of implementation
        - Testing Strategy: How to validate each step
        - Validation Steps: Specific validation checkpoints

        ## N - NORMS
        - Naming Conventions: How to name things consistently
        - Coding Standards: Code quality requirements
        - Observability Requirements: Logging, monitoring, alerting needs
        - Error Handling Patterns: How to handle failures
        - Performance Guidelines: Performance requirements and patterns

        ## S - SAFEGUARDS
        - Invariants: Rules that must never be violated
        - Performance Limits: Hard performance constraints
        - Security Rules: Security requirements and constraints
        - Compliance Requirements: Regulatory or policy requirements
        - Validation Rules: Input/output validation requirements

        Be extremely specific in the Operations section - include actual method signatures,
        parameter types, and step-by-step execution details.
        """
        
        response = self.llm.chat(prompt)
        
        # Parse and structure the canvas
        canvas_id = f"CANVAS-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        canvas_title = f"Canvas for {analysis_file}"
        
        # Save as structured markdown first
        canvas_path = f"{self.canvas_dir}/{canvas_id}.md"
        with open(canvas_path, 'w', encoding='utf-8') as f:
            f.write(f"# REASONS Canvas: {canvas_title}\n\n")
            f.write(f"**ID:** {canvas_id}\n")
            f.write(f"**Created:** {datetime.now().isoformat()}\n")
            f.write(f"**Status:** draft\n")
            f.write(f"**Analysis Source:** {analysis_file}\n\n")
            f.write(response)
        
        return f"REASONS Canvas created and saved to {canvas_path}"
    
    def spdd_generate(self, canvas_file: str) -> str:
        """
        /spdd-generate: Reads the Canvas and generates code task by task
        """
        # Read canvas file
        with open(canvas_file, 'r', encoding='utf-8') as f:
            canvas_content = f.read()
        
        prompt = f"""
        You are an expert software developer. Based on the REASONS Canvas provided,
        generate the complete implementation code following the Operations section exactly.

        REASONS Canvas:
        {canvas_content}

        Generate code that:
        1. Follows the implementation steps in the exact order specified in Operations
        2. Adheres to all Norms (naming conventions, coding standards, etc.)
        3. Respects all Safeguards (invariants, performance limits, security rules)
        4. Implements the exact method signatures specified
        5. Includes proper error handling and validation
        6. Includes comprehensive comments explaining business logic

        Structure the response with:
        - File paths and names
        - Complete file contents for each file
        - Any necessary configuration or setup instructions

        Do not add features beyond what the Canvas specifies. Stay strictly within the defined scope.
        """
        
        response = self.llm.chat(prompt)
        
        # Save generated code
        generation_id = f"GENERATED-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        generation_path = f"generated/{generation_id}.md"
        os.makedirs("generated", exist_ok=True)
        
        with open(generation_path, 'w', encoding='utf-8') as f:
            f.write(f"# Generated Code\n\n")
            f.write(f"**Generation ID:** {generation_id}\n")
            f.write(f"**Created:** {datetime.now().isoformat()}\n")
            f.write(f"**Canvas Source:** {canvas_file}\n\n")
            f.write(response)
        
        return f"Code generated and saved to {generation_path}"
    
    def spdd_prompt_update(self, canvas_file: str, update_instruction: str) -> str:
        """
        /spdd-prompt-update: Incrementally updates the existing Canvas
        """
        # Read existing canvas
        with open(canvas_file, 'r', encoding='utf-8') as f:
            canvas_content = f.read()
        
        prompt = f"""
        You are a Senior Software Architect. Update the existing REASONS Canvas based on the 
        provided instruction. Only modify the sections affected by the change and preserve 
        everything else.

        Existing Canvas:
        {canvas_content}

        Update Instruction:
        {update_instruction}

        Provide the complete updated Canvas, clearly marking what sections were changed and why.
        Maintain the same structure and format as the original.
        """
        
        response = self.llm.chat(prompt)
        
        # Create backup and update
        backup_path = f"{canvas_file}.backup.{datetime.now().strftime('%Y%m%d%H%M%S')}"
        os.rename(canvas_file, backup_path)
        
        with open(canvas_file, 'w', encoding='utf-8') as f:
            f.write(response)
        
        return f"Canvas updated. Backup saved to {backup_path}"
    
    def spdd_sync(self, canvas_file: str, code_changes: str) -> str:
        """
        /spdd-sync: Synchronizes code-side changes back into the Canvas
        """
        # Read existing canvas
        with open(canvas_file, 'r', encoding='utf-8') as f:
            canvas_content = f.read()
        
        prompt = f"""
        You are a Senior Software Architect. Synchronize the provided code changes back into 
        the REASONS Canvas to keep it accurate with the current implementation.

        Existing Canvas:
        {canvas_content}

        Code Changes to Sync:
        {code_changes}

        Update the relevant sections of the Canvas (likely Operations, Structure, and possibly Norms)
        to reflect these code changes. Maintain accuracy between the Canvas and actual implementation.
        """
        
        response = self.llm.chat(prompt)
        
        # Create backup and update
        backup_path = f"{canvas_file}.backup.{datetime.now().strftime('%Y%m%d%H%M%S')}"
        os.rename(canvas_file, backup_path)
        
        with open(canvas_file, 'w', encoding='utf-8') as f:
            f.write(response)
        
        return f"Canvas synchronized with code changes. Backup saved to {backup_path}"
    
    def _scan_codebase(self, codebase_path: str) -> str:
        """Scan existing codebase for context"""
        context = []
        
        # Common file extensions to scan
        extensions = ['.py', '.js', '.ts', '.java', '.go', '.rs', '.cpp', '.h']
        
        for root, dirs, files in os.walk(codebase_path):
            # Skip hidden directories and common ignore patterns
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__', 'target', 'build']]
            
            for file in files:
                if any(file.endswith(ext) for ext in extensions):
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            context.append(f"File: {file_path}\n{content[:1000]}...")  # First 1000 chars
                    except:
                        continue
        
        return "\n\n".join(context[:20])  # Limit to first 20 files