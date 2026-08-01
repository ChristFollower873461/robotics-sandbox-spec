import assert from "node:assert/strict";
import test from "node:test";

import {
  SPACE_WORKFLOW_STEPS,
  advanceSpaceWorkflow,
  createSpaceWorkflowState,
  retreatSpaceWorkflow,
  selectSpaceWorkflowStep,
  spaceWorkflowProgress,
  spaceWorkflowStep,
} from "../src/ui/spaceWorkflow.js";

test("customer-space workflow starts with one reference task", () => {
  const workflow = createSpaceWorkflowState();
  assert.deepEqual(workflow, { step: 1, stepCount: 4 });
  assert.equal(spaceWorkflowStep(workflow).key, "reference");
  assert.deepEqual(spaceWorkflowProgress(workflow), {
    current: 1,
    total: 4,
    ratio: 0.25,
    isFirst: true,
    isLast: false,
  });
});

test("workflow navigation is deterministic and clamps both ends", () => {
  const first = createSpaceWorkflowState(-200);
  const second = advanceSpaceWorkflow(first);
  const fourth = selectSpaceWorkflowStep(second, 999);

  assert.equal(second.step, 2);
  assert.equal(fourth.step, 4);
  assert.equal(advanceSpaceWorkflow(fourth).step, 4);
  assert.equal(retreatSpaceWorkflow(first).step, 1);
  assert.equal(retreatSpaceWorkflow(fourth).step, 3);
});

test("each step names its task, next action, and useful view", () => {
  assert.deepEqual(
    SPACE_WORKFLOW_STEPS.map(({ key, nextLabel, preferredView }) => ({ key, nextLabel, preferredView })),
    [
      { key: "reference", nextLabel: "Set the scale", preferredView: "space" },
      { key: "scale", nextLabel: "Place what matters", preferredView: "space" },
      { key: "place", nextLabel: "Choose the job", preferredView: "plan" },
      { key: "test", nextLabel: null, preferredView: "space" },
    ]
  );
  assert.equal(spaceWorkflowProgress(createSpaceWorkflowState(4)).isLast, true);
});

test("workflow helpers reject unrelated state", () => {
  assert.throws(() => advanceSpaceWorkflow({ step: 1, stepCount: 99 }), /valid customer-space workflow/);
  assert.throws(() => spaceWorkflowStep(null), /valid customer-space workflow/);
});
