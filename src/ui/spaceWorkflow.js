export const SPACE_WORKFLOW_STEPS = Object.freeze([
  Object.freeze({
    id: 1,
    key: "reference",
    kicker: "Step 1 / Reference",
    title: "Start with one useful view",
    time: "About 1 minute · the example works too",
    nextLabel: "Set the scale",
    preferredView: "space",
  }),
  Object.freeze({
    id: 2,
    key: "scale",
    kicker: "Step 2 / Scale",
    title: "Give the room real dimensions",
    time: "Three measurements · estimates stay labeled",
    nextLabel: "Place what matters",
    preferredView: "space",
  }),
  Object.freeze({
    id: 3,
    key: "place",
    kicker: "Step 3 / Placement",
    title: "Place the robot, task, and obstacles",
    time: "Drag in plan view · use arrows for precise moves",
    nextLabel: "Choose the job",
    preferredView: "plan",
  }),
  Object.freeze({
    id: 4,
    key: "test",
    kicker: "Step 4 / Test",
    title: "Tell the robot what should happen",
    time: "One deterministic screen · evidence stays attached",
    nextLabel: null,
    preferredView: "space",
  }),
]);

const STEP_COUNT = SPACE_WORKFLOW_STEPS.length;

function normalizeStep(step) {
  const numeric = Number(step);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(STEP_COUNT, Math.max(1, Math.round(numeric)));
}

export function createSpaceWorkflowState(step = 1) {
  return Object.freeze({ step: normalizeStep(step), stepCount: STEP_COUNT });
}

export function selectSpaceWorkflowStep(workflow, step) {
  if (!workflow || workflow.stepCount !== STEP_COUNT) {
    throw new TypeError("A valid customer-space workflow state is required.");
  }
  return createSpaceWorkflowState(step);
}

export function advanceSpaceWorkflow(workflow) {
  return selectSpaceWorkflowStep(workflow, workflow.step + 1);
}

export function retreatSpaceWorkflow(workflow) {
  return selectSpaceWorkflowStep(workflow, workflow.step - 1);
}

export function spaceWorkflowStep(workflow) {
  if (!workflow || workflow.stepCount !== STEP_COUNT) {
    throw new TypeError("A valid customer-space workflow state is required.");
  }
  return SPACE_WORKFLOW_STEPS[workflow.step - 1];
}

export function spaceWorkflowProgress(workflow) {
  const step = spaceWorkflowStep(workflow);
  return Object.freeze({
    current: step.id,
    total: STEP_COUNT,
    ratio: step.id / STEP_COUNT,
    isFirst: step.id === 1,
    isLast: step.id === STEP_COUNT,
  });
}
