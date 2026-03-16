import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserByToken } from "./auth";

// List all events
export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    const events = await ctx.db
      .query("events")
      .order("desc")
      .collect();

    return events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      createdBy: event.createdBy,
      createdAt: event.createdAt,
    }));
  },
});

// Create event
export const create = mutation({
  args: {
    sessionToken: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startsAt: v.number(),
    endsAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    const eventId = await ctx.db.insert("events", {
      title: args.title,
      description: args.description,
      location: args.location,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      createdBy: user._id,
      createdAt: Date.now(),
    });

    return { id: eventId };
  },
});

// Update event
export const update = mutation({
  args: {
    sessionToken: v.string(),
    eventId: v.id("events"),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startsAt: v.number(),
    endsAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    // Only creator or admin can update
    if (event.createdBy !== user._id && user.role !== "admin") {
      throw new Error("Not authorized to update this event");
    }

    await ctx.db.patch(args.eventId, {
      title: args.title,
      description: args.description,
      location: args.location,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
    });

    return { success: true };
  },
});

// Delete event
export const remove = mutation({
  args: {
    sessionToken: v.string(),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    // Only creator or admin can delete
    if (event.createdBy !== user._id && user.role !== "admin") {
      throw new Error("Not authorized to delete this event");
    }

    await ctx.db.delete(args.eventId);

    return { success: true };
  },
});
