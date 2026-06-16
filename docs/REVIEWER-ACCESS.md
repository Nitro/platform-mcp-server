# Reviewer Access

This document is for Anthropic Software Directory reviewers verifying the Nitro PDF Services MCP server.

## Test account

Credentials and sign-in instructions for the reviewer account have been provided to your Anthropic contact through Anthropic's secure submission channel. If you did not receive them, contact `ivan.kalgashkin@gonitro.com`.

The account has API quota sufficient for a full functional sweep across all tools. If you need additional quota, contact `ivan.kalgashkin@gonitro.com` and we will adjust within one business day.

## Sample documents

Sample PDFs covering each tool category are in [`samples/`](../samples/):

| File | Purpose |
|---|---|
| `samples/invoice.pdf` | Multi-page text + tables — exercises `extract_pdf_text`, `extract_pdf_tables`, `search_text_in_pdf`. |
| `samples/contract.pdf` | Long-form text with names, emails, phone numbers — exercises `extract_pii`, `redact_pdf`. |
| `samples/form.pdf` | Fillable form fields — exercises `extract_pdf_forms`, `flatten_pdf`. |
| `samples/scan.pdf` | Scanned multi-page document — exercises `rotate_pdf`. |
| `samples/two-pager.pdf` | Two-page document — exercises `split_pdf`, `delete_pdf_pages`, `merge_files`. |
| `samples/photo.jpg` | Image input — exercises `convert_file` (image → PDF). |

All sample files are synthetic — no real personal or business data.

Before invoking tools, copy the sample files into your home directory (e.g. `~/Downloads/`).

## Suggested review prompts

These cover all 18 tools. Each is one prompt; Claude will route to the appropriate tool.

1. "List all PDFs in my Downloads folder." — `list_files`
2. "Convert ~/Downloads/photo.jpg to a PDF." — `convert_file`
3. "Merge invoice.pdf and two-pager.pdf in my Downloads folder into one PDF." — `merge_files`
4. "Split ~/Downloads/two-pager.pdf into one PDF per page." — `split_pdf`
5. "Delete page 2 from ~/Downloads/two-pager.pdf." — `delete_pdf_pages`
6. "Rotate all pages in ~/Downloads/scan.pdf 90 degrees clockwise." — `rotate_pdf`
7. "Flatten the form fields in ~/Downloads/form.pdf." — `flatten_pdf`
8. "Password-protect ~/Downloads/contract.pdf with the password 'review123'." — `protect_pdf`
9. "Remove the password 'review123' from the protected PDF." — `unprotect_pdf`
10. "Extract all text from ~/Downloads/contract.pdf." — `extract_pdf_text`
11. "Extract all tables from ~/Downloads/invoice.pdf as Excel." — `extract_pdf_tables`
12. "Extract the form fields from ~/Downloads/form.pdf." — `extract_pdf_forms`
13. "Find all PII in ~/Downloads/contract.pdf." — `extract_pii`
14. "Redact the PII you just found from ~/Downloads/contract.pdf." — `redact_pdf`
15. "Search for the word 'invoice' in ~/Downloads/invoice.pdf." — `search_text_in_pdf`
16. "Show me the metadata for ~/Downloads/invoice.pdf." — `get_pdf_metadata`
17. "Set the title of ~/Downloads/contract.pdf to 'Reviewer Test'." — `set_pdf_metadata`

## Known scope and limitations

- The MCP server only operates on files within the user's home directory. Place sample PDFs in your home directory (e.g. `~/Downloads/`) before invoking tools.
- Tools write outputs as siblings of the input file with a non-clobbering suffix (`-merged`, `-rotated`, etc.); they never overwrite the input.
- The first tool call in a session triggers an OAuth sign-in flow in the browser. Subsequent calls in the same session do not require re-authentication.

## Support

For any issue blocking review: `ivan.kalgashkin@gonitro.com` (response within 1 business day).
