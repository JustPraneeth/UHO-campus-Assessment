const asyncHandler = require("express-async-handler");
const { clerkClient, getAuth } = require("@clerk/express");
const { query, toCamel } = require("../lib/database");

const protect = asyncHandler(async (req, res, next) => {
  const { isAuthenticated, userId } = getAuth(req);
  if (!isAuthenticated || !userId) {
    const authorization = req.get("authorization");
    const authStatus = res.getHeader("x-clerk-auth-status") || "unknown";
    const authReason = res.getHeader("x-clerk-auth-reason") || "unknown";
    const authHeaderStatus = authorization ? "present" : "missing";
    console.warn(`[auth] ${req.method} ${req.path}: authorization=${authHeaderStatus}, Clerk status=${authStatus}, reason=${authReason}`);
    res.status(401);
    throw new Error("Sign in with your Clerk account to continue");
  }

  const clerkUser = await clerkClient.users.getUser(userId);
  const emailAddress = clerkUser.emailAddresses.find((address) => address.id === clerkUser.primaryEmailAddressId);
  if (!emailAddress || emailAddress.verification?.status !== "verified") {
    res.status(401);
    throw new Error("Verify your email address before continuing");
  }
  const email = emailAddress.emailAddress.toLowerCase();
  const { rows: clerkProfiles } = await query("SELECT * FROM profiles WHERE clerk_id = $1", [userId]);
  let profile = clerkProfiles[0];

  if (!profile) {
    const { rows: emailProfiles } = await query("SELECT * FROM profiles WHERE lower(email) = $1", [email]);
    profile = emailProfiles[0];
    if (profile?.clerk_id && profile.clerk_id !== userId) {
      res.status(409);
      throw new Error("This email is already linked to another account. Contact an administrator.");
    }
    if (profile) {
      const { rows } = await query(
        "UPDATE profiles SET clerk_id = $1, email = $2, updated_at = now() WHERE id = $3 RETURNING *",
        [userId, email, profile.id]
      );
      profile = rows[0];
    }
  }

  if (!profile) {
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || email.split("@")[0];
    const { rows } = await query(
      `INSERT INTO profiles (clerk_id, email, name, role) VALUES ($1, $2, $3, 'student')
       ON CONFLICT (email) DO UPDATE
       SET clerk_id = COALESCE(profiles.clerk_id, EXCLUDED.clerk_id), updated_at = now()
       WHERE profiles.clerk_id IS NULL OR profiles.clerk_id = EXCLUDED.clerk_id
       RETURNING *`,
      [userId, email, name]
    );
    profile = rows[0];
    if (!profile) {
      res.status(409);
      throw new Error("This email is already linked to another account. Contact an administrator.");
    }
  }

  req.authUser = { id: profile.id, clerkId: userId };
  req.user = toCamel(profile);
  next();
});

// Restrict route to specific roles, e.g. authorize("admin")
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }
    next();
  };

module.exports = { protect, authorize };
