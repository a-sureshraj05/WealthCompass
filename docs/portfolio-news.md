# Portfolio news and enriched sign-in

Working branch: `design/local-portfolio-studio`. Not merged or deployed.
The separate signup/onboarding branch is excluded.

## Local review

- Sign-in design: http://127.0.0.1:5180/design-preview?screen=login
- Overview news: http://127.0.0.1:5180/design-preview?design=refined

The sign-in preview disables submission and skips the auth-status request.
Dashboard preview returns twenty explicitly fictional story examples through the
isolated preview adapter, so all four pages can be reviewed without a backend.
Those examples are never returned by the live endpoint.

The regular sign-in page now has a product introduction, an illustrative visual,
feature cards, an explanation of the workflow and account/data FAQs. On narrow
screens, sign-in appears first. Authentication, invitation policy and recovery-key
acknowledgement retain their existing behavior.

## Freshness and lifecycle

`AuthenticatedApp` owns `usePortfolioNews`. A new successful sign-in, registration
continuation or authenticated page reload mounts a fresh hook and requests
`POST /api/v1/news/refresh`. React StrictMode effect replay reuses the same pending
promise. Switching dashboard tabs retains the session feed without another call.
Logout removes that component/feed. No news is stored in localStorage or shared
across account sessions. Refresh news requests again; failed refreshes keep the
previous session feed visible with an explicit error and its original timestamp.

The endpoint uses the normal HttpOnly-cookie authentication and `get_user_scope`.
Only the signed-in user's encrypted holdings are read. Public ticker symbols go
to Yahoo Finance's per-symbol public RSS feed; account identity, holdings values,
quantities, credentials and portfolio weights do not leave the application.
There is no database migration or feed persistence. Browser requests use
`cache: no-store`; provider requests use `Cache-Control: no-cache` and a fresh
HTTP request, with no local provider response cache.

## Selection

1. Group the same ticker across brokerages, summing absolute market values,
   including option exposure already present in the derived holding value.
2. Check the twenty largest tickers. Report the number of holdings checked and
   their combined share of total absolute invested exposure. This is not ETF
   constituent look-through or complete market-wide news coverage.
3. Validate publisher, HTTPS link and timezone-aware publication time. Reject
   future-dated, older-than-seven-day, malformed or unsafe entries.
4. Deduplicate canonical link paths and normalized headline text, merging related
   portfolio tickers and their weights.
5. Score: `0.45 × sqrt(related weight) + 0.35 × event relevance + 0.20 × exp(-age hours / 36)`.
   Headline event keywords assign relevance 1.0 to major events (earnings, merger,
   bankruptcy, legal actions), 0.65 to business updates (dividend, forecast,
   product launch, rates) and 0.3 otherwise. This is a heuristic, not validated
   sentiment, a prediction of market impact or an investment recommendation.
6. Return up to twenty stories, limiting repeated company coverage to four.

The provider's short description is reduced to at most 260 characters / 40 words.
Only headlines and a brief preview are displayed. The full article stays at the
publisher. Missing descriptions are not invented. RSS aggregation without an
explicit source is attributed to Yahoo Finance.

## Presentation and resilience

Overview Snapshot adds Portfolio news below holdings/brokerage details. Existing
Overview performance stays unchanged. Five compact previews appear per page,
with numbered 1–4 buttons, source, time, category and related holding exposure.
Profile privacy hides story contents, related tickers and weights from the DOM.

Six shared provider workers and a 22-second total route deadline bound the
request. Individual HTTP calls have a six-second timeout and a two-megabyte
response cap. Queued requests are cancelled on the deadline; active worker
requests finish within their HTTP timeout. XML entities/DOCTYPE are rejected.
Per-user request metadata permits six requests per minute. One source failure
keeps other results available; all failures produce an unavailable state, never
sample financial news. The rate limit is in-process and needs shared storage
before scaling to multiple workers.

## Validation

Live provider verification on November 7, 2026 retrieved real RSS items for AAPL,
MSFT and NVDA and produced ten deduplicated, recent ranked stories. The initial
library news endpoint failed; the working public RSS endpoint is used directly.

Frontend coverage includes pagination, safe links/text, preview isolation,
privacy, login labels/disabled preview and unchanged Overview performance.
Backend coverage includes user isolation, authentication, freshness, exposure
weighting, ranking, deduplication, caps, partial failures, rate limiting and feed
parsing. Native-browser visual inspection remains unavailable without the macOS
permissions recorded in the local preview guide.
