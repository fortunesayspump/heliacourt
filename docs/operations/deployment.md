# docs.heliacourt.xyz deployment

Deploy the `docs` directory as a standalone Next.js project.

## Vercel

- Root directory: `docs`
- Install command: `pnpm install`
- Build command: `pnpm build`
- Output directory: `.next`
- Production domain: `docs.heliacourt.xyz`

The public app stays at `app.heliacourt.xyz`, and the marketing site stays at `heliacourt.xyz`.

## Local

```bash
pnpm dev:docs
```

The local docs server runs on `http://localhost:3002`.
