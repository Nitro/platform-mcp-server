Things to note.

* We are using uv for dependency management and running the project, for example `uv add` to add a dependency,
  `uv run pytest` to run the project, etc.
* This is a Python 3.14 project
  DO NOT USE `from __future__ import annotations` as it is not needed in Python 3.14
  DO NOT USE STRING TYPES, as they are not needed in Python 3.14
* Linting/formatting: we use ruff, `uv run ruff check --fix FILES` must run on all files you edit.
  Sometimes, for things like moving things to the TYPE_CHECKING block you may need to use # noqa: XXXX but this should
  be the exception, not the rule.
* Type safety: we use pyright in strict mode for type safety, `uv run pyright FILES` must pass without errors
  on all files you edit. # type: ignore or # pyright: ignore can ONLY be used if you have a very good reason and
  you must request permission from the user to use it.
* Testing: check existing tests to see our approach to tests. When testing an MCP tool call, make sure to assert the
  structured content return as well as any/all mocked handlers/clients via assert_called_once_with or similar.
  `uv run pytest FILES` must pass without errors on all files you edit.



Finally, make sure to read the project specific style guide @./style-guide.md before making any code changes.
