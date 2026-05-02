import streamlit as st
import os
from datetime import datetime
from spdd.commands import SPDDCommands

st.set_page_config(page_title="SPDD Workspace", layout="wide")

# Initialize SPDD
if 'spdd' not in st.session_state:
    st.session_state.spdd = SPDDCommands()

st.title("🏗️ SPDD - Structured Prompt-Driven Development")
st.markdown("*Make LLM-assisted changes governable, reviewable, and reusable*")

# Sidebar for navigation
st.sidebar.title("SPDD Workflow")
workflow_step = st.sidebar.selectbox(
    "Select Step",
    ["📋 Story Creation", "🔍 Analysis", "🎯 REASONS Canvas", "💻 Code Generation", "🔄 Updates & Sync"]
)

# Main content area
if workflow_step == "📋 Story Creation":
    st.header("Step 1: User Story Creation")
    st.markdown("Break large requirements into deliverable user stories following INVEST principles.")
    
    requirement_text = st.text_area(
        "Large Requirement",
        placeholder="Describe the large requirement that needs to be broken down into user stories...",
        height=200
    )
    
    if st.button("Generate User Stories", type="primary"):
        if requirement_text:
            with st.spinner("Generating user stories..."):
                result = st.session_state.spdd.spdd_story(requirement_text)
                st.success(result)
                
                # Show generated stories
                stories_dir = "spdd/stories"
                if os.path.exists(stories_dir):
                    story_files = [f for f in os.listdir(stories_dir) if f.endswith('.md')]
                    if story_files:
                        latest_story = max(story_files)
                        with open(f"{stories_dir}/{latest_story}", 'r') as f:
                            st.markdown("### Generated Stories")
                            st.markdown(f.read())

elif workflow_step == "🔍 Analysis":
    st.header("Step 2: Strategic Analysis")
    st.markdown("Extract domain keywords and produce strategic analysis from user stories.")
    
    col1, col2 = st.columns(2)
    
    with col1:
        # File selection
        stories_dir = "spdd/stories"
        story_files = []
        if os.path.exists(stories_dir):
            story_files = [f for f in os.listdir(stories_dir) if f.endswith('.md')]
        
        selected_story = st.selectbox("Select Story File", story_files)
        
        codebase_path = st.text_input("Codebase Path", value=".")
        
        if st.button("Generate Analysis", type="primary"):
            if selected_story:
                with st.spinner("Analyzing requirements and codebase..."):
                    story_path = f"{stories_dir}/{selected_story}"
                    result = st.session_state.spdd.spdd_analysis(story_path, codebase_path)
                    st.success(result)
    
    with col2:
        # Show latest analysis
        analysis_dir = "spdd/analysis"
        if os.path.exists(analysis_dir):
            analysis_files = [f for f in os.listdir(analysis_dir) if f.endswith('.md')]
            if analysis_files:
                latest_analysis = max(analysis_files)
                with open(f"{analysis_dir}/{latest_analysis}", 'r') as f:
                    st.markdown("### Latest Analysis")
                    st.markdown(f.read())

elif workflow_step == "🎯 REASONS Canvas":
    st.header("Step 3: REASONS Canvas Generation")
    st.markdown("Generate structured prompt canvas from strategic analysis.")
    
    col1, col2 = st.columns(2)
    
    with col1:
        # File selection
        analysis_dir = "spdd/analysis"
        analysis_files = []
        if os.path.exists(analysis_dir):
            analysis_files = [f for f in os.listdir(analysis_dir) if f.endswith('.md')]
        
        selected_analysis = st.selectbox("Select Analysis File", analysis_files)
        
        if st.button("Generate REASONS Canvas", type="primary"):
            if selected_analysis:
                with st.spinner("Generating REASONS Canvas..."):
                    analysis_path = f"{analysis_dir}/{selected_analysis}"
                    result = st.session_state.spdd.spdd_reasons_canvas(analysis_path)
                    st.success(result)
    
    with col2:
        # Show latest canvas
        canvas_dir = "spdd/canvas"
        if os.path.exists(canvas_dir):
            canvas_files = [f for f in os.listdir(canvas_dir) if f.endswith('.md')]
            if canvas_files:
                latest_canvas = max(canvas_files)
                with open(f"{canvas_dir}/{latest_canvas}", 'r') as f:
                    st.markdown("### Latest Canvas")
                    st.markdown(f.read())

