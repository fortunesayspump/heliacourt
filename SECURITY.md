# Security

Please do not open public issues for vulnerabilities or leaked credentials.

Report security issues privately to the maintainers. Include:

- affected package or route,
- reproduction steps,
- impact,
- any relevant logs with secrets redacted.

## Secret Hygiene

- Never commit `.env`, `.env.local`, private keys, bot tokens, database URLs, Redis URLs, deployment tokens, or wallet seed material.
- Rotate any credential that has been pasted into chat, committed, logged, or shared outside the deployment platform.
- Treat generated hearing logs and local scratch captures as non-public unless reviewed and redacted.
