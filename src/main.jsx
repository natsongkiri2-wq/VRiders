import React from "react";
import ReactDOM from "react-dom/client";
import { inject } from "@vercel/analytics";
import App from "./App.jsx";
import { installGlobalErrorHandlers, reportError } from "./errorTracking.js";
import "./index.css";

// Cookie-free page-view analytics (turn on "Web Analytics" for the project in
// the Vercel dashboard; until then this is a harmless no-op).
inject();
installGlobalErrorHandlers();

// Last-resort safety net: if the React tree crashes, report it and show a
// plain reload prompt instead of a blank white screen.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error, info) {
    reportError(
      { message: error && error.message, stack: `${(error && error.stack) || ""}\n${(info && info.componentStack) || ""}` },
      "react"
    );
  }
  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#122320", color: "#F4EEDD", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div>
          <p style={{ fontSize: 18, marginBottom: 6 }}>Something went wrong.</p>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 18 }}>Quelque chose s'est mal passé.</p>
          <button onClick={() => window.location.reload()} style={{ background: "#E56A3E", color: "#fff", border: 0, borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Reload / Recharger
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
