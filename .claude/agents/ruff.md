---
name: ruff
description: Runs ruff linting on edited files. Use after any code changes to check and auto-fix linting issues.
tools:
  - Bash
---

Run `uv run ruff check --fix` on the files provided, then report any remaining errors that could not be auto-fixed.
