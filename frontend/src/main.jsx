import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import Guarda from "./components/Guarda.jsx";
import "./fonts.css";
import "./styles.css";
import "./design-ui.css";
import "./sistema.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <Guarda>
        <App />
      </Guarda>
    </HashRouter>
  </React.StrictMode>,
);
