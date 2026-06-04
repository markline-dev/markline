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
    return <div className="ml-fb">Thanks for the feedback.</div>;
  }

  return (
    <div className="ml-fb">
      <div className="ml-fb-q">Was this page helpful?</div>
      <div className="ml-fb-pills">
        <PillButton active={answer === "yes"} onClick={() => pick("yes")} aria-label="Yes, helpful">
          <ThumbIcon up /> Yes
        </PillButton>
        <PillButton active={answer === "no"} onClick={() => pick("no")} aria-label="No, not helpful">
          <ThumbIcon /> No
        </PillButton>
      </div>

      {stage === "form" && (
        <div className="ml-fb-form">
          <h6>{answer === "yes" ? "What did you like?" : "How can we improve?"}</h6>
          <div className="ml-fb-reasons">
            {REASONS.map((r) => (
              <label key={r} className="ml-fb-reason">
                <input
                  type="radio"
                  name="docs-feedback-reason"
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
            className="ml-fb-textarea"
          />
          <div className="ml-fb-actions">
            <button onClick={cancel} type="button" className="ml-fb-btn ml-fb-btn-cancel">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || (!reason && !comment.trim())}
              type="button"
              className="ml-fb-btn ml-fb-btn-submit"
            >
              {submitting ? "Sending…" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Design-faithful rate widget (the .rate block in the right TOC): mono question
 * + two thumb buttons. Picking one reveals the existing reason/comment form and
 * submits through the same endpoint contract as FeedbackWidget.
 */
export function DocsRate({ endpoint }: { endpoint?: string }) {
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
      <div className="rate">
        <div className="q">Thanks for the feedback.</div>
      </div>
    );
  }

  return (
    <div className="rate">
      <div className="q">Was this page helpful?</div>
      <div className="btns">
        <button
          type="button"
          aria-label="Yes, helpful"
          className={answer === "yes" ? "picked" : undefined}
          onClick={() => pick("yes")}
        >
          <ThumbIcon up />
        </button>
        <button
          type="button"
          aria-label="No, not helpful"
          className={answer === "no" ? "picked" : undefined}
          onClick={() => pick("no")}
        >
          <ThumbIcon />
        </button>
      </div>

      {stage === "form" && (
        <div className="ml-fb-form">
          <h6>{answer === "yes" ? "What did you like?" : "How can we improve?"}</h6>
          <div className="ml-fb-reasons">
            {REASONS.map((r) => (
              <label key={r} className="ml-fb-reason">
                <input
                  type="radio"
                  name="docs-feedback-reason"
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
            className="ml-fb-textarea"
          />
          <div className="ml-fb-actions">
            <button onClick={cancel} type="button" className="ml-fb-btn ml-fb-btn-cancel">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || (!reason && !comment.trim())}
              type="button"
              className="ml-fb-btn ml-fb-btn-submit"
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
      className={`ml-fb-pill${active ? " active" : ""}`}
      {...rest}
    >
      {children}
    </button>
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
