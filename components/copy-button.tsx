"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      className={`border px-2.5 py-1 rounded-1 font-mono text-11 cursor-pointer transition-all duration-150 ${
        copied
          ? "bg-[#3E59F3] border-[#3E59F3] text-[#FFFFFF]"
          : "bg-transparent border-[#2A2A26] text-[#908F86] hover:border-[#908F86] hover:text-[#E8E7E0]"
      }`}
      onClick={handleCopy}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
