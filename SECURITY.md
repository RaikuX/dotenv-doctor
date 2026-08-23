# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| latest  | yes       |
| older   | no        |

## Reporting a vulnerability

If you find a security issue in dotenv-doctor itself (for example: a way it prints secret values unmasked, a parsing bug that hides real credentials, or a dependency problem), please report it privately:

1. Use GitHub's **"Report a vulnerability"** button under the repository's Security tab, or
2. Email the maintainer directly if you cannot use GitHub.

Please include a reproduction using **fake values** shaped like the real thing (e.g. `AKIAIOSFODNN7EXAMPLE`). Do not post live credentials anywhere — not even encrypted, not even "temporarily".

You can expect an initial response within 7 days. We will credit reporters in the changelog unless they prefer anonymity.

## Scope notes

dotenv-doctor reads local files you point it at and never sends data anywhere. Reports about missed credential *classes* are welcome as regular public issues with redacted samples — reserve private reporting for issues that could expose users who follow the documented workflow.
