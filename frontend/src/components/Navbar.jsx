import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import uhoLogo from "../assets/UHO-LOGO.png";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <Link to="/" className="navbar-brand" aria-label="UHO home">
        <img src={uhoLogo} alt="UHO logo" className="navbar-mark" />
        Campus Assessment
      </Link>

      {user && (
        <nav className="navbar-links">
          {user.role === "admin" ? (
            <>
              <Link to="/admin">Dashboard</Link>
              <Link to="/admin/candidates">Candidates</Link>
              <Link to="/admin/questions">Question Bank</Link>
              <Link to="/admin/exams/new">Create Exam</Link>
              <Link to="/admin/architecture">Platform</Link>
            </>
          ) : (
            <>
              <Link to="/student">Dashboard</Link>
              <Link to="/student/results">My Results</Link>
            </>
          )}
        </nav>
      )}

      <div className="navbar-user">
        {user ? (
          <>
            <span className="navbar-username">
              {user.name} <span className="navbar-role">· {user.role}</span>
            </span>
            <button
              className="btn btn-ghost"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link className="btn btn-ghost" to="/login">
              Sign in
            </Link>
            <Link className="btn btn-primary" to="/register">
              Create account
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
