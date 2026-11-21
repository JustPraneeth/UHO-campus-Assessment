import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import PrivateRoute from "./components/PrivateRoute";
import { useAuth } from "./context/AuthContext";

import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminDashboard from "./pages/AdminDashboard";
import AdminCandidates from "./pages/AdminCandidates";
import AdminArchitecture from "./pages/AdminArchitecture";
import QuestionBank from "./pages/QuestionBank";
import CreateExam from "./pages/CreateExam";
import ExamResultsAdmin from "./pages/ExamResultsAdmin";
import StudentDashboard from "./pages/StudentDashboard";
import TakeExam from "./pages/TakeExam";
import ExamResult from "./pages/ExamResult";
import ResultsList from "./pages/ResultsList";

function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin" : "/student"} replace />;
}

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/admin"
          element={
            <PrivateRoute role="admin">
              <AdminDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/candidates"
          element={
            <PrivateRoute role="admin">
              <AdminCandidates />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/architecture"
          element={
            <PrivateRoute role="admin">
              <AdminArchitecture />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/questions"
          element={
            <PrivateRoute role="admin">
              <QuestionBank />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/exams/new"
          element={
            <PrivateRoute role="admin">
              <CreateExam />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/exams/:examId/edit"
          element={
            <PrivateRoute role="admin">
              <CreateExam />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/exams/:examId/results"
          element={
            <PrivateRoute role="admin">
              <ExamResultsAdmin />
            </PrivateRoute>
          }
        />

        <Route
          path="/student"
          element={
            <PrivateRoute role="student">
              <StudentDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/student/results"
          element={
            <PrivateRoute role="student">
              <ResultsList />
            </PrivateRoute>
          }
        />
        <Route
          path="/student/exam/:id"
          element={
            <PrivateRoute role="student">
              <TakeExam />
            </PrivateRoute>
          }
        />

        <Route
          path="/results/:id"
          element={
            <PrivateRoute>
              <ExamResult />
            </PrivateRoute>
          }
        />

        <Route path="*" element={<div className="page">Page not found.</div>} />
      </Routes>
    </div>
  );
}
