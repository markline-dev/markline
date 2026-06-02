"use client";

import { useState } from "react";

type Answer = "yes" | "no";
type Stage = "idle" | "form" | "done";

const REASONS = [
  "Help me get started faster",
  "Make it easier to find what I'm looking for",
  "Make it easy to understand the product and features",
  "Update this documentation",
  "Something else",
];

export function FeedbackWidget({ endpoint }: { endpoint?: string }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pick = (a: Answer) => {
    setAnswer(a);
    setStage("form");
  };

  const submit = async () => {
    setSubmitting(true);
    const payload = {
      answer,
      reason,
      comment,
      path: typeof window !== "undefined" ? window.location.pathname : null,
    };
    try {
      if (endpoint) {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // No endpoint configured — log so the operator can verify wiring.
        // eslint-disable-next-line no-console
        console.log("[docs feedback]", payload);
      }
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
      <div className="mt-8 pt-4 border-t border-slate-3 text-12 text-slate-5">
        Thanks for the feedback.
      </div>
    );
  }

  return (
    <div className="mt-8 pt-4 border-t border-slate-3 text-12 text-slate-6">
      <div className="text-ink font-medium mb-2">Was this page helpful?</div>
      <div className="flex gap-1.5">
        <PillButton active={answer === "yes"} onClick={() => pick("yes")} aria-label="Yes, helpful">
          <ThumbIcon up /> Yes
        </PillButton>
        <PillButton active={answer === "no"} onClick={() => pick("no")} aria-label="No, not helpful">
          <ThumbIcon /> No
        </PillButton>
      </div>

      {stage === "form" && (
        <div className="mt-4">
          <h6 className="text-13 font-medium text-ink mb-2">
            {answer === "yes" ? "What did you like?" : "How can we improve?"}
          </h6>
          <div className="flex flex-col gap-1.5">
            {REASONS.map((r) => (
              <label key={r} className="flex items-start gap-2 text-12 text-slate-6 cursor-pointer">
                <input
                  type="radio"
                  name="docs-feedback-reason"
                  className="mt-0.5 accent-brand"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                <span>{r}</span>
              </label>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Anything else?"
            className="w-full mt-3 p-2 text-12 bg-paper-2 border border-slate-3 rounded-1 text-ink resize-y focus:outline-none focus:border-brand"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={cancel}
              type="button"
              className="font-mono text-11 px-3 py-1.5 border border-slate-4 rounded-1 bg-transparent text-slate-6 hover:text-ink hover:border-slate-7 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || (!reason && !comment.trim())}
              type="button"
              className="font-mono text-11 px-3 py-1.5 rounded-1 bg-ink text-paper hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? "Sending…" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PillButton({
  active,
  children,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="inline-flex items-center gap-1.5 font-mono text-11 px-2.5 py-1 rounded-1 border bg-transparent cursor-pointer transition-colors"
      style={{
        borderColor: active ? "rgb(var(--c-brand))" : "rgb(var(--c-slate-3))",
        color: active ? "rgb(var(--c-brand))" : "rgb(var(--c-slate-6))",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function ThumbIcon({ up = false }: { up?: boolean }) {
  return (
    <svg
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
