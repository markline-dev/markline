"use client";

import { useEffect, useRef, useState } from "react";
import type { AiPublicConfig } from "@/lib/config";

/**
 * Docked "Ask AI" chat panel — ported from the Claude Design
 * handoff (aichat.css / aichat.js) to React, aligned to the Markline BYOK design
 * (_docs/AI-BYOK-DESIGN.md). Persistent right-side panel that pushes the page,
 * multi-chat dropdown, "Ask about this section" context, "Used N sources",
 * pinned composer, ⌘K / ⌘E.
 *
 * Transports:
 *  - proxy mode: POST the built-in /api/ai (operator key, server-side).
 *  - byok mode:  the reader pastes their own key (localStorage), and we call the
 *    provider's /chat/completions directly — safe for pure-static hosting.
 *
 * Rendered ONLY when aiConfig() is non-null, so with no AI configured nothing
 * here exists.
 */

/** Open the docked panel (optionally with a section context). Any gated
 *  affordance can call this; the mounted AskDock listens for the event. */
export function openAskPanel(context?: string) {
  window.dispatchEvent(new CustomEvent("ml-ai-open", { detail: { context: context ?? null } }));
}

type Msg = { role: "user" | "ai"; text: string; sources?: string[]; error?: boolean };
type Chat = { title: string; messages: Msg[] };

const CHATS_KEY = "markline-ai-chats";
const OPEN_KEY = "markline-ai-open";
const RKEY_KEY = "markline-ai-key";

const SUGGEST = ["How do I authenticate requests?", "How do I create a resource?", "What does an error response look like?"];

