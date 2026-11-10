import { test } from "node:test";
import assert from "node:assert/strict";
import { menuLayout } from "../components/docs/page-actions";

// The page actions' "menu" style: Ask AI is a button of its own, not in the menu.

test("with Ask AI set up, Ask AI is a button before Copy for LLM", () => {
  assert.deepEqual(menuLayout(true).buttons, ["ask", "copy"]);
});

test("without Ask AI, Copy for LLM is the only button", () => {
  assert.deepEqual(menuLayout(false).buttons, ["copy"]);
});

test("the menu holds only the Markdown actions", () => {
  for (const ai of [true, false]) assert.deepEqual(menuLayout(ai).menu, ["view", "open"]);
});
