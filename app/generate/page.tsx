import type { Metadata } from "next";
import GenerateTool from "@/components/GenerateTool";

/**
 * AI Generate Short (ClipForge Phase 17).
 *
 * Topic in, original short out — no link anywhere in this flow.
 * AI writes a script from a topic (or splits the user's own
 * script), each line is matched with a licence-verified
 * free-licence video or footage the user uploads, and the browser
 * renders one vertical captioned short with the same export and
 * post options as the clipper tool.
 */

export const metadata: Metadata = {
  title: "AI Generate Short — AI Video Clipper",
  description:
    "Type a topic and AI writes a brand-new short script, matches each line with free-licence footage, and renders a vertical captioned short — no link needed.",
};

export default function Generate() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          AI Generate Short
        </h1>
        <p className="mt-2 text-muted-foreground">
          Type a topic and get an original short: AI script,
          free-licence visuals, burned-in captions, and the same
          downloads and post options as clipping — without
          uploading or linking any video.
        </p>
      </section>
      <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Have a video of your own?{" "}
        <a href="/create" className="font-medium text-primary underline">
          Clip it instead
        </a>{" "}
        — upload it and cut moments from it, rather than generating
        from a topic.
      </p>
      <GenerateTool />
    </div>
  );
}