function trunc(s: string, n: number) {
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function esc(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string) {
  return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
}
function mdBlocks(s: string): string {
  const parts = String(s).split(/```/);
  let html = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const code = parts[i].replace(/^[a-zA-Z]*\n/, "");
      html += "<pre>" + esc(code.replace(/\n$/, "")) + "</pre>";
    } else {
      parts[i].split(/\n{2,}/).forEach((para) => {
        const t = para.trim();
        if (!t) return;
        const lines = t.split("\n").map((ln) => {
          const h = ln.match(/^#{1,6}\s+(.*)$/);
          if (h) return "<strong>" + inline(esc(h[1])) + "</strong>";
          if (/^[-*]\s+/.test(ln)) return "&bull;&nbsp; " + inline(esc(ln.replace(/^[-*]\s+/, "")));
          return inline(esc(ln));
        });
        html += "<p>" + lines.join("<br>") + "</p>";
      });
    }
  }
  return html;
}

export function AskDock({ ai }: { ai: AiPublicConfig }) {
  const [chats, setChats] = useState<Chat[]>([{ title: "New chat", messages: [] }]);
  const [cur, setCur] = useState(0);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [context, setContext] = useState<string>("this page");
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [needKey, setNeedKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messages = chats[cur]?.messages ?? [];

  /* hydrate from localStorage + restore open state */
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHATS_KEY) || "null");
      if (s?.chats?.length) {
        setChats(s.chats);
        setCur(Math.min(s.cur || 0, s.chats.length - 1));
      }
      if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  /* persist chats */
  useEffect(() => {
    try {
      localStorage.setItem(CHATS_KEY, JSON.stringify({ chats, cur }));
    } catch {
      /* ignore */
    }
  }, [chats, cur]);

  /* reflect open state into the page push + persist */
  useEffect(() => {
    document.body.classList.toggle("aichat-open", open);
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      document.body.classList.remove("aichat-open");
    };
  }, [open]);

  /* auto-scroll the transcript */
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, thinking]);

  /* external open trigger + keyboard shortcuts */
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { context?: string | null } | undefined;
      if (detail?.context) setContext(detail.context);
      setOpen(true);
    };
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent).detail as { q?: string } | undefined;
      if (detail?.q) {
        setInput(detail.q);
        setTimeout(() => inputRef.current?.focus(), 40);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        setOpen(true);
        addChat();
      }
    };
    window.addEventListener("ml-ai-open", onOpen as EventListener);
    window.addEventListener("ml-ai-prefill", onPrefill as EventListener);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("ml-ai-open", onOpen as EventListener);
      window.removeEventListener("ml-ai-prefill", onPrefill as EventListener);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateMessages = (fn: (m: Msg[]) => Msg[]) => {
    setChats((cs) => cs.map((c, i) => (i === cur ? { ...c, messages: fn(c.messages) } : c)));
  };

  function addChat() {
    setChats((cs) => {
      setCur(cs.length); // new chat sits at the end
      return [...cs, { title: "New chat", messages: [] }];
    });
    setMenu(false);
    setTimeout(() => inputRef.current?.focus(), 20);
  }
  function clearAll() {
    setChats([{ title: "New chat", messages: [] }]);
    setCur(0);
    setMenu(false);
  }

  async function callAi(question: string): Promise<{ text: string; sources: string[] }> {
    const sources = pickSources();
    if (ai.mode === "byok") {
      let key = "";
      try {
        key = localStorage.getItem(RKEY_KEY) || "";
      } catch {
        /* ignore */
      }
      if (!key) {
        setNeedKey(true);
        throw new Error("need-key");
      }
      const { chatComplete, buildMessages } = await import("@/lib/ai/transport");
      const baseUrl = (ai.endpoint || "").replace(/\/chat\/completions$/, "");
      const text = await chatComplete({
        baseUrl,
        model: ai.model,
        key,
        provider: ai.provider,
        maxTokens: ai.maxTokens,
        messages: buildMessages(undefined, `You are viewing the "${context}" section.`, question),
        referer: location.origin,
        title: document.title,
      });
      return { text, sources };
    }
    // proxy mode → built-in route or external endpoint
    const res = await fetch(ai.endpoint || "/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, context: `The user is viewing the "${context}" section.` }),
    });
    if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Request failed (${res.status})`);
    const data = await res.json();
    return { text: (data.text || "").trim(), sources };
  }

  async function submit(forced?: string) {
    const q = (forced ?? input).trim();
    if (!q || thinking) return;
    setInput("");
    const first = messages.length === 0;
    updateMessages((m) => [...m, { role: "user", text: q }]);
    if (first) setChats((cs) => cs.map((c, i) => (i === cur ? { ...c, title: trunc(q, 30) } : c)));
    setThinking(true);
    try {
      const { text, sources } = await callAi(q);
      updateMessages((m) => [...m, { role: "ai", text, sources }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "need-key") {
        setThinking(false);
        return; // key prompt shown; question stays in transcript
      }
      const friendly =
        ai.mode === "byok"
          ? "Couldn't reach your provider. Check your key and model, then try again."
          : "The assistant is unavailable right now. In a real deployment this runs on your own key (BYOK) — nothing routes through Markline.";
      updateMessages((m) => [...m, { role: "ai", text: friendly + (msg && msg.length < 200 ? `\n\n\`${msg}\`` : ""), error: true }]);
    } finally {
      setThinking(false);
    }
  }

  function saveKey() {
    const k = keyDraft.trim();
    if (!k) return;
    try {
      localStorage.setItem(RKEY_KEY, k);
    } catch {
      /* ignore */
    }
    setNeedKey(false);
    setKeyDraft("");
    // retry the last unanswered question
    const last = [...messages].reverse().find((m) => m.role === "user");
    if (last) submit(last.text);
  }

  function pickSources(): string[] {
    const all = [`API Reference — ${context}`, "Authentication", "The object model", "Errors", "Guides"];
    return all.slice(0, 3);
  }

  const title = chats[cur]?.title || "New chat";

  return (
    <>
      <div className={`aichat-scrim${open ? " on" : ""}`} onClick={() => setOpen(false)} />
      <aside className="aichat" aria-hidden={!open}>
        <div className="ac-head">
          <span className="spark">
            <Spark />
          </span>
          <button className={`ac-titlebtn${menu ? " on" : ""}`} onClick={() => setMenu((v) => !v)}>
            <span className="title">{title}</span>
            <Chev />
          </button>
          <span className="acts">
            <button className="ac-ibtn" title="New chat (⌘E)" onClick={addChat}>
              <Ico d="M12 5v14M5 12h14" />
            </button>
            <button className="ac-ibtn" title="Close" onClick={() => setOpen(false)}>
              <Ico d="M18 6 6 18M6 6l12 12" />
            </button>
          </span>
          {menu && (
            <div className="ac-menu">
              {chats.map((c, i) => (
                <button key={i} className="ac-mi" onClick={() => { setCur(i); setMenu(false); }}>
                  <span>{c.title || "New chat"}</span>
                  {i === cur && <Check />}
                </button>
              ))}
              <div className="ac-msep" />
              <button className="ac-mi" onClick={addChat}>
                <Ico d="M12 5v14M5 12h14" w={15} />
                <span>Add new chat</span>
              </button>
              <button className="ac-mi danger" onClick={clearAll}>
                <span>Clear all chats</span>
              </button>
            </div>
          )}
        </div>

        <div className="ac-body" ref={bodyRef}>
          {messages.length === 0 && !thinking ? (
            <div className="ac-empty">
              <div className="lead">Ask questions about this API and get help with your integration.</div>
              <div className="tip">
                Tip: start a new chat with <kbd>⌘</kbd> <kbd>E</kbd>
              </div>
              <div className="ac-sugg">
                {SUGGEST.map((s) => (
                  <button key={s} className="ac-sg" onClick={() => submit(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="ac-msg user">
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className="ac-msg ai">
                    {m.error ? (
                      <div className="ac-out" dangerouslySetInnerHTML={{ __html: mdBlocks(m.text) }} />
                    ) : (
                      <>
                        {m.sources && <Sources list={m.sources} />}
                        <div className="ac-out" dangerouslySetInnerHTML={{ __html: mdBlocks(m.text) }} />
                      </>
                    )}
                  </div>
                ),
              )}
              {thinking && (
                <div className="ac-msg ai">
                  <div className="ac-think">
                    Searching the docs
                    <span className="ac-dots">
                      <i /><i /><i />
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="ac-foot">
          {needKey && (
            <div className="ac-keyrow">
              <input
                className="ac-keyin"
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveKey()}
                placeholder={`Paste your ${ai.providerLabel} key…`}
                aria-label="Provider API key"
              />
              <button className="ac-keybtn" onClick={saveKey}>
                Save
              </button>
            </div>
          )}
          <div className="ac-ctx">
            <span className="bk">
              <Book />
            </span>
            <span className="ctxl">API Reference — {context}</span>
          </div>
          <div className="ac-inwrap">
            <input
              ref={inputRef}
              className="ac-in"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Ask a question about the page…"
              autoComplete="off"
              spellCheck={false}
              aria-label="Ask a question"
            />
            <button className="ac-send" onClick={() => submit()} disabled={!input.trim() || thinking} aria-label="Send">
              <Ico d="M12 19V5M6 11l6-6 6 6" w={15} />
            </button>
          </div>
          <div className="ac-disclaim">
            Answers run on {ai.mode === "byok" ? "your key" : "your model"} · {ai.providerLabel} · may contain mistakes
          </div>
        </div>
      </aside>
    </>
  );
}

function Sources({ list }: { list: string[] }) {
  return (
    <details className="ac-sources">
      <summary>
        <Chev cls="chev" right />
        Used {list.length} sources
      </summary>
      <div className="ac-srclist">
        {list.map((s) => (
          <div key={s} className="ac-src">
            <span className="bk">
              <Book sm />
            </span>
            {s}
          </div>
        ))}
      </div>
    </details>
  );
}

/* ── icons ── */
function Spark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3z" />
    </svg>
  );
}
function Chev({ cls, right }: { cls?: string; right?: boolean }) {
  return (
    <svg className={cls ?? "chev"} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={right ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}
function Ico({ d, w = 16 }: { d: string; w?: number }) {
  return (
    <svg className="ico" width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={d} />
    </svg>
  );
}
function Check() {
  return (
    <svg className="ck" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function Book({ sm }: { sm?: boolean }) {
  const n = sm ? 13 : 13;
  return (
    <svg width={n} height={n} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 5a2 2 0 0 1 2-2h11v18H6a2 2 0 0 1-2-2z" />
      {!sm && <path d="M9 3v18" />}
    </svg>
  );
}
