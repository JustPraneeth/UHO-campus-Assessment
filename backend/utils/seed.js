require("../lib/loadEnv")();
const { insertRow, query } = require("../lib/database");

const sampleQuestions = [
  {
    type: "mcq",
    title: "Capital of France",
    description: "What is the capital of France?",
    category: "Verbal Ability",
    tags: ["geography", "easy"],
    difficulty: "easy",
    marks: 1,
    options: ["Berlin", "Madrid", "Paris", "Rome"],
    correct_option_index: 2,
  },
  {
    type: "mcq",
    title: "JavaScript typeof null",
    description: "In JavaScript, what does typeof null evaluate to?",
    category: "Basic Programming/Technical Questions",
    tags: ["javascript", "programming"],
    difficulty: "medium",
    marks: 2,
    options: ["null", "undefined", "object", "number"],
    correct_option_index: 2,
  },
  {
    type: "coding",
    title: "Sum of two numbers",
    description: "Read two space-separated integers and return their sum.",
    category: "Basic Programming/Technical Questions",
    tags: ["basics", "math"],
    difficulty: "easy",
    marks: 5,
    language: "javascript",
    starter_code: "function solve(input) {\n  const [a, b] = input.trim().split(' ').map(Number);\n  return a + b;\n}\n",
    test_cases: [
      { input: "2 3", expectedOutput: "5", hidden: false },
      { input: "10 20", expectedOutput: "30", hidden: false },
      { input: "-5 5", expectedOutput: "0", hidden: true },
    ],
  },
  {
    type: "mcq",
    title: "Conflict Resolution",
    description: "You are working on a team project, and a colleague strongly disagrees with your proposed strategy during a meeting. How do you handle the situation?",
    category: "Soft Skills",
    tags: ["soft-skills", "first-round-interview", "conflict-resolution"],
    difficulty: "medium",
    marks: 1,
    options: [
      "Defend your strategy firmly during the meeting to ensure the project stays on the right track.",
      "Listen carefully to their perspective, acknowledge their points, and suggest discussing the pros and cons together to find a compromise.",
      "Agree with their points during the meeting to avoid conflict, but proceed with your original plan afterward.",
      "Ask the project manager to step in immediately and decide which strategy is better.",
    ],
    correct_option_index: 1,
  },
  {
    type: "mcq",
    title: "Time Management & Prioritization",
    description: "Your manager assigns you an urgent task, but you are already working on a tight deadline for another critical project. What is your first step?",
    category: "Soft Skills",
    tags: ["soft-skills", "first-round-interview", "prioritization"],
    difficulty: "medium",
    marks: 1,
    options: [
      "Accept the new task and work overtime without mentioning your current workload to prove your dedication.",
      "Drop your current project immediately to focus entirely on the new, urgent assignment.",
      "Clarify the priorities and deadlines of both tasks with your manager to realistically evaluate what can be delivered first.",
      "Pass the new task to a teammate so you can finish your original project on time.",
    ],
    correct_option_index: 2,
  },
  {
    type: "mcq",
    title: "Adaptability & Handling Failure",
    description: "You spent a week preparing a presentation, but due to a sudden shift in client requirements, your team decides to scrap your idea completely. How do you react?",
    category: "Soft Skills",
    tags: ["soft-skills", "first-round-interview", "adaptability"],
    difficulty: "medium",
    marks: 1,
    options: [
      "Express your frustration to the team about the wasted time and effort.",
      "Accept the change smoothly, ask for feedback on the new direction, and pivot your efforts toward the new goals.",
      "Refuse to work on the new direction and insist that your original idea still has value.",
      "Complete the new task with minimal effort since you feel your hard work isn't appreciated.",
    ],
    correct_option_index: 1,
  },
  {
    type: "mcq",
    title: "Communication & Teamwork",
    description: "You notice that a teammate is falling behind on their deliverables, which might delay the entire project launch. What do you do?",
    category: "Soft Skills",
    tags: ["soft-skills", "first-round-interview", "teamwork"],
    difficulty: "medium",
    marks: 1,
    options: [
      "Report their poor performance to the manager immediately so the team doesn't take the blame.",
      "Ignore the situation and focus strictly on your own tasks so your metrics look good.",
      "Reach out to the teammate privately, ask if they are facing roadblocks, and offer support if your capacity allows.",
      "Take over their work completely without telling them to make sure it gets done faster.",
    ],
    correct_option_index: 2,
  },
  {
    type: "mcq",
    title: "Customer Focus / Empathy",
    description: "An angry client contacts you, complaining about a mistake made by another department in your company. How do you respond?",
    category: "Soft Skills",
    tags: ["soft-skills", "first-round-interview", "customer-empathy"],
    difficulty: "medium",
    marks: 1,
    options: [
      "Explain to the client that it wasn't your department's fault and give them the contact info for the correct team.",
      "Listen to their frustration, apologize for the negative experience, and take ownership of finding the right internal contact to resolve it.",
      "Tell the client that mistakes happen and ask them to submit a formal ticket online.",
      "Defend your company's processes and explain why the mistake likely occurred.",
    ],
    correct_option_index: 1,
  },
  {
    type: "mcq",
    title: "Active Listening Skills",
    description: "Which of the following demonstrate effective active listening during a complex team discussion? (Select TWO options.)",
    category: "Soft Skills",
    tags: ["soft-skills", "first-round-interview", "active-listening"],
    difficulty: "medium",
    marks: 1,
    options: [
      "Interrupting as soon as you have a counterargument so you don't forget it.",
      "Paraphrasing key points back to the speaker to confirm understanding before responding.",
      "Asking open-ended clarifying questions to gain deeper context into the issue.",
      "Preparing your reply in your head while the other person is still speaking.",
    ],
    allow_multiple_correct: true,
    correct_option_indexes: [1, 2],
  },
  {
    type: "mcq",
    title: "Constructive Feedback",
    description: "You need to deliver constructive feedback to a peer about a mistake that affected a client deliverable. Which approaches should you take? (Select TWO options.)",
    category: "Soft Skills",
    tags: ["soft-skills", "first-round-interview", "feedback"],
    difficulty: "medium",
    marks: 1,
    options: [
      "Provide the feedback in a private 1-on-1 setting rather than in front of the team.",
      "Focus on specific behavior and objective facts rather than personal attributes.",
      "Send a broadcast email to the team detailing the mistake so everyone learns from it.",
      "Frame the issue as a personal flaw so they understand the severity of the mistake.",
    ],
    allow_multiple_correct: true,
    correct_option_indexes: [0, 1],
  },
  {
    type: "mcq",
    title: "Effective Delegation & Leadership",
    description: "You are leading a project and need to delegate tasks to team members. Which practices lead to successful delegation? (Select THREE options.)",
    category: "Soft Skills",
    tags: ["soft-skills", "first-round-interview", "delegation"],
    difficulty: "medium",
    marks: 1,
    options: [
      "Match tasks to individual team strengths and growth opportunities.",
      "Clearly state the expected outcomes, deadlines, and success criteria.",
      "Hover over team members constantly and check in hourly to micromanage their work.",
      "Offer support and establish clear milestone check-in points.",
    ],
    allow_multiple_correct: true,
    correct_option_indexes: [0, 1, 3],
  },
  {
    type: "mcq",
    title: "Stress & Workload Management",
    description: "When facing high volume and short deadlines across multiple projects, which strategies demonstrate strong self-management? (Select TWO options.)",
    category: "Soft Skills",
    tags: ["soft-skills", "first-round-interview", "workload-management"],
    difficulty: "medium",
    marks: 1,
    options: [
      "Categorize tasks using a priority matrix (e.g., urgent vs. important) to focus on key impact items.",
      "Communicate early with stakeholders if a target deadline is at risk.",
      "Hide struggling progress until the final deadline hoping to solve it last minute.",
      "Say 'yes' to all new incoming requests to show enthusiasm, regardless of capacity.",
    ],
    allow_multiple_correct: true,
    correct_option_indexes: [0, 1],
  },
];

async function seed() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) throw new Error("Set ADMIN_EMAIL to the email address of the Clerk admin account");
  const { rows: profiles } = await query(
    `INSERT INTO profiles (email, name, role) VALUES ($1, 'UHO Admin', 'admin')
     ON CONFLICT (email) DO UPDATE SET role = 'admin', updated_at = now() RETURNING id`,
    [email]
  );
  const userId = profiles[0].id;

  const { rows: existingQuestions } = await query("SELECT title FROM questions");
  const titles = new Set(existingQuestions.map((question) => question.title));
  const missing = sampleQuestions.filter((question) => !titles.has(question.title)).map((question) => ({
    ...question,
    created_by: userId,
  }));
  for (const question of missing) {
    await insertRow("questions", question, [
      "type", "title", "description", "category", "tags", "difficulty", "marks", "options",
      "correct_option_index", "allow_multiple_correct", "correct_option_indexes",
      "language", "starter_code", "test_cases", "created_by",
    ]);
  }
  console.log(`PostgreSQL seed complete for ${email}; ${missing.length} sample question(s) added.`);
}

if (require.main === module) {
  seed().catch((error) => {
    console.error(`[seed] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { sampleQuestions };