import { describe, it, expect, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { getExerciseMedia } from "./exerciseMedia";
import { ExerciseDemo } from "../components/ExerciseDemo";
import { EXERCISES } from "../exerciseData";
import manifest from "../data/exerciseMedia.json";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
function render(el) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(el));
  return { container };
}
afterEach(() => { act(() => root?.unmount()); container?.remove(); root = null; });

const bench = { id: "barbell-bench-press", name: "Barbell Bench Press" };

describe("getExerciseMedia", () => {
  it("returns null when the exercise has no clip, so the fallback figure is used", () => {
    expect(getExerciseMedia(bench, {}, "https://cdn.example")).toBeNull();
  });

  it("returns null when no media host is configured", () => {
    expect(getExerciseMedia(bench, { "barbell-bench-press": "bench" }, "")).toBeNull();
  });

  it("builds mp4, webm, poster and thumb URLs from the clip key", () => {
    const m = getExerciseMedia(bench, { "barbell-bench-press": "bench" }, "https://cdn.example");
    expect(m.mp4).toMatch(/^https:\/\/cdn\.example\/bench\.mp4/);
    expect(m.webm).toMatch(/bench\.webm/);
    expect(m.poster).toMatch(/bench\.webp/);
    expect(m.thumb).toMatch(/bench-thumb\.webp/);
    expect(m.alt).toContain("Barbell Bench Press");
  });

  it("every manifest entry points at a real built-in exercise id", () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    const unknown = Object.keys(manifest.clips).filter((id) => !ids.has(id));
    expect(unknown).toEqual([]);
  });
});

describe("ExerciseDemo", () => {
  it("renders the fallback when there is no clip", () => {
    const { container } = render(<ExerciseDemo media={null} fallback={<div>fallback figure</div>} />);
    expect(container.textContent).toBe("fallback figure");
  });

  it("renders a muted, looping, lazily loaded video with a poster when a clip exists", () => {
    const media = getExerciseMedia(bench, { "barbell-bench-press": "bench" }, "https://cdn.example");
    const { container } = render(<ExerciseDemo media={media} />);
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.getAttribute("preload")).toBe("none");
    expect(video.getAttribute("poster")).toBe(media.poster);
    expect(container.querySelector("button[aria-label$='demonstration']")).toBeTruthy();
  });
});
