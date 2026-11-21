const asyncHandler = require("express-async-handler");
const { getPool, query, toCamel } = require("../lib/database");
const { clusterCandidates } = require("../utils/performanceInsights");
const { buildItemAnalysis } = require("../utils/itemAnalysis");

const getStats = asyncHandler(async (req, res) => {
  const results = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM profiles WHERE role = 'student'"),
    query("SELECT COUNT(*)::int AS count FROM questions"),
    query("SELECT COUNT(*)::int AS count FROM assessments"),
    query("SELECT COUNT(*)::int AS count FROM submissions WHERE status = 'evaluated'"),
  ]);
  res.json({
    studentCount: results[0].rows[0].count,
    questionCount: results[1].rows[0].count,
    examCount: results[2].rows[0].count,
    submissionCount: results[3].rows[0].count,
  });
});

const getStudents = asyncHandler(async (req, res) => {
  const { rows } = await query("SELECT * FROM profiles WHERE role = 'student' ORDER BY created_at DESC");
  res.json(rows.map(toCamel));
});

const getExamReport = asyncHandler(async (req, res) => {
  const { rows: exams } = await query("SELECT * FROM assessments WHERE id = $1", [req.params.examId]);
  const exam = exams[0];
  if (!exam) {
    res.status(404);
    throw new Error("Assessment not found");
  }
  const [registrationResult, submissionResult, warningResult] = await Promise.all([
    query("SELECT student_id, created_at FROM assessment_registrations WHERE exam_id = $1 ORDER BY created_at DESC", [exam.id]),
    query("SELECT * FROM submissions WHERE exam_id = $1", [exam.id]),
    query(
      `SELECT s.student_id, e.event_type, COUNT(*)::int AS count, MAX(e.created_at) AS last_at
       FROM assessment_proctor_events e
       JOIN submissions s ON s.id = e.submission_id
       WHERE s.exam_id = $1
       GROUP BY s.student_id, e.event_type`,
      [exam.id]
    ),
  ]);
  const registrations = registrationResult.rows;
  const submissions = submissionResult.rows;
  const studentIds = [...new Set([
    ...registrations.map((registration) => registration.student_id),
    ...submissions.map((submission) => submission.student_id),
  ])];
  const { rows: profiles } = studentIds.length
    ? await query("SELECT * FROM profiles WHERE id = ANY($1::uuid[])", [studentIds])
    : { rows: [] };
  const profileById = new Map(profiles.map((profile) => [profile.id, toCamel(profile)]));
  const registrationByStudent = new Map(registrations.map((registration) => [registration.student_id, registration]));
  const submissionByStudent = new Map(submissions.map((submission) => [submission.student_id, submission]));
  const warningsByStudent = new Map();
  warningResult.rows.forEach((warning) => {
    const warnings = warningsByStudent.get(warning.student_id) || { total: 0, events: [] };
    warnings.total += warning.count;
    warnings.events.push({
      type: warning.event_type,
      count: warning.count,
      lastAt: warning.last_at,
    });
    warningsByStudent.set(warning.student_id, warnings);
  });
  const evaluated = submissions.filter((submission) => submission.status === "evaluated");
  const ranked = [...evaluated].sort((left, right) => right.total_marks_awarded - left.total_marks_awarded || new Date(left.submitted_at) - new Date(right.submitted_at));
  const rankByStudent = new Map();
  let previousScore;
  let previousRank = 0;
  ranked.forEach((submission, index) => {
    const score = Number(submission.total_marks_awarded);
    if (score !== previousScore) previousRank = index + 1;
    rankByStudent.set(submission.student_id, previousRank);
    previousScore = score;
  });
  const { rows: questions } = exam.question_ids?.length
    ? await query(
      "SELECT id, title, category, difficulty FROM questions WHERE id = ANY($1::uuid[]) AND type = 'mcq'",
      [exam.question_ids]
    )
    : { rows: [] };

  const candidates = profiles.map((profileRow) => {
    const profile = toCamel(profileRow);
    const studentId = profileRow.id;
    const registration = registrationByStudent.get(studentId);
    const submission = submissionByStudent.get(studentId);
    const warnings = warningsByStudent.get(studentId) || { total: 0, events: [] };
    const status = !submission ? "not-attempted" : submission.status === "evaluated" ? "completed" : "in-progress";
    const candidate = {
      ...profile,
      createdAt: registration?.created_at || profile.createdAt,
      examName: exam.title,
      assessmentDate: exam.start_time || submission?.started_at || null,
      status,
      testStartedAt: submission?.started_at || null,
      testSubmittedAt: submission?.submitted_at || null,
      score: submission?.total_marks_awarded ?? null,
      totalMarks: submission?.total_marks_possible ?? exam.total_marks,
      percentage: submission?.percentage ?? null,
      passed: status === "completed" && submission.percentage >= exam.passing_percentage,
      rank: rankByStudent.get(studentId) || null,
      selectionStatus: submission?.selection_status || "pending",
      submissionId: submission?.id || null,
      warningCount: warnings.total,
      warningEvents: warnings.events,
      questionsAttempted: submission?.questions_attempted || 0,
      correctAnswers: submission?.correct_answers || 0,
      incorrectAnswers: submission?.incorrect_answers || 0,
      unansweredQuestions: submission?.unanswered_questions || 0,
      accuracy: submission?.accuracy || 0,
      timeTakenSeconds: submission?.time_taken_seconds || 0,
      sectionScores: submission?.section_scores || [],
    };
    return candidate;
  });
  const values = evaluated.map((submission) => Number(submission.percentage)).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length ? (values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2) : 0;
  const sectionMap = new Map();
  evaluated.forEach((submission) => (submission.section_scores || []).forEach((section) => {
    const item = sectionMap.get(section.category) || { category: section.category, sum: 0, count: 0 };
    item.sum += Number(section.percentage);
    item.count += 1;
    sectionMap.set(section.category, item);
  }));
  const { candidates: profiledCandidates, profiles: performanceProfiles } = clusterCandidates(candidates);
  const collegeMap = new Map();
  profiledCandidates.filter((candidate) => candidate.percentage != null).forEach((candidate) => {
    const college = candidate.collegeName || "Not provided";
    const item = collegeMap.get(college) || { college, sum: 0, count: 0 };
    item.sum += Number(candidate.percentage);
    item.count += 1;
    collegeMap.set(college, item);
  });
  const average = values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : 0;
  res.json({
    exam: { ...toCamel(exam), registeredCount: registrations.length },
    stats: {
      registered: registrations.length,
      started: submissions.length,
      completed: evaluated.length,
      inProgress: submissions.filter((submission) => submission.status === "in-progress" || submission.status === "evaluating").length,
      totalWarnings: warningResult.rows.reduce((total, warning) => total + warning.count, 0),
      candidatesWithWarnings: new Set(warningResult.rows.map((warning) => warning.student_id)).size,
      notAttempted: Math.max(0, registrations.length - submissions.length),
      highestPercentage: values.at(-1) || 0,
      averagePercentage: Math.round(average * 100) / 100,
      lowestPercentage: values[0] || 0,
      medianPercentage: Math.round(median * 100) / 100,
      shortlisted: evaluated.filter((submission) => submission.selection_status === "shortlisted").length,
      scoreDistribution: [0, 1, 2, 3, 4].map((bucket) => ({
        range: `${bucket * 20}-${bucket === 4 ? 100 : bucket * 20 + 19}%`,
        count: values.filter((score) => score >= bucket * 20 && score < (bucket === 4 ? 101 : bucket * 20 + 20)).length,
      })),
      sectionPerformance: Array.from(sectionMap.values()).map((section) => ({ category: section.category, averagePercentage: Math.round(section.sum / section.count * 100) / 100 })),
      collegePerformance: Array.from(collegeMap.values()).map((college) => ({ college: college.college, candidates: college.count, averagePercentage: Math.round(college.sum / college.count * 100) / 100 })),
    },
    candidates: profiledCandidates,
    performanceProfiles,
    itemAnalysis: buildItemAnalysis(questions, evaluated),
    aiMethod: "K-means clustering of candidate section-score percentages (up to three profiles); profiles are descriptive and do not make hiring decisions.",
  });
});

const applyCutoff = asyncHandler(async (req, res) => {
  const cutoffPercentage = Number(req.body.cutoffPercentage);
  if (!Number.isFinite(cutoffPercentage) || cutoffPercentage < 0 || cutoffPercentage > 100) {
    res.status(400);
    throw new Error("Cutoff must be between 0 and 100");
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "UPDATE assessments SET cutoff_percentage = $1, updated_at = now() WHERE id = $2 RETURNING cutoff_percentage",
      [cutoffPercentage, req.params.examId]
    );
    if (!rows[0]) {
      const error = new Error("Assessment not found");
      error.statusCode = 404;
      throw error;
    }
    await client.query(
      `UPDATE submissions SET selection_status = CASE WHEN percentage >= $1 THEN 'shortlisted' ELSE 'rejected' END,
       updated_at = now() WHERE exam_id = $2 AND status = 'evaluated'`,
      [cutoffPercentage, req.params.examId]
    );
    await client.query("COMMIT");
    res.json({ cutoffPercentage: rows[0].cutoff_percentage });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = { getStats, getStudents, getExamReport, applyCutoff };