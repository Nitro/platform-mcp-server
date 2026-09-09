Start by reading `CLAUDE.md` for project context — do not flag patterns listed there as intentional choices.

Be pragmatic: strike a good balance between code quality and utility. Follow the YAGNI principle — simple is better than complex. Do not flag things that don't matter in practice.

Focus on:
- Bugs, security vulnerabilities
- Race conditions, memory leaks, misplaced business logic
- Significant structural issues

Use inline comments for specific line-level issues. Use a top-level comment only for a brief overall summary or if there are no issues.

For each inline comment, include a concise prompt that can be copied and pasted to another agent to fix it. Provide the files and line numbers. Put it in a code block so it can be easily copied.
