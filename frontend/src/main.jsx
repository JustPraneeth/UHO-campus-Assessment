import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./styles/index.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const root = ReactDOM.createRoot(document.getElementById("root"));

if (!clerkPublishableKey) {
  root.render(
    <div className="auth-page">
      <section className="auth-card" role="alert">
        <p className="auth-eyebrow">Setup required</p>
        <h1>Connect Clerk to continue</h1>
        <p className="auth-sub">The app is running, but the selected Clerk application is not linked yet.</p>
        <p className="auth-sub">1. In your host terminal, run <code>npx -y clerk@latest auth login</code>.</p>
        <p className="auth-sub">2. In the frontend folder, run <code>npx -y clerk@latest init --app app_3LGePJyzVjnJG4POVORdkB7upYa</code>.</p>
        <p className="auth-sub">3. In backend/.env, configure DATABASE_URL and the Clerk publishable and secret keys. Keep secret values on your machine; do not paste them into chat.</p>
        <p className="auth-sub">Restart with <code>npm run dev</code> from the workspace root after setup.</p>
      </section>
    </div>
  );
} else {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ClerkProvider>
    </React.StrictMode>
  );
}
