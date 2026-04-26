import test from "node:test";
import assert from "node:assert/strict";
import { stopSearchDropdownNestedEvent } from "../lib/searchDropdownEvents";

test("stopSearchDropdownNestedEvent blocks bubbling and default browser row activation", () => {
  let stopped = 0;
  let prevented = 0;

  stopSearchDropdownNestedEvent({
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

test("stopSearchDropdownNestedEvent can skip preventDefault for plain click handlers", () => {
  let stopped = 0;
  let prevented = 0;

  stopSearchDropdownNestedEvent(
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
