# Helia Court Marketing

Public website for the product story, protocol overview, Telegram entry points, screenshots, and builder-facing x402/Arc messaging.

## Source Layout

```text
app/
  components/  Shared marketing navigation, reveal, image, and sticker components
  agents/      Agent/witness marketing page
  docs/        Public docs landing route
  help/        Public help route
  protocol/    Arc, x402, Gateway, and receipt explanation page
  page.tsx     Home page
public/
  assets/      Marketing media and generated visual assets
```

## Commands

```bash
pnpm --dir marketing dev
pnpm --dir marketing build
```

## Notes

- The app is static/marketing-first; product actions should link into the main app or Telegram.
- Keep heavy media in `public/assets/` and prefer compressed formats where visual quality allows.
- Navigation and footer behavior live in `app/components/Nav.tsx` and `app/components/AfterHeroNav.tsx`.
