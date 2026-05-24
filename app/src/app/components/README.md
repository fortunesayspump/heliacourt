# App Components

Components are grouped by product domain instead of page ownership.

- `cases/`: case filing, case detail, transcript, follow/funding, and private unlock components.
- `layout/`: app shell components shared across pages.
- `markets/`: prediction-market logos, URL filing, images, and provider helpers.
- `profile/`: wallet profile/account surface.
- `wallet/`: wallet connection, balances, Circle Gateway, and wallet notices.
- `x402/`: browser x402 paid-read playground.

Keep reusable helpers close to the domain that owns them. If a component becomes cross-domain, move it deliberately into `layout/` or a new domain folder instead of putting new files at this root.
