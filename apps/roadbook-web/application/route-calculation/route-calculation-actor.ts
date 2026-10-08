import { assign, createActor, fromPromise, setup } from "xstate";
import type { DrivingRoute, WebMapAdapter, WebMapProvider } from "@roadbook/map/web";
import type { RouteCalculationStatus, RoutePlan } from "@/domain/route-planning/model";
import { routeCalculationIdentity, type PublishedRouteContext } from "@/domain/route-planning/calculation-context";
import { appendReturnLeg } from "@/domain/route-planning/route-travel-scope";

export interface RouteCalculationInput {
  plan: RoutePlan | null;
  activation: number;
  provider: WebMapProvider;
  adapter: WebMapAdapter | null;
  connection: "loading" | "ready" | "unavailable";
}
interface CalculationContext {
  input: RouteCalculationInput;
  identity: string;
  batch: number;
  sourceRevision: number;
  oneWay: DrivingRoute | null;
  roundTrip: DrivingRoute | null;
  error: string | null;
  returnError: string | null;
}
type CalculationEvent =
  | { type: "INPUT"; input: RouteCalculationInput }
  | { type: "CANCEL" }
  | { type: "RETRY" }
  | { type: "TOGGLE_RETURN" };

const machine = setup({
  types: { context: {} as CalculationContext, events: {} as CalculationEvent },
  actors: {
    calculate: fromPromise<DrivingRoute, { input: RouteCalculationInput; returning: boolean; oneWay?: DrivingRoute | null }>(async ({ input: task, signal }) => {
      const { plan, adapter } = task.input;
      if (!plan || !adapter) throw new Error("地图服务未连接");
      const points = task.returning
        ? [plan.controlPoints[plan.controlPoints.length - 1], plan.controlPoints[0]]
        : plan.controlPoints;
      const route = await adapter.calculateDrivingRoute(points, plan.strategy, "one-way", signal);
      if (!task.returning) return route;
      if (!route.legs[0] || !task.oneWay) throw new Error("没有返回有效的返程路段");
      return appendReturnLeg(task.oneWay, route.legs[0]);
    }),
  },
  guards: {
    compatible: ({ context, event }) => event.type === "INPUT"
      && context.identity === routeCalculationIdentity(event.input.plan, event.input.provider)
      && context.input.activation === event.input.activation
      && context.input.adapter === event.input.adapter
      && context.input.connection === event.input.connection,
    empty: ({ context }) => !context.input.plan,
    insufficient: ({ context }) => (context.input.plan?.controlPoints.length ?? 0) < 2,
    disconnected: ({ context }) => !context.input.adapter,
    cachedReturn: ({ context }) => Boolean(context.roundTrip),
    canRetry: ({ context }) => Boolean(context.input.adapter && (context.input.plan?.controlPoints.length ?? 0) >= 2),
  },
  actions: {
    associate: assign({ input: ({ context, event }) => event.type === "INPUT" ? event.input : context.input }),
    replaceInput: assign(({ context, event }) => {
      if (event.type !== "INPUT") return {};
      const samePlan = context.input.plan?.id === event.input.plan?.id && context.input.activation === event.input.activation;
      return {
        input: event.input,
        identity: routeCalculationIdentity(event.input.plan, event.input.provider),
        batch: context.batch + 1,
        oneWay: samePlan ? context.oneWay : null,
        roundTrip: null,
        error: null,
        returnError: null,
      };
    }),
    nextBatch: assign(({ context }) => ({ batch: context.batch + 1, error: null, returnError: null })),
  },
}).createMachine({
  id: "routeCalculation",
  initial: "idle",
  context: {
    input: { plan: null, activation: 0, provider: "amap", adapter: null, connection: "loading" },
    identity: routeCalculationIdentity(null, "amap"), batch: 0, sourceRevision: 0,
    oneWay: null, roundTrip: null, error: null, returnError: null,
  },
  on: {
    INPUT: [
      { guard: "compatible", actions: "associate" },
      { target: ".checking", actions: "replaceInput" },
    ],
    CANCEL: { target: ".cancelled", actions: assign(({ context }) => ({ batch: context.batch + 1, oneWay: null, roundTrip: null, error: null, returnError: null })) },
  },
  states: {
    checking: { always: [
      { guard: "empty", target: "idle" },
      { guard: "insufficient", target: "waiting", actions: assign({ oneWay: null, roundTrip: null }) },
      { guard: "disconnected", target: "disconnected" },
      { target: "debouncing" },
    ] },
    idle: {},
    waiting: {},
    disconnected: {},
    debouncing: { after: { 400: "calculating" } },
    calculating: {
      entry: assign({ sourceRevision: ({ context }) => context.input.plan?.revision ?? 0 }),
      invoke: {
        src: "calculate", input: ({ context }) => ({ input: context.input, returning: false }),
        onDone: { target: "ready.oneWay", actions: assign(({ event }) => ({
          oneWay: event.output, roundTrip: null,
        })) },
        onError: { target: "failed", actions: assign({ error: ({ event }) => event.error instanceof Error ? event.error.message : "路线计算失败" }) },
      },
    },
    ready: {
      initial: "oneWay",
      states: {
        oneWay: { on: { TOGGLE_RETURN: [
          { guard: "cachedReturn", target: "roundTrip", actions: assign({ returnError: null }) },
          { target: "returning", actions: assign({ returnError: null }) },
        ] } },
        returning: {
          on: { TOGGLE_RETURN: "oneWay" },
          invoke: {
            src: "calculate", input: ({ context }) => ({ input: context.input, returning: true, oneWay: context.oneWay }),
            onDone: { target: "roundTrip", actions: assign({ roundTrip: ({ event }) => event.output }) },
            onError: { target: "oneWay", actions: assign({ returnError: ({ event }) => event.error instanceof Error ? event.error.message : "返程计算失败" }) },
          },
        },
        roundTrip: { on: { TOGGLE_RETURN: "oneWay" } },
      },
    },
    failed: { on: { RETRY: { guard: "canRetry", target: "debouncing", actions: "nextBatch" } } },
    cancelled: { on: { RETRY: { guard: "canRetry", target: "debouncing", actions: "nextBatch" } } },
  },
});

export function createRouteCalculationActor() {
  return createActor(machine);
}

export function queryRouteCalculation(snapshot: ReturnType<ReturnType<typeof createRouteCalculationActor>["getSnapshot"]>) {
  const { context } = snapshot;
  const roundTrip = snapshot.matches({ ready: "roundTrip" });
  const returning = snapshot.matches({ ready: "returning" });
  const ready = snapshot.matches("ready");
  const route = roundTrip ? context.roundTrip : context.oneWay;
  const status: RouteCalculationStatus = ready ? "ready"
    : snapshot.matches("idle") ? "idle"
    : snapshot.matches("waiting") ? "waiting-for-points"
    : snapshot.matches("cancelled") ? "cancelled"
    : snapshot.matches("failed") || (snapshot.matches("disconnected") && context.input.connection === "unavailable") ? "failed"
    : "updating";
  const published: PublishedRouteContext | null = ready && route && context.input.plan ? {
    planId: context.input.plan.id, revision: context.input.plan.revision,
    sourceRevision: context.sourceRevision, inputIdentity: context.identity,
    mapProvider: context.input.provider, requestBatch: context.batch, route,
  } : null;
  return {
    route, published, routeStatus: status,
    routeError: status === "failed" ? context.error ?? "地图服务未连接，控制点已保留但暂时无法算路。" : null,
    includeReturn: roundTrip || returning,
    returnRouteLoading: returning,
    returnRouteError: context.returnError,
  };
}
