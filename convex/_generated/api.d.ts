/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as channels from "../channels.js";
import type * as debug from "../debug.js";
import type * as events from "../events.js";
import type * as fixUserStatus from "../fixUserStatus.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as reactions from "../reactions.js";
import type * as signupRequests from "../signupRequests.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  channels: typeof channels;
  debug: typeof debug;
  events: typeof events;
  fixUserStatus: typeof fixUserStatus;
  messages: typeof messages;
  migrations: typeof migrations;
  pushNotifications: typeof pushNotifications;
  pushSubscriptions: typeof pushSubscriptions;
  reactions: typeof reactions;
  signupRequests: typeof signupRequests;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
