# Optional Ralph config overrides.
# All paths are relative to repo root unless absolute.

# PRD_PATH=".agents/tasks/prd.json"
# PROGRESS_PATH=".ralph/progress.md"
# GUARDRAILS_PATH=".ralph/guardrails.md"
# ERRORS_LOG_PATH=".ralph/errors.log"
# ACTIVITY_LOG_PATH=".ralph/activity.log"
# TMP_DIR=".ralph/.tmp"
# RUNS_DIR=".ralph/runs"
# GUARDRAILS_REF=".agents/ralph/references/GUARDRAILS.md"
# CONTEXT_REF=".agents/ralph/references/CONTEXT_ENGINEERING.md"
# ACTIVITY_CMD=".agents/ralph/log-activity.sh"

# PRD_AGENT_CMD is intentionally not set so loop.sh falls back to run_agent (stdin pipe), which
# correctly substitutes {prompt} as a file path. Setting PRD_AGENT_CMD triggers run_agent_inline
# which substitutes the file *content* into the command, breaking "$(cat {prompt})" templates.
AGENT_CMD='codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "$(cat {prompt})"'

# AGENTS_PATH="AGENTS.md"
# PROMPT_BUILD=".agents/ralph/PROMPT_build.md"
# NO_COMMIT=false
# MAX_ITERATIONS=25
# STALE_SECONDS=0