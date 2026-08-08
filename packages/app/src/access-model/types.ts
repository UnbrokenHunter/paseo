import type {
  AccessService,
  Account,
  AgentRuntime,
  Binding,
  CanonicalModel,
  ModelFamily,
  Route,
} from "@getpaseo/protocol/access-model";
import type { AccessModelSnapshotResponseMessage } from "@getpaseo/protocol/messages";

export type { AccessService, Account, AgentRuntime, Binding, CanonicalModel, ModelFamily, Route };

export type AccessModelSnapshotPayload = AccessModelSnapshotResponseMessage["payload"];

export type AccessModelSnapshotView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; payload: AccessModelSnapshotPayload; isRefreshing: boolean };
