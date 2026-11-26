# The refresh check (frozen)

One check, the same words for every app. The fixing agent never sees this file's
directory and cannot edit it; `f5.mjs` records its SHA-256 before and after each round.

---
Open {{base}}/ and assert that the app's home page loads with real content.
Then navigate directly to {{base}}{{route}} . This is the request a browser sends when a visitor presses refresh on that page, or opens a link to it that a friend shared.
Assert that the page shows the app's {{screen}}.
Assert that the page is not a host error page such as "404: NOT_FOUND" or "Page not found".
