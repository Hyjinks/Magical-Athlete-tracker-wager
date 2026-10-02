import React from "react";
import { createRoot } from "react-dom/client";
import { installStorage } from "./storage.js";
import App from "./App.jsx";
import "./index.css";

// App.jsx reads and writes through window.storage, so it has to exist
// before the first render.
installStorage();

createRoot(document.getElementById("root")).render(<App />);
