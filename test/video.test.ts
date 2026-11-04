import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVideo } from "../lib/video";

test("files play in a <video>", () => {
  assert.deepEqual(resolveVideo("/videos/intro.mp4"), { kind: "file", src: "/videos/intro.mp4" });
  assert.equal(resolveVideo("https://cdn.example.com/a.webm?v=2").kind, "file");
});

test("YouTube links become no-cookie embeds", () => {
  const embed = "https://www.youtube-nocookie.com/embed/abc123";
  assert.equal(resolveVideo("https://www.youtube.com/watch?v=abc123").src, embed);
  assert.equal(resolveVideo("https://youtu.be/abc123").src, embed);
  assert.equal(resolveVideo("https://www.youtube.com/shorts/abc123").src, embed);
  assert.equal(resolveVideo("https://youtu.be/abc123?t=1m30s").src, `${embed}?start=90`);
});

test("Vimeo, Loom and Wistia links become their embeds", () => {
  assert.equal(resolveVideo("https://vimeo.com/76979871").src, "https://player.vimeo.com/video/76979871");
  assert.equal(resolveVideo("https://www.loom.com/share/0f1e2d").src, "https://www.loom.com/embed/0f1e2d");
  assert.equal(resolveVideo("https://acme.wistia.com/medias/xyz9").src, "https://fast.wistia.net/embed/iframe/xyz9");
});

test("other URLs are embedded as given", () => {
  assert.deepEqual(resolveVideo("https://player.example.com/v/1"), {
    kind: "embed",
    provider: "other",
    src: "https://player.example.com/v/1",
  });
});
