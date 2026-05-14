import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — ClauseIQ MVP",
  description: "How ClauseIQ handles your data and third-party services"
};

export default function PrivacyPage() {
  return (
    <main className="container">
      <section className="card max-w-3xl">
        <h1 className="title">Privacy</h1>
        <p className="subtitle">ClauseIQ MVP — data handling and subprocessors</p>

        <div className="prose-privacy mt-4 space-y-4 text-sm leading-relaxed text-slate-700">
          <p>
            ClauseIQ processes commercial lease documents and form inputs you provide to produce risk summaries and
            quantified estimates. This page summarizes what leaves your browser, what we store, and which third-party
            APIs may receive limited content for classification and embeddings.
          </p>

          <h2 className="text-base font-semibold text-slate-900">What we store</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Uploaded lease files (base lease and redlined turn) in protected object storage associated with your
              account, plus analysis metadata (property inputs, totals, and per-change outputs).
            </li>
            <li>
              Account identifiers needed for authentication. We do not use uploaded documents for unrelated marketing
              or model training in this MVP unless separately disclosed.
            </li>
          </ul>

          <h2 className="text-base font-semibold text-slate-900">Third-party processing</h2>
          <p>
            To classify changes and match clause patterns, short excerpts derived from your redlines (plus surrounding
            context constructed on our servers) may be sent to model providers for inference. Embeddings used for
            retrieval may be computed via an embedding API. Document content is not shared beyond what is required for
            these requests; providers process data under their own terms and security programs.
          </p>
          <p>
            When your deployment uses an optional document extraction service (configured via{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">PARSER_SERVICE_URL</code>
            ), uploaded lease files may be transmitted to that service for parsing. Scope that processing under your own
            deployment&apos;s policies and data-processing agreements.
          </p>

          <h2 className="text-base font-semibold text-slate-900">Security</h2>
          <p>
            Transport uses HTTPS. Stored objects rely on the hosting provider&apos;s encrypted storage and database
            controls. Access to analyses is scoped to the authenticated user who created them.
          </p>

          <h2 className="text-base font-semibold text-slate-900">Retention and deletion</h2>
          <p>
            Retention follows your deployment configuration and administrator practices. Contact your workspace owner or
            administrator for deletion requests tied to a specific tenant or pilot program.
          </p>

          <p className="text-xs text-slate-500">
            This notice supports the ClauseIQ MVP pilot and is not a substitute for a full enterprise privacy policy or
            executed data processing agreement.
          </p>

          <p>
            <Link className="nav-link" href="/">
              Back to ClauseIQ
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
