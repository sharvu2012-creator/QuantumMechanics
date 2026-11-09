/*
 * Quantum Lab application shell.
 *
 * This file owns:
 *   - language selection and translation lookup,
 *   - the simulation registry and tabs,
 *   - the shared "Why did that happen?" box,
 *   - the optional Gemini question box.
 *
 * A simulation is a small object registered with QuantumLab.registerSimulation.
 * See simulations/tunnelling.js and the README for the shape of that object.
 */
(function () {
  "use strict";

  var SUPPORTED_LANGUAGES = ["en", "hi", "pa"];
  var FALLBACK_LANGUAGE = "en";
  var STORAGE_KEY = "quantum-lab-language";
  var ASK_TIMEOUT_MS = 20000;

  var QuantumLab = window.QuantumLab || {};
  QuantumLab.simulations = QuantumLab.simulations || [];

  QuantumLab.registerSimulation = function (simulation) {
    if (!simulation || !simulation.id || typeof simulation.mount !== "function") {
      throw new Error("A simulation needs an id and a mount() function.");
    }
    if (QuantumLab.simulations.some(function (item) { return item.id === simulation.id; })) {
      throw new Error("Duplicate simulation id: " + simulation.id);
    }
    QuantumLab.simulations.push(simulation);
  };

  QuantumLab.getSimulations = function () {
    return QuantumLab.simulations.slice();
  };

  window.QuantumLab = QuantumLab;

  var currentLanguage = FALLBACK_LANGUAGE;
  var activeSimulation = null;
  var activeHandle = null;
  var lastExplanation = { key: "welcome", vars: {} };
  var askState = { kind: "idle" };
  var elements = {};
  var explanationTimer = null;

  function getLanguageTable(language) {
    return window.TRANSLATIONS && window.TRANSLATIONS[language]
      ? window.TRANSLATIONS[language]
      : null;
  }

  function lookup(language, path) {
    var table = getLanguageTable(language);
    if (!table) return undefined;
    return path.split(".").reduce(function (value, key) {
      if (value && Object.prototype.hasOwnProperty.call(value, key)) return value[key];
      return undefined;
    }, table);
  }

  function interpolate(template, vars) {
    if (typeof template !== "string") return "";
    return template.replace(/\{(\w+)\}/g, function (match, key) {
      return vars && Object.prototype.hasOwnProperty.call(vars, key)
        ? String(vars[key])
        : match;
    });
  }

  function t(key, vars) {
    var value = lookup(currentLanguage, key);
    if (value === undefined) value = lookup(FALLBACK_LANGUAGE, key);
    if (value === undefined) return key;
    return interpolate(value, vars);
  }

  QuantumLab.t = t;
  QuantumLab.getLanguage = function () { return currentLanguage; };

  function detectLanguage() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_LANGUAGES.indexOf(stored) !== -1) return stored;
    } catch (error) {
      // localStorage can be unavailable in privacy modes.
    }
    var browserLanguage = String(navigator.language || "").toLowerCase();
    if (browserLanguage.indexOf("hi") === 0) return "hi";
    if (browserLanguage.indexOf("pa") === 0) return "pa";
    return "en";
  }

  function applyTranslations() {
    document.documentElement.lang = currentLanguage;
    document.title = t("ui.pageTitle");

    document.querySelectorAll("[data-i18n]").forEach(function (element) {
      var key = element.getAttribute("data-i18n");
      var value = t(key);
      if (value) element.textContent = value;
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (element) {
      var key = element.getAttribute("data-i18n-placeholder");
      var value = t(key);
      if (value) element.setAttribute("placeholder", value);
    });

    document.querySelectorAll("[data-i18n-aria]").forEach(function (element) {
      var key = element.getAttribute("data-i18n-aria");
      var value = t(key);
      if (value) element.setAttribute("aria-label", value);
    });

    if (elements.languageSelect) elements.languageSelect.value = currentLanguage;
    renderTabs();
    renderExplanation(false);

    if (activeHandle && typeof activeHandle.refreshTranslations === "function") {
      activeHandle.refreshTranslations();
    }

    if (askState.kind === "loading") renderAskLoading();
    if (askState.kind === "answer") renderAskAnswer(askState.answer);
    if (askState.kind === "error") renderAskError();
    if (askState.kind === "notice") renderAskNotice(askState.messageKey);
  }

  function setLanguage(language) {
    if (SUPPORTED_LANGUAGES.indexOf(language) === -1) language = FALLBACK_LANGUAGE;
    currentLanguage = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch (error) {
      // Ignore storage failures.
    }
    applyTranslations();
  }

  function renderTabs() {
    if (!elements.tabs) return;
    elements.tabs.replaceChildren();

    var label = document.createElement("span");
    label.className = "tabs-label";
    label.textContent = t("ui.simulations");
    elements.tabs.appendChild(label);

    QuantumLab.simulations.forEach(function (simulation) {
      var button = document.createElement("button");
      var active = activeSimulation && activeSimulation.id === simulation.id;
      button.type = "button";
      button.className = "tab-button" + (active ? " active" : "");
      button.textContent = t(simulation.nameKey || "simulations." + simulation.id + ".shortName");
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.addEventListener("click", function () {
        if (!activeSimulation || activeSimulation.id !== simulation.id) {
          mountSimulation(simulation);
        }
      });
      elements.tabs.appendChild(button);
    });

    var soon = document.createElement("span");
    soon.className = "tab-soon";
    soon.textContent = t("ui.comingSoon");
    elements.tabs.appendChild(soon);
  }

  function mountSimulation(simulation) {
    if (!simulation || typeof simulation.mount !== "function") return;

    if (activeHandle && typeof activeHandle.destroy === "function") {
      activeHandle.destroy();
    }

    activeSimulation = simulation;
    elements.simulationRoot.replaceChildren();

    var context = {
      t: t,
      getLanguage: function () { return currentLanguage; },
      setExplanation: function (key, vars) {
        lastExplanation = { key: key || "welcome", vars: vars || {} };
        renderExplanation(true);
      },
      getSimulationName: function () {
        return t(simulation.nameKey || "simulations." + simulation.id + ".title");
      }
    };

    activeHandle = simulation.mount(elements.simulationRoot, context) || null;
    renderTabs();

    if (activeHandle && typeof activeHandle.refreshTranslations === "function") {
      activeHandle.refreshTranslations();
    }
  }

  function renderExplanation(animate) {
    if (!elements.explanationText) return;
    var key = lastExplanation.key || "welcome";
    var text = t("explanations." + key, lastExplanation.vars || {});
    if (!text || text === "explanations." + key) {
      text = t("explanations.welcome");
    }
    elements.explanationText.textContent = text;

    if (animate) {
      elements.explanationText.classList.remove("is-updating");
      // Force a reflow so repeated slider moves restart the small animation.
      void elements.explanationText.offsetWidth;
      elements.explanationText.classList.add("is-updating");
      clearTimeout(explanationTimer);
      explanationTimer = setTimeout(function () {
        elements.explanationText.classList.remove("is-updating");
      }, 450);
    }
  }

  function getFallbackExplanationText() {
    var key = lastExplanation.key || "welcome";
    var text = t("explanations." + key, lastExplanation.vars || {});
    return !text || text === "explanations." + key ? t("explanations.welcome") : text;
  }

  function getAskEndpoint() {
    var config = window.QUANTUM_LAB_CONFIG || {};
    return String(config.askEndpoint || "/.netlify/functions/ask").trim();
  }

  function setAskBusy(busy) {
    if (elements.askSubmit) elements.askSubmit.disabled = busy;
    if (elements.askSubmitLabel) {
      elements.askSubmitLabel.textContent = busy ? t("ui.askThinking") : t("ui.askButton");
    }
  }

  function clearAskOutput() {
    askState = { kind: "idle" };
    if (!elements.askOutput) return;
    elements.askOutput.hidden = true;
    elements.askOutput.className = "ask-output";
    elements.askOutput.replaceChildren();
  }

  function renderAskLoading() {
    askState = { kind: "loading" };
    if (!elements.askOutput) return;
    elements.askOutput.hidden = false;
    elements.askOutput.className = "ask-output is-loading";
    elements.askOutput.textContent = t("ui.askThinking");
    setAskBusy(true);
  }

  function renderAskAnswer(answer) {
    askState = { kind: "answer", answer: answer };
    if (!elements.askOutput) return;
    elements.askOutput.hidden = false;
    elements.askOutput.className = "ask-output is-answer";

    var badge = document.createElement("div");
    badge.className = "ask-badge";
    badge.textContent = "✦ " + t("ui.askSuccess");

    var body = document.createElement("p");
    body.className = "ask-answer-text";
    body.textContent = answer;

    elements.askOutput.replaceChildren(badge, body);
  }

  function renderAskError() {
    if (!elements.askOutput) return;
    var errorKey = askState.errorKey || "askError";
    elements.askOutput.hidden = false;
    elements.askOutput.className = "ask-output is-error";

    var message = document.createElement("p");
    message.className = "ask-error-text";
    message.textContent = t("ui." + errorKey);

    var fallback = document.createElement("div");
    fallback.className = "fallback-explanation";

    var heading = document.createElement("strong");
    heading.textContent = t("ui.askFallbackIntro");

    var body = document.createElement("p");
    body.textContent = getFallbackExplanationText();

    fallback.append(heading, body);
    elements.askOutput.replaceChildren(message, fallback);
  }

  function renderAskNotice(messageKey) {
    askState = { kind: "notice", messageKey: messageKey };
    if (!elements.askOutput) return;
    elements.askOutput.hidden = false;
    elements.askOutput.className = "ask-output is-error";

    var message = document.createElement("p");
    message.className = "ask-error-text";
    message.textContent = t("ui." + messageKey);
    elements.askOutput.replaceChildren(message);
  }

  function showAskError(errorKey) {
    askState = { kind: "error", errorKey: errorKey };
    renderAskError();
  }

  async function handleAskSubmit(event) {
    event.preventDefault();
    if (!elements.askInput) return;

    var question = elements.askInput.value.trim();
    if (!question) {
      renderAskNotice("askEmpty");
      elements.askInput.focus();
      return;
    }

    var endpoint = getAskEndpoint();
    if (!endpoint) {
      showAskError("askNotConfigured");
      return;
    }
    if (location.protocol === "file:" && endpoint.charAt(0) === "/") {
      showAskError("askLocal");
      return;
    }

    var simulationState = activeHandle && typeof activeHandle.getState === "function"
      ? activeHandle.getState()
      : null;

    if (!simulationState) {
      showAskError("askError");
      return;
    }

    var payload = {
      question: question,
      language: currentLanguage,
      simulation: activeSimulation ? activeSimulation.id : "tunnelling",
      simulationName: activeSimulation ? t(activeSimulation.nameKey) : t("simulations.tunnelling.title"),
      values: {
        energy: Number(simulationState.energy),
        barrierHeight: Number(simulationState.barrierHeight),
        barrierWidth: Number(simulationState.barrierWidth),
        transmission: Number(simulationState.transmission),
        reflection: Number(simulationState.reflection)
      },
      explanationKey: lastExplanation.key || "welcome"
    };

    renderAskLoading();

    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, ASK_TIMEOUT_MS);

    try {
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      var data = null;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }

      if (!response.ok) {
        if (response.status === 429 || (data && data.error === "rate_limited")) {
          showAskError("askRateLimited");
        } else if (data && data.error === "not_configured") {
          showAskError("askNotConfigured");
        } else {
          showAskError("askError");
        }
        return;
      }

      if (!data || typeof data.answer !== "string" || !data.answer.trim()) {
        showAskError("askError");
        return;
      }

      renderAskAnswer(data.answer.trim());
      elements.askInput.value = "";
    } catch (error) {
      showAskError("askError");
    } finally {
      clearTimeout(timeoutId);
      setAskBusy(false);
    }
  }

  function bindEvents() {
    if (elements.languageSelect) {
      elements.languageSelect.addEventListener("change", function (event) {
        setLanguage(event.target.value);
      });
    }

    if (elements.askForm) {
      elements.askForm.addEventListener("submit", handleAskSubmit);
    }

    if (elements.askInput) {
      elements.askInput.addEventListener("input", function () {
        if (askState.kind === "notice") clearAskOutput();
      });
    }
  }

  function init() {
    elements = {
      languageSelect: document.getElementById("language-select"),
      tabs: document.getElementById("simulation-tabs"),
      simulationRoot: document.getElementById("simulation-root"),
      explanationText: document.getElementById("explanation-text"),
      askForm: document.getElementById("ask-form"),
      askInput: document.getElementById("ask-input"),
      askSubmit: document.getElementById("ask-submit"),
      askSubmitLabel: document.getElementById("ask-submit-label"),
      askOutput: document.getElementById("ask-output")
    };

    currentLanguage = detectLanguage();
    bindEvents();
    applyTranslations();

    if (QuantumLab.simulations.length > 0) {
      mountSimulation(QuantumLab.simulations[0]);
    } else if (elements.simulationRoot) {
      elements.simulationRoot.textContent = t("ui.noSimulations");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
