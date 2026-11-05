# Verification · October 24, 2026

- `npm test`: 23 tests pass. Covers valid delivery with mocked providers, fixed recipient and Reply-To, optional LinkedIn, field validation, consent, header injection, unsafe URLs, body limit, malformed JSON, origin checks, honeypot, challenge action/hostname, malformed provider responses, provider/network failures, and retry idempotency header.
- `npm run build`: succeeds. Production JavaScript is approximately 276 KB before compression (86.5 KB gzip), down from the prior approximately 1.13 MB bundle after excluding internal tools and the WebGL hero.
- `npm run lint`: succeeds with eight pre-existing warnings in unused hero code, canvas hooks, and UI component exports. No new warnings remain.
- `git diff --check`: passes.
- Browser: desktop hero, application navigation, FAQ expansion, and live Luma embed verified. The calendar currently reports no upcoming events.
- Mobile: actual homepage loaded in a 390px iframe; document client width and scroll width both 390px. Screenshot verified stacked navigation, hero, and application fields. The browser viewport override did not change Chrome's viewport, so the iframe was used explicitly instead.
- Keyboard: Tab from name → email → location → work → interest → LinkedIn → consent; visible solid focus outlines observed. Native FAQ expansion verified. No screen-reader audio session or full WCAG audit was performed.
- Production preview: both `/canvas` and `/design-system` render Page not found. Bundle markers for canvas overrides, theme axes, and the old hero scene are absent.
- Endpoint: local GET `/api/application` returns `{"ready":false,"siteKey":null}` without service credentials. Form displays an explicit email fallback and disables automatic submission.
- Existing temporary app tunnel returns the updated HTML successfully. This static preview does not execute the Vercel application function.
- Real Resend delivery, real Turnstile completion, Vercel deployment, domain checkout, and event publication are NOT verified or complete.

## Contrast samples (WCAG sRGB)

| Pair | Ratio | Threshold | Result |
| --- | --- | --- | --- |
| Primary #4A2B12 on page #FDEEE6 | 11.27:1 | 4.5:1 body | Pass |
| Secondary #86583A on page #FDEEE6 | 5.34:1 | 4.5:1 body | Pass |
| Secondary #86583A on raised #FFF6EF | 5.67:1 | 4.5:1 body | Pass |
| Focus #BC6315 on raised #FFF6EF | 3.99:1 | 3:1 UI | Pass |
| Input border #A97C58 on page #FDEEE6 | 3.25:1 | 3:1 UI | Pass |
| Notice #7A3F0C on #FFE3C4 | 6.70:1 | 4.5:1 body | Pass |

These are computed pair samples, not a claim of a full accessibility audit. Field names come from native labels; the application result uses a polite status region and receives focus after a submission attempt. Actual success-state screen-reader behavior remains unverified until services are configured.
