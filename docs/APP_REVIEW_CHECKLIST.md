# App-review checklist (ClipForge Phase 3)

Work through one platform at a time. Nothing here is submitted by the
agent: each item needs the owner's developer account, and each
platform decides on its own timeline. Until a platform's review is
approved, its feature flag and approval flag stay OFF and publishing
to it is refused with the reason stated — that is the designed
behavior, not a bug.

Common assets needed for every platform (prepare once, reuse):

- [ ] Privacy Policy URL: the live site's `/privacy` page (it already
  describes the publishing data flow: what leaves the site, where temp
  media lives, 24h deletion).
- [ ] Terms of Use URL: the live site's `/terms` page.
- [ ] Demo video: a short screen recording showing connect → compose →
  publish → analytics on the live site, using the owner's own account
  and the owner's own clip.
- [ ] Scopes justification: one sentence per scope, stating only what
  the upload flow needs (the minimal scope lists live in
  `lib/publish/platforms.ts` and are shown on the Accounts page).
- [ ] App icon + description: plain words, no earnings promises, no
  "copyright-free" claims anywhere in the listing.

## YouTube (Google Cloud) — build first, review first

- [ ] Google Cloud project → enable the YouTube Data API v3.
- [ ] OAuth consent screen: app name, support email, authorized
  domains, privacy + terms URLs. Publishing apps need verification.
- [ ] OAuth client (Web): authorized redirect URI
  `<NEXT_PUBLIC_SITE_URL>/api/accounts/youtube/callback`.
- [ ] Scopes requested (minimal, upload only):
  `https://www.googleapis.com/auth/youtube.upload`
  (plus `youtube.readonly` only for the analytics sync read).
- [ ] Paste `YOUTUBE_CLIENT_ID` + `YOUTUBE_CLIENT_SECRET` into Vercel,
  redeploy, connect a test account, publish a test Short, confirm the
  Shorts URL comes back.
- [ ] Complete Google's verification (demo video + justification);
  only then set `PUBLISH_YOUTUBE_ENABLED=true` and
  `YOUTUBE_APP_APPROVED=true` and redeploy.

## TikTok (Content Posting API)

- [ ] TikTok for Developers app; request the Content Posting API
  product (it is gated — approval is not automatic).
- [ ] Redirect URI
  `<NEXT_PUBLIC_SITE_URL>/api/accounts/tiktok/callback`.
- [ ] Scopes (minimal): `video.upload` (posting) and `user.info.basic`
  (account identity for the account list).
- [ ] Paste `TIKTOK_CLIENT_ID` + `TIKTOK_CLIENT_SECRET`, redeploy,
  connect, and confirm the honest stub refusal until the real adapter
  lands (Phase 3 ships the stub; the adapter is a later slice).
- [ ] Only after product approval + adapter: set
  `PUBLISH_TIKTOK_ENABLED=true` and `TIKTOK_APP_APPROVED=true`.

## Instagram + Facebook (Meta Graph API, Reels)

- [ ] Meta for Developers app; add the Instagram Graph API and
  Facebook Login products. Reels publishing needs an Instagram
  Business/Creator account linked to a Facebook Page.
- [ ] Redirect URIs
  `<NEXT_PUBLIC_SITE_URL>/api/accounts/instagram/callback` and
  `.../facebook/callback`.
- [ ] Scopes (minimal): `instagram_basic`,
  `instagram_content_publish`, `pages_show_list`,
  `pages_read_engagement` (Facebook Page link for Reels).
- [ ] Paste `INSTAGRAM_*` + `FACEBOOK_*` credentials, redeploy,
  connect, and confirm the honest stub refusal until the real
  adapters land.
- [ ] Complete Meta App Review (demo video must show the Reels
  publish flow end to end); only then set the two platforms' flags
  and approval flags.

## X

- [ ] X Developer Portal app (Elevated or higher for media upload +
  posting; the free tier does not cover this flow).
- [ ] Redirect URI
  `<NEXT_PUBLIC_SITE_URL>/api/accounts/x/callback`. PKCE S256 is used
  by the app's OAuth flow.
- [ ] Scopes (minimal): `tweet.read`, `tweet.write`, `users.read`,
  `media.write` (v2 upload for video).
- [ ] Paste `X_CLIENT_ID` + `X_CLIENT_SECRET`, redeploy, connect, and
  confirm the honest stub refusal until the real adapter lands.
- [ ] Only after approval + adapter: set `PUBLISH_X_ENABLED=true` and
  `X_APP_APPROVED=true`.

## LinkedIn

- [ ] LinkedIn Developer Portal app; request the Share on LinkedIn and
  Video upload products (both are gated).
- [ ] Redirect URI
  `<NEXT_PUBLIC_SITE_URL>/api/accounts/linkedin/callback`.
- [ ] Scopes (minimal): `openid`, `profile`, `w_member_social`
  (member post with video).
- [ ] Paste `LINKEDIN_CLIENT_ID` + `LINKEDIN_CLIENT_SECRET`, redeploy,
  connect, and confirm the honest stub refusal until the real adapter
  lands.
- [ ] Only after product approval + adapter: set
  `PUBLISH_LINKEDIN_ENABLED=true` and `LINKEDIN_APP_APPROVED=true`.

## After any platform goes live

- [ ] Publish one real post from the live site to that platform and
  confirm the per-platform status, the provider URL, and the analytics
  sync row (YouTube) or the honest unsupported note (others).
- [ ] Confirm temp media for the post is deleted from storage.
- [ ] Confirm a refused case still refuses: turn the approval flag off
  temporarily and confirm publish is refused with the reason stated,
  then turn it back on.
