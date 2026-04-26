import test from "node:test";
import assert from "node:assert/strict";
import { stopNestedInteractiveEvent } from "../lib/domEvents";

test("stopNestedInteractiveEvent blocks bubbling and default browser row activation", () => {
  let stopped = 0;
  let prevented = 0;

  stopNestedInteractiveEvent({
    stopPropagation: () => {
      stopped += 1;
    },
    preventDefault: () => {
      prevented += 1;
    },
  });

  assert.equal(stopped, 1);
  assert.equal(prevented, 1);
});

test("stopNestedInteractiveEvent can skip preventDefault for plain click handlers", () => {
  let stopped = 0;
  let prevented = 0;

  stopNestedInteractiveEvent(
    {
      stopPropagation: () => {
        stopped += 1;
      },
      preventDefault: () => {
        prevented += 1;
      },
    },
    false,
  );

  assert.equal(stopped, 1);
  assert.equal(prevented, 0);
});
