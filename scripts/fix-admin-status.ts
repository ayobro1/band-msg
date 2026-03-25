import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { config } from "dotenv";

config({ path: ".env.local" });

const CONVEX_URL = process.env.CONVEX_URL || process.env.PUBLIC_CONVEX_URL || "";
const convex = new ConvexHttpClient(CONVEX_URL);

async function fixAdminStatus() {
  console.log("Connecting to Convex:", CONVEX_URL);
  
  // Get your session token from the environment or pass it as argument
  const sessionToken = process.argv[2];
  const userAgentHash = process.argv[3];
  
  if (!sessionToken || !userAgentHash) {
    console.error("Usage: npx tsx scripts/fix-admin-status.ts <your-session-token> <your-session-binding>");
    console.error("Get the binding from the active app session context before running this script.");
    process.exit(1);
  }

  try {
    // Get all users
    const users = await convex.query(api.auth.getAllUsers, { sessionToken, userAgentHash });
    console.log("All users:", users);

    // Find admin users
    const admins = users.filter((u: any) => u.role === "admin");
    console.log("Admin users:", admins);

    // Update each admin to approved status
    for (const admin of admins) {
      console.log(`Updating admin ${admin.username} to approved status...`);
      await convex.mutation(api.auth.approveUserByUsername, {
        sessionToken,
        username: admin.username,
      });
      console.log(`✓ Updated ${admin.username}`);
    }

    console.log("Done!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixAdminStatus();
