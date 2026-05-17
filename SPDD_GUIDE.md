# SPDD - Structured Prompt-Driven Development

## What is SPDD?

Structured Prompt-Driven Development (SPDD) is an engineering method that treats prompts as first-class artifacts in software development. Instead of relying on ad-hoc chats, SPDD converts prompts into assets that can be:

- ✅ Versioned and controlled
- ✅ Reviewed by the team
- ✅ Reused across projects
- ✅ Improved iteratively

## Main Components

### 1. REASONS Canvas
A 7-part structure that guides a prompt from intent to execution:

- **R** - Requirements: What problem are we solving and what is the definition of done?
- **E** - Entities: Domain entities and their relationships
- **A** - Approach: Strategy for how to meet the requirements
- **S** - Structure: Where the change fits in the system
- **O** - Operations: Decomposition into concrete, implementable steps
- **N** - Norms: Cross-cutting engineering norms
- **S** - Safeguards: Non-negotiable limits

### 2. SPDD Workflow
The workflow brings prompts to the same discipline as code:

1. **Create user story** → `spdd-story`
2. **Strategic analysis** → `spdd-analysis`
3. **Generate REASONS canvas** → `spdd-reasons-canvas`
4. **Generate code** → `spdd-generate`
5. **Update/sync** → `spdd-prompt-update` / `spdd-sync`

## Available Commands

### CLI
Create user stories

```bash
python spdd_cli.py spdd-story "requirement text"
```

Generate analysis

```bash
python spdd_cli.py spdd-analysis story_file.md
```

Create REASONS canvas

```bash
python spdd_cli.py spdd-reasons-canvas analysis_file.md
```

Generate code

```bash
python spdd_cli.py spdd-generate canvas_file.md
```

Update canvas

```bash
python spdd_cli.py spdd-prompt-update canvas_file.md --update "instruction"
```

Sync code changes

```bash
python spdd_cli.py spdd-sync canvas_file.md --update "code changes"
```

### Web Interface

Launch web interface

```bash
streamlit run spdd_web.py
```

## Usage Example

### 1. Create User Story

```bash
python spdd_cli.py spdd-story "We need to implement multi-plan billing with model-based pricing for our AI service"
```

### 2. Generate Analysis

```bash
python spdd_cli.py spdd-analysis spdd/stories/STORY-20241220120000.md --codebase ./src
```

### 3. Create REASONS Canvas

```bash
python spdd_cli.py spdd-reasons-canvas spdd/analysis/ANALYSIS-20241220120500.md
```

### 4. Generate Code

```bash
python spdd_cli.py spdd-generate spdd/canvas/CANVAS-20241220121000.md
```

## Key Benefits

### Immediate
- ✅ **Determinism**: Precise specification reduces hallucinations
- ✅ **Traceability**: Every change traceable to the structured prompt
- ✅ **Faster reviews**: Code arrives closer to standards

### Short Term
- ✅ **Explainability**: Intent visible at natural language level
- ✅ **Safer evolution**: Well-defined limits

### Long Term
- ✅ **Reusable assets**: Library of successful prompts
- ✅ **Team consistency**: Same process for everyone

## Three Key Skills

### 1. Abstraction First
Design before generating. Clarity about objects, collaborations, and limits.

### 2. Alignment
Lock intent before writing code. Make explicit "what we will do / what we won't do".

### 3. Iterative Review
Convert output into a controlled loop. Engineering process, not a single draft.

## When to Use SPDD

### ⭐⭐⭐⭐⭐ Highly Recommended
- Scaled and standardized delivery
- High compliance and hard restrictions
- Team collaboration and auditability

### ⭐⭐⭐⭐☆ Recommended
- Cross-cutting consistency work
- Complex refactors

### ⭐⭐☆☆☆ Limited Cases
- Emergency hotfixes
- Exploratory spikes
- One-off scripts

### ⭐☆☆☆☆ Not Recommended
- Poorly defined domains
- Purely creative/visual work

## File Structure

```
spdd/
├── canvas/     # Generated REASONS canvases
├── stories/    # User stories
├── analysis/   # Strategic analyses
└── commands.py # SPDD commands

generated/      # Generated code
spdd_cli.py     # CLI
spdd_web.py     # Web interface
```

## Next Steps

1. **Install dependencies**: `pip install litai streamlit`
2. **Try CLI**: Run first command `spdd-story`
3. **Use web interface**: `streamlit run spdd_web.py`
4. **Iterate and improve**: Refine prompts based on results

The goal is to make AI-assisted changes governable, reviewable, and reusable, so teams are faster AND safer.
