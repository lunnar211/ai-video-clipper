/**
 * Marketing homepage copy (ClipForge Phase 7, revised Phase 10).
 *
 * 100% ORIGINAL copy for the AI Video Clipper. Nothing here is copied
 * from the reference site: no borrowed headlines, no competitor prices,
 * no unverified claims. Numbers in this copy come only from this repo:
 * limits from the tool itself, the language count from the translation
 * list, plan limits from the billing config (rendered separately).
 *
 * Honesty invariants (pinned by tests/marketing.test.ts and
 * tests/phase10-real.test.ts):
 * - no prices anywhere (billing prices are unset — "coming soon")
 * - no "100+" languages, no "10k+" clips, no earnings promises
 * - no "copyright-free" claims, no paste-any-link flow: paste is
 *   described only for verified free-licence links (Phase 11), and
 *   YouTube / TikTok / Instagram links are stated as refused
 * - features described are built, or their gated state is stated
 * - NO demo content: Phase 10 deleted the illustrated demo section
 *   entirely. The homepage shows the real tool, not drawings, and
 *   nothing here pretends a preview is output.
 */

import { TRANSLATION_LANGUAGES } from "@/lib/ai/languages";

/** Firsthand count — do not hardcode; the list is the source of truth. */
export const TRANSLATION_COUNT = TRANSLATION_LANGUAGES.length;

export type MarketingFeature = { title: string; body: string };
export type MarketingStep = { title: string; body: string; proof: string };
export type MarketingFaq = { q: string; a: string };

export const HERO = {
  eyebrow: "For videos you own",
  title: "Turn a video you own into vertical clips",
  sub: "Upload a video you own. AI transcribes it, picks the moments worth posting, and renders captioned 9:16 clips for TikTok, Reels, and Shorts — in your browser.",
  reassurance:
    "No account needed to try. Your video never leaves your device; only the audio track goes out for transcription, and only when AI is connected.",
  rightsNote:
    "Clip only videos you recorded or own the rights to, or videos with a verified free licence. This tool never downloads videos from YouTube, TikTok, or Instagram.",
};

export const VALUE_STRIP = {
  title: "One video you own, several ready-to-post clips",
  body: "Record once, keep the moments that land, and post them as vertical clips.",
};

export const FEATURES: MarketingFeature[] = [
  {
    title: "AI finds the moments",
    body: "Transcription plus highlight picking surfaces the strongest 15–60 second moments, scored by hook, pacing, and engagement. No AI key? Cut moments by hand instead.",
  },
  {
    title: "Word-level captions",
    body: "Captions timed to each spoken word, with styles you can tune — plus a brand kit for your colors and fonts.",
  },
  {
    title: "Face-centered vertical crop",
    body: "On-device face detection centers the 9:16 window on the speaker, with a content-aware fallback when no face is found.",
  },
  {
    title: `Captions in ${TRANSLATION_COUNT} languages`,
    body: "Translate your transcript and captions across the curated language list, with the original text kept as a fallback when a translation fails.",
  },
  {
    title: "Thumbnails that fit the clip",
    body: "Best-frame thumbnails with a text overlay, picked from the clip itself.",
  },
  {
    title: "Share links with real view counts",
    body: "Public share links for finished clips, with the view counts the link itself recorded — never invented numbers.",
  },
  {
    title: "Multi-platform export",
    body: "One render, sized for TikTok, Instagram Reels, and YouTube Shorts — 9:16 vertical, with each platform's length limits respected.",
  },
  {
    title: "Schedule and queue posts",
    body: "Queue posts to the accounts you connected. Publishing stays off for a platform until its app review is approved.",
  },
  {
    title: "Chat-driven clip tools (MCP)",
    body: "Search your clips and check post status from an AI assistant over MCP. Reads are open; writes stay off unless the owner enables them.",
  },
  {
    title: "Search your own clips",
    body: "Prompt search across your projects finds a moment by what was said, not just by its title.",
  },
];

/** Output-platform strip shown under the hero (platform names only). */
export const PLATFORM_STRIP =
  "Exports ready for TikTok, Instagram Reels, and YouTube Shorts.";

export const STEPS: MarketingStep[] = [
  {
    title: "Upload a video you own",
    body: "Drop a recording into the upload box. The video stays in your browser; only its audio track leaves it, and only for transcription.",
    proof: "Up to 10 minutes and 500 MB in the browser.",
  },
  {
    title: "AI finds the moments",
    body: "Transcript, highlights, and a viral score for each moment — then you keep, trim, or re-pick any of them.",
    proof: "Without AI keys, you pick moments by hand and nothing breaks.",
  },
  {
    title: "Render, share, and schedule",
    body: "Render vertical clips with burned-in captions, then download them, share a link, or queue the post.",
    proof: "720×1280 vertical output, MP4 where your browser supports it, otherwise WebM.",
  },
];

export const PLANS_NOTE =
  "Pricing is coming soon. The limits below are placeholders until the owner confirms them — no price is set, and no payment details are collected anywhere on this site.";

export const HOME_FAQS: MarketingFaq[] = [
  {
    q: "Can I paste a YouTube, TikTok, or Instagram link?",
    a: "No. Links from those platforms are refused, and there is no downloader — clipping other people's videos risks copyright strikes. You can upload a video file, or paste a link to a video with a verified free licence from Wikimedia Commons or Internet Archive: the licence is checked before anything loads, and attribution is added automatically.",
  },
  {
    q: "What leaves my browser?",
    a: "Your video file never leaves your browser. Transcription sends only the extracted audio track, highlight picking sends only transcript text, and captions, cropping, and rendering all happen on your device.",
  },
  {
    q: "What if no AI key is configured?",
    a: "Transcription, highlights, and voiceover answer honestly that AI is not connected yet. Manual clipping, captions you type yourself, rendering, and SRT downloads all still work.",
  },
  {
    q: "What are the size and length limits?",
    a: "Videos up to 10 minutes and 500 MB. Clips up to 3 minutes. Clips from the clipper are 720×1280 vertical video; generated shorts also come in 1280×720 and 720×720.",
  },
  {
    q: "Do I need an account or payment?",
    a: "No. The clipper works without an account in its free browser mode. Sign-in, publishing, and paid tiers exist only when the server is configured for them.",
  },
];