elif workflow_step == "💻 Code Generation":
    st.header("Step 4: Code Generation")
    st.markdown("Generate implementation code from REASONS Canvas.")
    
    col1, col2 = st.columns(2)
    
    with col1:
        # File selection
        canvas_dir = "spdd/canvas"
        canvas_files = []
        if os.path.exists(canvas_dir):
            canvas_files = [f for f in os.listdir(canvas_dir) if f.endswith('.md')]
        
        selected_canvas = st.selectbox("Select Canvas File", canvas_files)
        
        if st.button("Generate Code", type="primary"):
            if selected_canvas:
                with st.spinner("Generating code..."):
                    canvas_path = f"{canvas_dir}/{selected_canvas}"
                    result = st.session_state.spdd.spdd_generate(canvas_path)
                    st.success(result)
    
    with col2:
        # Show latest generated code
        generated_dir = "generated"
        if os.path.exists(generated_dir):
            generated_files = [f for f in os.listdir(generated_dir) if f.endswith('.md')]
            if generated_files:
                latest_generated = max(generated_files)
                with open(f"{generated_dir}/{latest_generated}", 'r') as f:
                    st.markdown("### Latest Generated Code")
                    st.markdown(f.read())

elif workflow_step == "🔄 Updates & Sync":
    st.header("Step 5: Updates & Synchronization")
    st.markdown("Update prompts or sync code changes back to canvas.")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("Prompt Update")
        st.markdown("Update canvas when requirements change")
        
        canvas_dir = "spdd/canvas"
        canvas_files = []
        if os.path.exists(canvas_dir):
            canvas_files = [f for f in os.listdir(canvas_dir) if f.endswith('.md')]
        
        selected_canvas_update = st.selectbox("Select Canvas to Update", canvas_files, key="update")
        
        update_instruction = st.text_area(
            "Update Instruction",
            placeholder="Describe what needs to be updated in the canvas...",
            height=100
        )
        
        if st.button("Update Canvas"):
            if selected_canvas_update and update_instruction:
                with st.spinner("Updating canvas..."):
                    canvas_path = f"{canvas_dir}/{selected_canvas_update}"
                    result = st.session_state.spdd.spdd_prompt_update(canvas_path, update_instruction)
                    st.success(result)
    
    with col2:
        st.subheader("Code Sync")
        st.markdown("Sync code changes back to canvas")
        
        selected_canvas_sync = st.selectbox("Select Canvas to Sync", canvas_files, key="sync")
        
        code_changes = st.text_area(
            "Code Changes",
            placeholder="Describe the code changes that need to be synced back...",
            height=100
        )
        
        if st.button("Sync to Canvas"):
            if selected_canvas_sync and code_changes:
                with st.spinner("Syncing code changes..."):
                    canvas_path = f"{canvas_dir}/{selected_canvas_sync}"
                    result = st.session_state.spdd.spdd_sync(canvas_path, code_changes)
                    st.success(result)

# Footer
st.sidebar.markdown("---")
st.sidebar.markdown("### SPDD Files")
for dir_name in ["stories", "analysis", "canvas", "generated"]:
    dir_path = f"spdd/{dir_name}" if dir_name != "generated" else dir_name
    if os.path.exists(dir_path):
        files = [f for f in os.listdir(dir_path) if f.endswith('.md')]
        st.sidebar.markdown(f"**{dir_name.title()}:** {len(files)} files")