/* Which page actions the "menu" style (layout.pageActions: "menu") shows as
 * buttons and which in its dropdown. Kept apart from doc-actions.tsx so it's
 * unit-tested. */

export type PageAction = "ask" | "copy" | "view" | "open";

/** Ask AI (when it's set up) is a button of its own beside "Copy for LLM";
 *  the dropdown holds only the Markdown actions. */
export function menuLayout(aiEnabled: boolean): { buttons: PageAction[]; menu: PageAction[] } {
  return { buttons: aiEnabled ? ["ask", "copy"] : ["copy"], menu: ["view", "open"] };
}
