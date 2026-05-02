#!/usr/bin/env python3
"""
SPDD CLI - Structured Prompt-Driven Development Command Line Interface
Usage:
    python spdd_cli.py spdd-story "requirement text"
    python spdd_cli.py spdd-analysis story_file.md
    python spdd_cli.py spdd-reasons-canvas analysis_file.md
    python spdd_cli.py spdd-generate canvas_file.md
    python spdd_cli.py spdd-prompt-update canvas_file.md "update instruction"
    python spdd_cli.py spdd-sync canvas_file.md "code changes"
"""

import argparse
import sys
from spdd.commands import SPDDCommands

def main():
    parser = argparse.ArgumentParser(description='SPDD CLI - Structured Prompt-Driven Development')
    parser.add_argument('command', choices=[
        'spdd-story', 'spdd-analysis', 'spdd-reasons-canvas', 
        'spdd-generate', 'spdd-prompt-update', 'spdd-sync'
    ])
    parser.add_argument('input', help='Input file or text')
    parser.add_argument('--update', help='Update instruction for spdd-prompt-update')
    parser.add_argument('--codebase', default='.', help='Codebase path for analysis')
    parser.add_argument('--model', default='openai/gpt-4', help='AI model to use')
    
    args = parser.parse_args()
    
    try:
        spdd = SPDDCommands(model=args.model)
        
        if args.command == 'spdd-story':
            result = spdd.spdd_story(args.input)
        elif args.command == 'spdd-analysis':
            result = spdd.spdd_analysis(args.input, args.codebase)
        elif args.command == 'spdd-reasons-canvas':
            result = spdd.spdd_reasons_canvas(args.input)
        elif args.command == 'spdd-generate':
            result = spdd.spdd_generate(args.input)
        elif args.command == 'spdd-prompt-update':
            if not args.update:
                print("Error: --update instruction required for spdd-prompt-update")
                sys.exit(1)
            result = spdd.spdd_prompt_update(args.input, args.update)
        elif args.command == 'spdd-sync':
            if not args.update:
                print("Error: --update (code changes) required for spdd-sync")
                sys.exit(1)
            result = spdd.spdd_sync(args.input, args.update)
        
        print(result)
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()