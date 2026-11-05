# Launch on Vercel

The existing local Vercel link identifies project `wip`. No production deployment has been made by this update. The signed-in browser currently requires Vercel login.

## Configure applications

Set the following in Vercel Project → Settings → Environment Variables for the desired deployment environments. Use `.env.local` for local work; it is Git-ignored. Never paste credentials into chat or commit them.

| Variable | Value |
| --- | --- |
| RESEND_API_KEY | API key permitted to send email |
| APPLICATION_FROM_EMAIL | A sender on a domain verified in Resend, e.g. Work in Progress <applications@your-verified-domain> |
| TURNSTILE_SITE_KEY | Public widget site key |
| TURNSTILE_SECRET_KEY | Server verification secret |
| APPLICATION_ALLOWED_ORIGINS | Exact permitted origins separated by commas; include the Vercel preview/production URL and chosen custom domain as applicable |

Create a Turnstile widget for the relevant hostnames. The server checks that the verified token's hostname matches an allowed origin and its action is `apply`. Neither service is optional in the automatic submission path. The form fails closed with an email fallback until all required settings exist.

Applications are emailed only to hello@timrosenberg.com with the applicant as Reply-To. The function validates answers server-side, limits the body to 16 KiB, checks consent and exact origin, rejects the honeypot, verifies the challenge, and uses a Resend idempotency key for retries. No submissions are stored in browser localStorage. There is no automatic Slack invitation.

Configure service quotas/alerts for the public form. Turnstile is the spam gate; this implementation does not have a durable per-IP rate-limit database.

## Verify and preview

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. For local work run `npm run dev`. The Vite plugin serves `/api/application`; it reads `.env.local` on startup. Restart after changing local env settings.
3. Deploy a Vercel Preview, then set its exact origin and permitted Turnstile hostname. Vite's `npm run preview` serves static files only; it does not run Vercel Functions.
4. Send one clearly labeled test application after configuring services. Confirm actual receipt in Tim's inbox, Reply-To, optional LinkedIn behavior, retry handling, error state, and manual Slack follow-up. Tests currently use mocked providers; real delivery is not yet verified.
5. Test the public `/canvas` and `/design-system` routes: both should show the not-found page. Source tools are available only in development and are absent from production JavaScript chunks.
6. Review at desktop and phone widths, keyboard focus, the Luma calendar, and social-sharing metadata.

## Luma

Calendar: https://luma.com/work-in-progress-raleigh

Verified embed: https://luma.com/embed/calendar/cal-F949eHAMaWWgW78/events

Embed settings: https://luma.com/calendar/manage/cal-F949eHAMaWWgW78/settings/embed

Calendar events update directly through the supported Luma iframe; there is no API key or duplicate database. Private/unlisted events may not appear in the public calendar. The empty calendar state was verified on the site.

Friendsgiving is prepared in the existing Luma create-event tab: November 5, 2026, 6:30–9:00 PM America/New_York, Work in Progress calendar, unlisted, approval required. The private venue is entered in Luma, not in public source. Saving is pending action-time confirmation required by automatic approval review. Verify restricted address visibility before sharing or listing it publicly. No invitations or newsletters have been sent.

## Domain findings — October 24, 2026

Registry RDAP lookup returned records for `workinprogress.com` and `workinprogress.ai` (already registered). The `.ai` registry returned 404 “Object not found” for `workinprogresstriangle.ai`. That is a candidate, not a reservation or guarantee of registrar availability or price. No purchase was made.

Before production: choose a domain and approve its purchase/renewal cost; add it to Vercel, update DNS, confirm HTTPS, add its exact origin to the form configuration, and set absolute canonical, `og:url`, and `og:image` URLs in `index.html`. The current social image is `/social-card.png`; its editable source is `/social-card.svg`.

## Local media boundary

`design-system/` is explicitly excluded by `.vercelignore`; `.local` assets are also Git-ignored. No original or edited private event photos were added to the public website in this update. The previously requested temporary photo-gallery tunnel is a separate service.
