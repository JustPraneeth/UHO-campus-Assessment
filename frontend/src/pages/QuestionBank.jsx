import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/axios";
import { getCodeTemplate, supportedLanguages } from "../utils/codeTemplates";

const emptyMcq = {
  type: "mcq",
  title: "",
  description: "",
  category: "Quantitative Aptitude",
  tags: "",
  difficulty: "medium",
  marks: 1,
  negativeMarks: 0,
  isActive: true,
  options: ["", "", "", ""],
  correctOptionIndex: 0,
  language: "python",
  starterCode: getCodeTemplate("python"),
  testCasesJson: '[{"input":"","expectedOutput":"","hidden":false}]',
  timeLimitMs: 5000,
  allowMultipleCorrect: false,
  correctOptionIndexes: [],
};

export default function QuestionBank() {
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(emptyMcq);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState({ type: "", search: "" });
  const [editingId, setEditingId] = useState(null);

  async function loadQuestions() {
    try {
      const { data } = await api.get("/questions", { params: filter });
      setQuestions(data);
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const { _id, createdAt, updatedAt, __v, createdBy, testCasesJson, ...editableForm } = form;
      const payload = {
        ...editableForm,
        testCases: form.type === "coding" ? JSON.parse(testCasesJson || "[]") : [],
        allowMultipleCorrect: form.type === "mcq" && Boolean(form.allowMultipleCorrect),
        correctOptionIndexes: form.type === "mcq" && form.allowMultipleCorrect
          ? form.correctOptionIndexes
          : [],
        tags: form.tags
          ? String(form.tags)
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        marks: Number(form.marks),
        negativeMarks: Number(form.negativeMarks),
      };
      if (editingId) await api.put(`/questions/${editingId}`, payload);
      else await api.post("/questions", payload);
      setMessage(editingId ? "Question updated." : "Question added to the bank.");
      setEditingId(null);
      setForm(emptyMcq);
      await loadQuestions();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function editQuestion(question) {
    setEditingId(question._id);
    setForm({
      ...question,
      category: question.category || "General",
      tags: (question.tags || []).join(", "),
      options: question.options || ["", "", "", ""],
      allowMultipleCorrect: Boolean(question.allowMultipleCorrect),
      correctOptionIndexes: question.correctOptionIndexes?.length
        ? question.correctOptionIndexes
        : typeof question.correctOptionIndex === "number" ? [question.correctOptionIndex] : [],
      testCasesJson: JSON.stringify(question.testCases || [], null, 2),
    });
    setError("");
    setMessage("");
  }

  async function toggleQuestionStatus(question) {
    setError("");
    try {
      await api.put(`/questions/${question._id}`, { isActive: !question.isActive });
      await loadQuestions();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    setError("");
    try {
      await api.delete(`/questions/${id}`);
      await loadQuestions();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  function updateOption(idx, value) {
    const options = [...form.options];
    options[idx] = value;
    setForm({ ...form, options });
  }

  function updateLanguage(language) {
    const previousTemplate = getCodeTemplate(form.language);
    const starterCode = !form.starterCode.trim() || form.starterCode === previousTemplate
      ? getCodeTemplate(language)
      : form.starterCode;
    setForm({ ...form, language, starterCode });
  }

  function toggleCorrectOption(idx, checked) {
    const selected = new Set(form.correctOptionIndexes || []);
    if (checked) selected.add(idx);
    else selected.delete(idx);
    setForm({ ...form, correctOptionIndexes: Array.from(selected) });
  }

  return (
    <div className="page">
      <p className="page-eyebrow">Admin</p>
      <h1>Question bank</h1>

      <div className="two-col">
        <form className="card form-card" onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <label>
            Question type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="mcq">Multiple choice</option>
              <option value="coding">Coding</option>
            </select>
          </label>

          <label>
            Title
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>

          <label>
            Question text
            <textarea
              required
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <div className="field-row">
            <label>
              Difficulty
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label>
              Marks
              <input
                type="number"
                min={0}
                step="0.5"
                value={form.marks}
                onChange={(e) => setForm({ ...form, marks: e.target.value })}
              />
            </label>
          </div>

          <div className="field-row">
            <label>
              Category
              <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Quantitative Aptitude" />
            </label>
            <label>
              Negative marks
              <input type="number" min={0} step="0.25" value={form.negativeMarks} onChange={(e) => setForm({ ...form, negativeMarks: e.target.value })} />
            </label>
          </div>

          <label className="checkbox-inline">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active question
          </label>

          <label>
            Tags <span className="optional">(comma separated)</span>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="arrays, easy" />
          </label>

          {form.type === "mcq" ? <>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={Boolean(form.allowMultipleCorrect)}
                onChange={(event) => {
                  const allowMultipleCorrect = event.target.checked;
                  setForm({
                    ...form,
                    allowMultipleCorrect,
                    correctOptionIndexes: allowMultipleCorrect
                      ? (form.correctOptionIndexes?.length ? form.correctOptionIndexes : [form.correctOptionIndex])
                      : [],
                    correctOptionIndex: allowMultipleCorrect
                      ? form.correctOptionIndex
                      : form.correctOptionIndexes?.[0] ?? form.correctOptionIndex,
                  });
                }}
              />
              Allow multiple correct answers
            </label>
            <p className="field-label">Options</p>
            {form.options.map((opt, idx) => (
              <div className="option-row" key={idx}>
                {form.allowMultipleCorrect ? (
                  <input
                    type="checkbox"
                    aria-label={`Mark option ${idx + 1} as correct`}
                    checked={(form.correctOptionIndexes || []).includes(idx)}
                    onChange={(event) => toggleCorrectOption(idx, event.target.checked)}
                  />
                ) : (
                  <input
                    type="radio"
                    name="correct"
                    checked={form.correctOptionIndex === idx}
                    onChange={() => setForm({ ...form, correctOptionIndex: idx })}
                  />
                )}
                <input
                  required
                  placeholder={`Option ${idx + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                />
              </div>
            ))}
            <p className="hint">
              {form.allowMultipleCorrect
                ? "Select every checkbox that marks a correct option."
                : "Select the radio button next to the correct option."}
            </p>
          </> : <>
            <label>
              Default language
              <select value={form.language} onChange={(e) => updateLanguage(e.target.value)}>
                {supportedLanguages.map((language) => (
                  <option value={language.value} key={language.value}>{language.label}</option>
                ))}
              </select>
            </label>
            <label>
              Starter code
              <textarea className="code-textarea code-editor" rows={8} value={form.starterCode} onChange={(e) => setForm({ ...form, starterCode: e.target.value })} />
            </label>
            <label>
              Time limit (milliseconds)
              <input type="number" min={100} max={10000} step={100} value={form.timeLimitMs} onChange={(e) => setForm({ ...form, timeLimitMs: Number(e.target.value) })} />
            </label>
            <label>
              Test cases (JSON array: input, expectedOutput, optional hidden)
              <textarea className="code-textarea" required rows={8} value={form.testCasesJson} onChange={(e) => setForm({ ...form, testCasesJson: e.target.value })} />
            </label>
            <p className="hint coding-testcase-help">
              <strong>Important:</strong> input is literal standard input (stdin) sent to the student's program;
              expectedOutput is what it must print (stdout). Describe the input format in the question—don't
              provide a function-call object unless the student program is written to read that exact text.
              Example: input <code>2&#10;3 4</code>, expected output <code>7</code>. Output is compared using
              OnlineCompiler's trim checker (trailing whitespace is ignored).
            </p>
          </>}

          <button className="btn btn-primary btn-block">{editingId ? "Save question" : "Add to question bank"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => {
              setEditingId(null);
              setForm(emptyMcq);
            }}>Cancel editing</button>
          )}
        </form>

        <div className="list-panel">
          <div className="filter-row">
            <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
              <option value="">All types</option>
              <option value="mcq">MCQ</option>
              <option value="coding">Coding</option>
            </select>
            <input
              placeholder="Search by title…"
              value={filter.search}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            />
          </div>

          <div className="question-list">
            {questions.map((q) => (
              <div className="question-item" key={q._id}>
                <div>
                  <span className={`badge badge-${q.type}`}>{q.type.toUpperCase()}</span>
                  <strong>{q.title}</strong>
                  <p className="question-meta">
                    {q.category} · {q.difficulty} · {q.marks} marks
                    {q.negativeMarks ? ` · −${q.negativeMarks} incorrect` : ""}
                    {q.tags?.length ? ` · ${q.tags.join(", ")}` : ""}
                    {q.isActive === false ? " · Inactive" : " · Active"}
                  </p>
                </div>
                <button className="btn btn-ghost btn-small" onClick={() => editQuestion(q)}>Edit</button>
                <button className="btn btn-ghost btn-small" onClick={() => toggleQuestionStatus(q)}>
                  {q.isActive === false ? "Activate" : "Deactivate"}
                </button>
                <button className="btn-icon" onClick={() => handleDelete(q._id)} title="Delete">
                  ✕
                </button>
              </div>
            ))}
            {questions.length === 0 && <p className="empty-cell">No questions match your filters.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
