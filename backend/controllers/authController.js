const asyncHandler = require("express-async-handler");
const { query, toCamel, toSnake, updateRow } = require("../lib/database");

const profileColumns = [
  "name", "college_name", "university", "degree", "branch", "passing_year",
  "current_year_semester", "roll_number", "city",
];

const me = asyncHandler(async (req, res) => {
  res.json(req.user);
});

const updateMe = asyncHandler(async (req, res) => {
  const payload = toSnake(req.body);
  if (typeof payload.name !== "string" || !payload.name.trim()) {
    res.status(400);
    throw new Error("Name is required");
  }
  if (payload.passing_year !== undefined) {
    payload.passing_year = Number(payload.passing_year);
    if (!Number.isInteger(payload.passing_year) || payload.passing_year < 1900 || payload.passing_year > 2200) {
      res.status(400);
      throw new Error("Year of passing must be between 1900 and 2200");
    }
  }
  const fields = Object.fromEntries(Object.entries(payload).filter(([column]) => profileColumns.includes(column)));
  const idPlaceholder = Object.keys(fields).length + 1;
  const profile = await updateRow("profiles", fields, profileColumns, `id = $${idPlaceholder}`, [req.authUser.id]);
  if (!profile) {
    res.status(404);
    throw new Error("Account profile not found");
  }
  const { rows } = await query("SELECT email FROM profiles WHERE id = $1", [req.authUser.id]);
  res.json({ ...toCamel(profile), email: rows[0]?.email || req.user.email });
});

module.exports = { me, updateMe };