# Work in Progress · Triangle launch

## Design direction

A local invitation for professionals, mentors, and mentees in Raleigh, Durham, and Chapel Hill to share what they are building with AI. The page's job is to explain the community and invite a thoughtful application.

Choosing an open, text-led community invitation over a fullscreen WebGL masthead because the first screen must explain who the group is for and how to join. Keep the existing sunset palette and Syne typography; accept a quieter first impression in exchange for clarity and mobile performance.

Existing tokens: page #FDEEE6, raised surface #FFF6EF, primary ink #4A2B12, secondary ink #86583A, accent #BC6315, sunset #FFAC26 → #FFB68A → #FFBABA → #D29CFF. Fix tertiary text contrast by using secondary ink for readable small text. Existing spacing scale, 16px cards, pill actions. Display Syne 800, body Syne 400, headings 700. Headline 34–58px responsive, body 18–20px, labels 14–16px. No new animation; reduced-motion respects native navigation.

Layout: compact public navigation → split hero (clear copy + sunset brand mark) → about / shared activities → live Luma calendar → application → FAQ → contact footer. Signature: the original brand sunburst on a sunset field paired with a plain-language invitation. No counters, invented metrics, or automatic Slack access. No photo required for launch: originals remain local until specifically selected.

## Implementation invariants

- Production excludes design-system and canvas route imports; development retains direct routes.
- No home address is stored in public source, markup, event copy, or metadata.
- Application success is shown only after the email provider accepts the application.
- Applications go only to hello@timrosenberg.com, with manual Slack invitation afterward.
- Luma's native calendar embed is the source of upcoming events, avoiding duplicated listings.
- Secrets remain server-side. Missing delivery configuration produces a clear unavailable state.

## Decisions

Use a Vercel Node function plus Resend for delivery rather than mailto-only forms: automatic delivery is required, accepting a verified sender/API key setup. Add Cloudflare Turnstile verification for public submissions, accepting public site-key and server secret setup. Fail closed if either service is missing. Do not create accounts, spend money, or invent credentials.

Use Luma's supported calendar iframe rather than scraping events or maintaining a duplicate database. The existing calendar ID and embed URL were verified in the signed-in Luma Settings → Embed page.

## Remaining launch gates

- Configure verified Resend sender, API key, Turnstile keys, and production allowed origins.
- Exercise a real test application and confirm receipt in Tim's inbox.
- Review Friendsgiving event and hidden-address settings in Luma.
- Preview approval, domain selection/purchase, then production publication.
