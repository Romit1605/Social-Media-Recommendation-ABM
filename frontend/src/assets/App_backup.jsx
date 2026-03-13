import { useState } from "react";
import axios from "axios";

const API = "http://localhost:8050";

function App() {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleError = (err) => {
    console.error(err);
    const msg =
      err?.response?.data?.detail ||
      err?.message ||
      "Something went wrong while calling the backend.";
    setError(String(msg));
    setMessage("Request failed");
  };

  const clearError = () => setError("");

  const initModel = async () => {
    try {
      setLoading(true);
      clearError();
      setMessage("Initializing model...");
      const res = await axios.post(`${API}/init`, {
        num_users: 100,
        num_creators: 10,
        simulation_steps: 200,
      });
      setState(res.data);
      setMessage("Model initialized successfully");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const stepModel = async () => {
    try {
      setLoading(true);
      clearError();
      setMessage("Running one step...");
      const res = await axios.post(`${API}/step`, {});
      setState(res.data);
      setMessage("Step completed");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const runModel = async () => {
    try {
      setLoading(true);
      clearError();
      setMessage("Running 10 steps...");
      const res = await axios.post(`${API}/run`, {
        steps: 10,
      });
      setState(res.data);
      setMessage("Run completed");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const resetModel = async () => {
    try {
      setLoading(true);
      clearError();
      setMessage("Resetting model...");
      const res = await axios.post(`${API}/reset`, {});
      setState(res.data);
      setMessage("Model reset");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const getState = async () => {
    try {
      setLoading(true);
      clearError();
      setMessage("Fetching current state...");
      const res = await axios.get(`${API}/state`);
      setState(res.data);
      setMessage("State loaded");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1e1f23",
        color: "white",
        padding: "40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "56px", marginBottom: "24px" }}>
        Echo Chamber Simulation
      </h1>

      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button onClick={initModel} disabled={loading}>Init</button>
        <button onClick={stepModel} disabled={loading}>Step</button>
        <button onClick={runModel} disabled={loading}>Run 10</button>
        <button onClick={getState} disabled={loading}>State</button>
        <button onClick={resetModel} disabled={loading}>Reset</button>
      </div>

      <div style={{ marginBottom: "12px", color: "#9ad1ff" }}>
        <strong>Status:</strong> {loading ? "Working..." : message}
      </div>

      {error && (
        <div
          style={{
            background: "#4b1f1f",
            color: "#ffb3b3",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "16px",
            maxWidth: "900px",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      <div
        style={{
          background: "#111216",
          padding: "16px",
          borderRadius: "12px",
          maxWidth: "1100px",
          overflowX: "auto",
          border: "1px solid #333",
        }}
      >
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
          {JSON.stringify(state, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default App;