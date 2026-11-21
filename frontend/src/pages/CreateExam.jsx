import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/axios";

function formatDateTimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function toIsoDateTime(value) {
  return value ? new Date(value).toISOString() : null;
}

export default function CreateExam() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const [questions, setQuestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState({
    title: "",
    description: "",
    instructions: "",
    durationMinutes: 30,
    passingPercentage: 0,
    cutoffPercentage: 70,
    startTime: "",
    endTime: "",
    randomizeQuestions: false,
    randomizeOptions: false,
    isPublished: false,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/questions"), examId ? api.get("/exams") : Promise.resolve(null)])
      .then(([questionResponse, examResponse]) => {
        setQuestions(questionResponse.data);
        if (!examId) return;
        const exam = examResponse.data.find((item) => item._id === examId);
        if (!exam) return;
        setForm({
          title: exam.title,
          description: exam.description || "",
          instructions: exam.instructions || "",
          durationMinutes: exam.durationMinutes,
          passingPercentage: exam.passingPercentage ?? 0,
          cutoffPercentage: exam.cutoffPercentage ?? 70,
          startTime: exam.startTime ? formatDateTimeLocal(exam.startTime) : "",
          endTime: exam.endTime ? formatDateTimeLocal(exam.endTime) : "",
          randomizeQuestions: exam.randomizeQuestions || false,
          randomizeOptions: exam.randomizeOptions || false,
          isPublished: exam.isPublished,
        });
        setSelected(new Set(exam.questions.map((question) => question._id)));
      });
  }, [examId]);

  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  const totalMarks = questions
    .filter((q) => selected.has(q._id))
    .reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  const selectedCodingCount = questions
    .filter((question) => selected.has(question._id) && question.type === "coding")
    .length;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (selected.size === 0) {
      setError("Select at least one question from the bank.");
      return;
    }
    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      setError("The closing time must be later than the opening time.");
      return;
    }
    try {
      const payload = {
        ...form,
        durationMinutes: Number(form.durationMinutes),
        questionIds: Array.from(selected),
        startTime: toIsoDateTime(form.startTime),
        endTime: toIsoDateTime(form.endTime),
      };
      if (examId) await api.put(`/exams/${examId}`, payload);
      else await api.post("/exams", payload);
      navigate(`/admin`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="page">
      <p className="page-eyebrow">Admin</p>
      <h1>{examId ? "Edit assessment" : "Create assessment"}</h1>

      <form className="two-col" onSubmit={handleSubmit}>
        <div className="card form-card">
          {error && <div className="alert alert-error">{error}</div>}

          <label>
            Exam title
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>

          <label>
            Description <span className="optional">(shown to students)</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <label>
            Instructions
            <textarea
              rows={3}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
          </label>

          <label>
            Duration (minutes)
            <input
              type="number"
              min={1}
              required
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </label>

          <div className="field-row">
            <label>
              Passing percentage
              <input type="number" min="0" max="100" value={form.passingPercentage} onChange={(e) => setForm({ ...form, passingPercentage: e.target.value })} />
            </label>
            <label>
              Shortlist cutoff (%)
              <input type="number" min="0" max="100" value={form.cutoffPercentage} onChange={(e) => setForm({ ...form, cutoffPercentage: e.target.value })} />
            </label>
          </div>

          <label className="checkbox-inline">
            <input type="checkbox" checked={form.randomizeQuestions} onChange={(e) => setForm({ ...form, randomizeQuestions: e.target.checked })} />
            Randomize question order
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={form.randomizeOptions} onChange={(e) => setForm({ ...form, randomizeOptions: e.target.checked })} />
            Randomize answer options
          </label>

          <div className="field-row">
            <label>
              Opens at <span className="optional">(optional)</span>
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </label>
            <label>
              Closes at <span className="optional">(optional)</span>
              <input
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </label>
          </div>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
            />
            Publish immediately (visible to students)
          </label>

          <p className="hint">
            Selected: {selected.size} question(s) · Total marks: {totalMarks}
          </p>
          {selectedCodingCount > 0 && (
            <p className="hint" role="status">
              {selectedCodingCount} coding question(s) selected. Mixed MCQ and coding assessments are supported.
              Students can choose a language for each coding question and run its sample tests.
            </p>
          )}

          <button className="btn btn-primary btn-block">{examId ? "Save assessment" : "Create assessment"}</button>
        </div>

        <div className="list-panel">
          <p className="field-label">Select questions from the bank</p>
          <div className="question-list">
            {questions.filter((question) => question.isActive !== false || selected.has(question._id)).map((q) => (
              <label className="question-item selectable" key={q._id}>
                <input type="checkbox" checked={selected.has(q._id)} onChange={() => toggle(q._id)} />
                <div>
                  <span className={`badge badge-${q.type}`}>{q.type.toUpperCase()}</span>
                  <strong>{q.title}</strong>
                  <p className="question-meta">
                    {q.difficulty} · {q.marks} marks
                  </p>
                </div>
              </label>
            ))}
            {questions.length === 0 && (
              <p className="empty-cell">
                No questions in the bank yet. Add some in the Question Bank page first.
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
