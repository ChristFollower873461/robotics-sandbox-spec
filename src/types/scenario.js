/**
 * @typedef {{ x: number, y: number }} Point
 *
 * @typedef {{
 *   id: string,
 *   x: number,
 *   y: number,
 *   label?: string
 * }} Waypoint
 *
 * @typedef {{
 *   id: string,
 *   type: "circle",
 *   x: number,
 *   y: number,
 *   radius: number
 * }} CircleObstacle
 *
 * @typedef {{
 *   id: string,
 *   type: "rect",
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number
 * }} RectObstacle
 *
 * @typedef {CircleObstacle | RectObstacle} Obstacle
 *
 * @typedef {{
 *   linkLengths: [number, number],
 *   joints: [number, number],
 *   elbow: "up" | "down"
 * }} ArmState
 *
 * @typedef {{
 *   startJoints: [number, number],
 *   waypoints: Waypoint[],
 *   playbackSpeed: number,
 *   isPlaying: boolean,
 *   progress: number
 * }} PathState
 *
 * @typedef {{
 *   scenarioName: string,
 *   mode: "fk" | "ik" | "path",
 *   arm: ArmState,
 *   target: Point,
 *   path: PathState,
 *   obstacles: Obstacle[],
 *   obstacleDraft: {
 *     type: "circle" | "rect",
 *     x: number,
 *     y: number,
 *     sizeA: number,
 *     sizeB: number
 *   }
 * }} ScenarioState
 */

export {};
