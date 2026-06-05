"use client";

import { useEffect, useState } from "react";

/**
 * Reader feedback widgets. Two skins, one contract:
 *  - `DocsRate`   — the per-PAGE rate block in the docs TOC rail (👍/👎 → reason
 *    + comment → submit).
 *  - `SectionRate`— the compact per-SECTION "Was this helpful? Yes/No" in the API
 *    reference; submits immediately, carrying which resource it was on.
 *
 * Both POST the same JSON shape to `config.feedback.endpoint` (or console.log
 * it when unset), so any sink works — a webhook, a Sheet, or the reference
 * `feedback-worker` template. Answers are remembered per (path, target) in
 * localStorage so readers aren't re-pestered.
 */

type Answer = "yes" | "no";
type Stage = "idle" | "form" | "done";

/** Reason chips differ by sentiment: positive asks what worked, negative asks
 *  what to improve. Same themes (onboarding, findability, clarity, accuracy). */
const POSITIVE_REASONS = [
  "Helped me get started",
  "Easy to find what I needed",
  "Clear and easy to understand",
  "Accurate and up to date",
  "Something else",
];
const NEGATIVE_REASONS = [
  "Help me get started faster",
  "Make it easier to find what I'm looking for",
  "Make it easy to understand the product and features",
  "Update this documentation",
  "Something else",
];

type FeedbackPayload = {
  answer: Answer | null;
  scope: "page" | "section";
  /** Section/resource the feedback is about (e.g. a tag slug); null for pages. */
  target: string | null;
  reason?: string | null;
  comment?: string;
  path: string | null;
  ts: number;
};

async function postFeedback(endpoint: string | undefined, payload: FeedbackPayload) {
  if (endpoint) {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* swallow — feedback is best-effort, never block the reader */
    });
  } else {
    // No endpoint configured — log so the operator can verify wiring.
    // eslint-disable-next-line no-console
    console.log("[markline feedback]", payload);
  }
}

/* ── per-(path,target) dedup, best-effort ─────────────────────────────────── */
function answeredKey(scope: string, target?: string) {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  return `markline-fb:${scope}:${path}:${target ?? ""}`;
}
function wasAnswered(scope: string, target?: string): boolean {
  try {
    return !!localStorage.getItem(answeredKey(scope, target));
  } catch {
    return false;
  }
}
function markAnswered(scope: string, target?: string) {
  try {
    localStorage.setItem(answeredKey(scope, target), "1");
  } catch {
    /* ignore */
  }
}

function basePayload(answer: Answer | null, scope: "page" | "section", target?: string): FeedbackPayload {
  return {
    answer,
    scope,
    target: target ?? null,
    path: typeof window !== "undefined" ? window.location.pathname : null,
    ts: Date.now(),
  };
}

/**
 * Design-faithful per-page rate widget (the `.rate` block in the right TOC):
 * mono question + two thumb buttons. Picking one reveals the reason/comment form
 * and submits through the shared endpoint contract.
 */
export function DocsRate({ endpoint }: { endpoint?: string }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (wasAnswered("page")) setStage("done");
  }, []);

  const pick = (a: Answer) => {
    if (a !== answer) setReason(null); // positive/negative lists differ — drop a stale pick
    setAnswer(a);
    setStage("form");
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await postFeedback(endpoint, { ...basePayload(answer, "page"), reason, comment });
      markAnswered("page");
      setStage("done");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = () => {
    setAnswer(null);
    setStage("idle");
    setReason(null);
    setComment("");
  };

  if (stage === "done") {
    return (
      <div className="rate">
        <div className="q">Thanks for the feedback.</div>
      </div>
    );
  }

  return (
    <div className="rate">
      <div className="q">Was this page helpful?</div>
      <div className="btns">
        <button type="button" aria-label="Yes, helpful" className={answer === "yes" ? "picked" : undefined} onClick={() => pick("yes")}>
          <ThumbIcon up />
        </button>
        <button type="button" aria-label="No, not helpful" className={answer === "no" ? "picked" : undefined} onClick={() => pick("no")}>
          <ThumbIcon />
        </button>
      </div>

      {stage === "form" && (
        <div className="ml-fb-form">
          <h6>{answer === "yes" ? "What did you like?" : "How can we improve?"}</h6>
          <div className="ml-fb-reasons">
            {(answer === "yes" ? POSITIVE_REASONS : NEGATIVE_REASONS).map((r) => (
              <label key={r} className="ml-fb-reason">
                <input type="radio" name="docs-feedback-reason" checked={reason === r} onChange={() => setReason(r)} />
                <span>{r}</span>
              </label>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Anything else?" className="ml-fb-textarea" />
          <div className="ml-fb-actions">
            <button onClick={cancel} type="button" className="ml-fb-btn ml-fb-btn-cancel">
              Cancel
            </button>
            <button onClick={submit} disabled={submitting || (!reason && !comment.trim())} type="button" className="ml-fb-btn ml-fb-btn-submit">
              {submitting ? "Sending…" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact per-section rate ("Was this section helpful? Yes/No") for the API
 * reference. Submits immediately on pick, tagging which resource it was on, then
 * collapses to a thank-you. Keeps the `.helpful` markup so the existing styles
 * apply.
 */
export function SectionRate({ endpoint, target, label = "Was this section helpful?" }: { endpoint?: string; target?: string; label?: string }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (wasAnswered("section", target)) setDone(true);
  }, [target]);

  const pick = async (a: Answer) => {
    setAnswer(a);
    setDone(true);
    markAnswered("section", target);
    await postFeedback(endpoint, basePayload(a, "section", target));
  };

  if (done) {
    return <div className="helpful">Thanks for the feedback.</div>;
  }

  return (
    <div className="helpful">
      {label}{" "}
      <span className="yn">
        <button type="button" className={answer === "yes" ? "picked" : undefined} onClick={() => pick("yes")}>
          Yes
        </button>
        <button type="button" className={answer === "no" ? "picked" : undefined} onClick={() => pick("no")}>
          No
        </button>
      </span>
    </div>
  );
}

function ThumbIcon({ up = false }: { up?: boolean }) {
  return (
    <svg
      className="ico"
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: up ? undefined : "scaleY(-1)" }}
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}
