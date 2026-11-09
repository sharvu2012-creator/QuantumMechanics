/*
 * Quantum tunnelling through a rectangular barrier.
 *
 * Physics:
 *   T = 1 / [1 + V0^2 sinh^2(kappa a) / (4 E (V0 - E))]   for E < V0
 *   T = 1 / [1 + V0^2 sin^2(k2 a) / (4 E (E - V0))]       for E > V0
 *   T -> 1 / [1 + V0 a^2 / (4 * hbar^2 / 2m)]              at E = V0
 *
 * The readouts use the exact plane-wave result above. The moving picture is a
 * deliberately simple Gaussian wave-packet teaching visual: it approaches the
 * barrier, then splits into reflected and transmitted packets with amplitudes
 * sqrt(R) and sqrt(T), so the displayed probabilities match the readouts.
 */
(function () {
  "use strict";

  const H2M = 0.038099; // hbar^2 / (2m_e) in eV nm^2
  const EPS = 1e-12;
  const X_MIN = -12;
  const X_MAX = 12;
  const START_X = -8.4;
  const SIGMA = 1.05;
  const SPLIT_FADE = 0.3;
  const LOOP_DELAY = 0.35;
  const MAX_BARRIER = 2.5;
  const DEFAULTS = {
    energy: 0.5,
    barrierHeight: 0.8,
    barrierWidth: 0.6
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function gaussian(x, center, width) {
    const z = (x - center) / width;
    return Math.exp(-0.5 * z * z);
  }

  function transmissionProbability(energy, barrierHeight, barrierWidth) {
    const E = Math.max(energy, EPS);
    const V = Math.max(barrierHeight, 0);
    const a = Math.max(barrierWidth, EPS);

    if (V <= EPS) return 1;

    const difference = E - V;
    let T;

    if (Math.abs(difference) < 1e-9) {
      // Continuous limit of the two formulae at E = V0.
      T = 1 / (1 + (V * a * a) / (4 * H2M));
    } else if (difference < 0) {
      const kappa = Math.sqrt(-difference / H2M);
      const sinh = Math.sinh(kappa * a);
      const term = (V * V * sinh * sinh) / (4 * E * -difference);
      T = 1 / (1 + term);
    } else {
      const k2 = Math.sqrt(difference / H2M);
      const sin = Math.sin(k2 * a);
      const term = (V * V * sin * sin) / (4 * E * difference);
      T = 1 / (1 + term);
    }

    return clamp(T, 0, 1);
  }

  function superscript(number) {
    const map = {
      "-": "⁻",
      "0": "⁰",
      "1": "¹",
      "2": "²",
      "3": "³",
      "4": "⁴",
      "5": "⁵",
      "6": "⁶",
      "7": "⁷",
      "8": "⁸",
      "9": "⁹"
    };
    return String(number).split("").map((character) => map[character] || character).join("");
  }

  function formatProbability(probability) {
    const p = clamp(probability, 0, 1);
    const percent = p * 100;
    if (percent === 0) return "0%";
    if (percent >= 10) return percent.toFixed(1) + "%";
    if (percent >= 0.1) return percent.toFixed(2) + "%";
    if (percent >= 0.001) return percent.toFixed(3) + "%";
    const parts = percent.toExponential(1).split("e");
    return parts[0] + " × 10" + superscript(parseInt(parts[1], 10)) + "%";
  }

  function pickExplanation(control, direction, state) {
    const T = state.T;
    const E = state.energy;
    const V = state.barrierHeight;

    if (Math.abs(E - V) < 1e-9) {
      return control === "barrierWidth" ? "atBarrierWidth" : "atBarrier";
    }

    if (control === "barrierWidth") {
      if (E >= V) {
        if (T > 0.97) return "nearResonance";
        return "aboveBarrierWidth";
      }
      if (T < 1e-4) return "thickBarrier";
      if (T > 0.9) return "thinBarrier";
      return direction === "up" ? "widthUp" : "widthDown";
    }

    if (control === "energy") {
      if (E > V) {
        if (T > 0.97) return "nearResonance";
        return "aboveBarrier";
      }
      return direction === "up" ? "energyUp" : "energyDown";
    }

    if (control === "barrierHeight") {
      if (E > V) return "aboveBarrier";
      return direction === "up" ? "barrierUp" : "barrierDown";
    }

    return "welcome";
  }

  function buildMarkup() {
    return `
      <section class="simulation-panel card" aria-labelledby="tunnelling-title">
        <div class="sim-heading">
          <div>
            <h2 id="tunnelling-title" data-role="title"></h2>
            <p data-role="subtitle"></p>
          </div>
          <div class="status-pill" data-role="status">
            <span class="status-dot" aria-hidden="true"></span>
            <span data-role="status-label"></span>
          </div>
        </div>

        <div class="sim-layout">
          <div class="canvas-card">
            <div class="canvas-shell">
              <canvas id="tunnelling-canvas" data-role="canvas" role="img"></canvas>
            </div>
            <div class="canvas-legend" aria-hidden="true">
              <span class="legend-item"><span class="swatch"></span><span data-role="legend-prob"></span></span>
              <span class="legend-item"><span class="swatch real"></span><span data-role="legend-real"></span></span>
              <span class="legend-item"><span class="swatch barrier"></span><span data-role="legend-barrier"></span></span>
            </div>

            <div class="transport-grid" aria-live="polite">
              <div class="readout">
                <div class="readout-top">
                  <span class="readout-label" data-role="transmission-label"></span>
                  <span class="readout-value" data-role="transmission-value"></span>
                </div>
                <div class="readout-bar"><span data-role="transmission-bar"></span></div>
              </div>
              <div class="readout reflected">
                <div class="readout-top">
                  <span class="readout-label" data-role="reflection-label"></span>
                  <span class="readout-value" data-role="reflection-value"></span>
                </div>
                <div class="readout-bar"><span data-role="reflection-bar"></span></div>
              </div>
            </div>
          </div>

          <aside class="controls" data-role="controls" aria-label="Simulation controls">
            <div class="control">
              <label for="tunnelling-energy">
                <span data-role="energy-label"></span>
                <output data-role="energy-output" for="tunnelling-energy"></output>
              </label>
              <div class="range-wrap">
                <input id="tunnelling-energy" data-control="energy" type="range" min="0.05" max="2.5" step="0.01" value="0.5">
              </div>
              <div class="range-hint"><span data-role="low-label"></span><span data-role="high-label"></span></div>
            </div>

            <div class="control">
              <label for="tunnelling-barrier-height">
                <span data-role="barrier-height-label"></span>
                <output data-role="barrier-height-output" for="tunnelling-barrier-height"></output>
              </label>
              <div class="range-wrap">
                <input id="tunnelling-barrier-height" data-control="barrierHeight" type="range" min="0.05" max="2.5" step="0.01" value="0.8">
              </div>
              <div class="range-hint"><span data-role="low-label-2"></span><span data-role="high-label-2"></span></div>
            </div>

            <div class="control">
              <label for="tunnelling-barrier-width">
                <span data-role="barrier-width-label"></span>
                <output data-role="barrier-width-output" for="tunnelling-barrier-width"></output>
              </label>
              <div class="range-wrap">
                <input id="tunnelling-barrier-width" data-control="barrierWidth" type="range" min="0.1" max="2" step="0.01" value="0.6">
              </div>
              <div class="range-hint"><span data-role="low-label-3"></span><span data-role="high-label-3"></span></div>
            </div>

            <div class="actions">
              <button type="button" class="btn btn-primary" data-action="play">
                <span class="button-icon" data-role="play-icon" aria-hidden="true">❚❚</span>
                <span data-role="play-label"></span>
              </button>
              <button type="button" class="btn btn-ghost" data-action="reset">
                <span class="button-icon" aria-hidden="true">↺</span>
                <span data-role="reset-label"></span>
              </button>
            </div>

            <div class="formula-note">
              <strong data-role="formula-title"></strong>
              <p class="formula-eq" data-role="formula-eq"></p>
              <p class="formula-eq" data-role="formula-eq-above"></p>
              <span class="formula-badge" data-role="formula-badge"></span>
              <p class="formula-hint" data-role="formula-hint"></p>
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  const simulation = {
    id: "tunnelling",
    nameKey: "simulations.tunnelling.shortName",
    titleKey: "simulations.tunnelling.title",
    descriptionKey: "simulations.tunnelling.description",

    mount(root, context) {
      root.innerHTML = buildMarkup();

      const role = (name) => root.querySelector(`[data-role="${name}"]`);
      const refs = {
        title: role("title"),
        subtitle: role("subtitle"),
        status: role("status"),
        statusLabel: role("status-label"),
        controls: role("controls"),
        canvas: role("canvas"),
        legendProb: role("legend-prob"),
        legendReal: role("legend-real"),
        legendBarrier: role("legend-barrier"),
        transmissionLabel: role("transmission-label"),
        transmissionValue: role("transmission-value"),
        transmissionBar: role("transmission-bar"),
        reflectionLabel: role("reflection-label"),
        reflectionValue: role("reflection-value"),
        reflectionBar: role("reflection-bar"),
        energyLabel: role("energy-label"),
        energyOutput: role("energy-output"),
        energyInput: root.querySelector('[data-control="energy"]'),
        barrierHeightLabel: role("barrier-height-label"),
        barrierHeightOutput: role("barrier-height-output"),
        barrierHeightInput: root.querySelector('[data-control="barrierHeight"]'),
        barrierWidthLabel: role("barrier-width-label"),
        barrierWidthOutput: role("barrier-width-output"),
        barrierWidthInput: root.querySelector('[data-control="barrierWidth"]'),
        lowLabels: [
          role("low-label"),
          role("low-label-2"),
          role("low-label-3")
        ],
        highLabels: [
          role("high-label"),
          role("high-label-2"),
          role("high-label-3")
        ],
        playButton: root.querySelector('[data-action="play"]'),
        playIcon: role("play-icon"),
        playLabel: role("play-label"),
        resetButton: root.querySelector('[data-action="reset"]'),
        resetLabel: role("reset-label"),
        formulaTitle: role("formula-title"),
        formulaEq: role("formula-eq"),
        formulaEqAbove: role("formula-eq-above"),
        formulaBadge: role("formula-badge"),
        formulaHint: role("formula-hint")
      };

      const canvas = refs.canvas;
      const ctx = canvas.getContext("2d");
      const state = {
        energy: DEFAULTS.energy,
        barrierHeight: DEFAULTS.barrierHeight,
        barrierWidth: DEFAULTS.barrierWidth,
        T: 0,
        R: 0,
        speed: 1.9,
        tHit: 0,
        t: 0,
        running: true,
        lastTimestamp: 0,
        width: 0,
        height: 0,
        dpr: 1,
        kVisual: 1.6
      };

      let animationFrame = 0;
      let resizeObserver = null;

      function t(key, vars) {
        return context.t(key, vars);
      }

      function updateSliderFill(input) {
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);
        const value = parseFloat(input.value);
        const percent = ((value - min) / (max - min)) * 100;
        input.style.setProperty("--fill", percent + "%");
      }

      function updateDerivedValues() {
        state.T = transmissionProbability(state.energy, state.barrierHeight, state.barrierWidth);
        state.R = clamp(1 - state.T, 0, 1);
        state.speed = clamp(1.9 * Math.sqrt(state.energy / 0.5), 1.2, 5.2);
        state.kVisual = clamp(1.6 * Math.sqrt(state.energy / 0.5), 0.9, 3.8);
        state.tHit = Math.max(0.2, (-state.barrierWidth / 2 - START_X) / state.speed);
      }

      function updateReadouts() {
        refs.transmissionValue.textContent = formatProbability(state.T);
        refs.reflectionValue.textContent = formatProbability(state.R);
        refs.transmissionBar.style.setProperty("--value", (state.T * 100).toFixed(3) + "%");
        refs.reflectionBar.style.setProperty("--value", (state.R * 100).toFixed(3) + "%");
      }

      function updatePlayState() {
        refs.status.classList.toggle("paused", !state.running);
        refs.statusLabel.textContent = state.running ? t("ui.statusLive") : t("ui.statusPaused");
        refs.playIcon.textContent = state.running ? "❚❚" : "▶";
        refs.playLabel.textContent = state.running ? t("ui.pause") : t("ui.play");
      }

      function updateControlText() {
        refs.energyLabel.textContent = t("ui.energyLabel");
        refs.barrierHeightLabel.textContent = t("ui.barrierHeightLabel");
        refs.barrierWidthLabel.textContent = t("ui.barrierWidthLabel");
        refs.lowLabels.forEach((element) => { element.textContent = t("ui.low"); });
        refs.highLabels.forEach((element) => { element.textContent = t("ui.high"); });

        const energyText = state.energy.toFixed(2) + " " + t("ui.energyUnit");
        const heightText = state.barrierHeight.toFixed(2) + " " + t("ui.energyUnit");
        const widthText = state.barrierWidth.toFixed(2) + " " + t("ui.widthUnit");

        refs.energyOutput.textContent = energyText;
        refs.barrierHeightOutput.textContent = heightText;
        refs.barrierWidthOutput.textContent = widthText;

        refs.energyInput.setAttribute("aria-label", t("ui.energyLabel"));
        refs.energyInput.setAttribute("aria-valuetext", energyText);
        refs.barrierHeightInput.setAttribute("aria-label", t("ui.barrierHeightLabel"));
        refs.barrierHeightInput.setAttribute("aria-valuetext", heightText);
        refs.barrierWidthInput.setAttribute("aria-label", t("ui.barrierWidthLabel"));
        refs.barrierWidthInput.setAttribute("aria-valuetext", widthText);
      }

      function refreshTranslations() {
        refs.title.textContent = t("simulations.tunnelling.title");
        refs.subtitle.textContent = t("simulations.tunnelling.subtitle");
        refs.legendProb.textContent = t("ui.legendProbability");
        refs.legendReal.textContent = t("ui.legendReal");
        refs.legendBarrier.textContent = t("ui.legendBarrier");
        refs.transmissionLabel.textContent = t("ui.transmission");
        refs.reflectionLabel.textContent = t("ui.reflection");
        refs.resetLabel.textContent = t("ui.reset");
        refs.formulaTitle.textContent = t("ui.formulaTitle");
        refs.formulaEq.textContent = t("ui.formulaEquation");
        refs.formulaEqAbove.textContent = t("ui.formulaEquationAbove");
        refs.formulaBadge.textContent = t("ui.probabilitySum");
        refs.formulaHint.textContent = t("ui.readoutHint");
        refs.controls.setAttribute("aria-label", t("ui.simulationControls"));
        refs.canvas.setAttribute("aria-label", t("ui.canvasAria"));
        updatePlayState();
        updateControlText();
        updateReadouts();
      }

      function explanationVars() {
        return {
          T: formatProbability(state.T),
          R: formatProbability(state.R),
          E: state.energy.toFixed(2),
          V: state.barrierHeight.toFixed(2),
          a: state.barrierWidth.toFixed(2)
        };
      }

      function resetPacket(startRunning) {
        state.t = 0;
        state.lastTimestamp = 0;
        if (startRunning) state.running = true;
        updatePlayState();
      }

      function shouldRestart() {
        const tau = state.t - state.tHit;
        if (tau < 0) return false;
        const reflectedCenter = -state.barrierWidth / 2 - state.speed * tau;
        const transmittedCenter = state.barrierWidth / 2 + state.speed * tau;
        const bothGone = reflectedCenter < X_MIN - 2 * SIGMA && transmittedCenter > X_MAX + 2 * SIGMA;
        return bothGone || tau > 14 + LOOP_DELAY;
      }

      function waveAt(x) {
        const time = state.t;
        const leftEdge = -state.barrierWidth / 2;
        const rightEdge = state.barrierWidth / 2;
        const omega = state.kVisual * state.speed;
        const tau = time - state.tHit;

        if (tau < 0) {
          const center = START_X + state.speed * time;
          const density = gaussian(x, center, SIGMA);
          const amplitude = Math.sqrt(density);
          return {
            density: density,
            real: amplitude * Math.cos(state.kVisual * x - omega * time)
          };
        }

        const blend = clamp(tau / SPLIT_FADE, 0, 1);
        const incidentCenter = leftEdge;
        const reflectedCenter = leftEdge - state.speed * tau;
        const transmittedCenter = rightEdge + state.speed * tau;

        const incidentDensity = gaussian(x, incidentCenter, SIGMA);
        const reflectedDensity = state.R * gaussian(x, reflectedCenter, SIGMA);
        const transmittedDensity = state.T * gaussian(x, transmittedCenter, SIGMA);

        const density = (1 - blend) * incidentDensity + blend * (reflectedDensity + transmittedDensity);

        const incidentReal = Math.sqrt(incidentDensity) * Math.cos(state.kVisual * x - omega * time);
        const reflectedReal = Math.sqrt(reflectedDensity) * Math.cos(state.kVisual * x + omega * time);
        const transmittedReal = Math.sqrt(transmittedDensity) * Math.cos(state.kVisual * x - omega * time);
        const real = (1 - blend) * incidentReal + blend * (reflectedReal + transmittedReal);

        return { density: density, real: real };
      }

      function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
        const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
        state.dpr = dpr;
        state.width = rect.width;
        state.height = rect.height;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function drawScene() {
        if (!state.width || !state.height) {
          resizeCanvas();
          if (!state.width || !state.height) return;
        }

        const width = state.width;
        const height = state.height;
        const compact = width < 520;
        const margin = {
          left: compact ? 36 : 46,
          right: compact ? 14 : 22,
          top: 24,
          bottom: compact ? 31 : 37
        };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        if (plotWidth < 10 || plotHeight < 10) return;

        const baseline = margin.top + plotHeight;
        const xToPixel = (x) => margin.left + ((x - X_MIN) / (X_MAX - X_MIN)) * plotWidth;
        const densityToPixel = (density) => baseline - clamp(density, 0, 1.05) * plotHeight * 0.82;
        const font = '11px "Segoe UI", "Noto Sans", "Noto Sans Devanagari", "Noto Sans Gurmukhi", sans-serif';

        ctx.clearRect(0, 0, width, height);

        // Subtle plot grid.
        ctx.save();
        ctx.strokeStyle = "rgba(139, 170, 255, 0.075)";
        ctx.lineWidth = 1;
        for (let row = 0; row <= 4; row += 1) {
          const y = margin.top + (plotHeight * row) / 4;
          ctx.beginPath();
          ctx.moveTo(margin.left, y);
          ctx.lineTo(margin.left + plotWidth, y);
          ctx.stroke();
        }
        ctx.restore();

        const barrierLeft = xToPixel(-state.barrierWidth / 2);
        const barrierRight = xToPixel(state.barrierWidth / 2);
        const barrierWidthPx = Math.max(2, barrierRight - barrierLeft);
        const barrierFraction = clamp(state.barrierHeight / MAX_BARRIER, 0, 1);
        const barrierTop = baseline - plotHeight * (0.12 + 0.62 * barrierFraction);

        // A faint full-height marker makes very narrow barriers easy to see.
        ctx.fillStyle = "rgba(139, 108, 255, 0.04)";
        ctx.fillRect(barrierLeft, margin.top, barrierWidthPx, plotHeight);

        // The rectangular potential barrier.
        const barrierGradient = ctx.createLinearGradient(0, barrierTop, 0, baseline);
        barrierGradient.addColorStop(0, "rgba(155, 120, 255, 0.38)");
        barrierGradient.addColorStop(1, "rgba(74, 45, 166, 0.09)");
        ctx.fillStyle = barrierGradient;
        ctx.fillRect(barrierLeft, barrierTop, barrierWidthPx, baseline - barrierTop);

        ctx.save();
        ctx.strokeStyle = "rgba(180, 156, 255, 0.58)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(barrierLeft, barrierTop, barrierWidthPx, baseline - barrierTop);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = "#b9a6ff";
        ctx.lineWidth = 1.8;
        ctx.shadowColor = "#8b6cff";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(barrierLeft, barrierTop);
        ctx.lineTo(barrierRight, barrierTop);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = "rgba(207, 199, 255, 0.88)";
        ctx.font = '600 ' + (compact ? 10 : 11) + 'px "Segoe UI", "Noto Sans", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(
          t("ui.barrierLabel") + " · " + state.barrierHeight.toFixed(2) + " " + t("ui.energyUnit"),
          (barrierLeft + barrierRight) / 2,
          Math.max(margin.top + 11, barrierTop - 7)
        );
        ctx.restore();

        // A short flash when the packet reaches the barrier.
        if (state.t >= state.tHit && state.t < state.tHit + SPLIT_FADE) {
          const flash = Math.sin(Math.PI * clamp((state.t - state.tHit) / SPLIT_FADE, 0, 1));
          ctx.save();
          ctx.globalAlpha = flash * 0.55;
          ctx.fillStyle = "rgba(255, 94, 219, 0.2)";
          ctx.shadowColor = "#ff5edb";
          ctx.shadowBlur = 34;
          ctx.fillRect(barrierLeft - 6, barrierTop - 6, barrierWidthPx + 12, baseline - barrierTop + 12);
          ctx.restore();
        }

        const sampleCount = Math.max(260, Math.min(720, Math.floor(plotWidth / 2)));
        const densityCurve = new Path2D();
        const densityFill = new Path2D();
        const realPath = new Path2D();
        let started = false;

        for (let index = 0; index <= sampleCount; index += 1) {
          const x = X_MIN + ((X_MAX - X_MIN) * index) / sampleCount;
          const sample = waveAt(x);
          const px = xToPixel(x);
          const densityY = densityToPixel(sample.density);
          const realY = baseline - sample.real * plotHeight * 0.48;

          if (!started) {
            densityFill.moveTo(px, baseline);
            densityFill.lineTo(px, densityY);
            densityCurve.moveTo(px, densityY);
            realPath.moveTo(px, realY);
            started = true;
          } else {
            densityFill.lineTo(px, densityY);
            densityCurve.lineTo(px, densityY);
            realPath.lineTo(px, realY);
          }
        }

        densityFill.lineTo(xToPixel(X_MAX), baseline);
        densityFill.closePath();

        const fillGradient = ctx.createLinearGradient(0, margin.top, 0, baseline);
        fillGradient.addColorStop(0, "rgba(56, 232, 255, 0.44)");
        fillGradient.addColorStop(0.72, "rgba(56, 232, 255, 0.14)");
        fillGradient.addColorStop(1, "rgba(56, 232, 255, 0.015)");
        ctx.fillStyle = fillGradient;
        ctx.fill(densityFill);

        // The real part of the wave is shown faintly; the bright curve is |psi|^2.
        ctx.save();
        ctx.strokeStyle = "rgba(255, 94, 219, 0.46)";
        ctx.lineWidth = 1.15;
        ctx.stroke(realPath);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = "#5ff3ff";
        ctx.lineWidth = compact ? 2 : 2.4;
        ctx.shadowColor = "#38e8ff";
        ctx.shadowBlur = 15;
        ctx.stroke(densityCurve);
        ctx.restore();

        // Axis and ticks.
        ctx.save();
        ctx.strokeStyle = "rgba(139, 170, 255, 0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin.left, baseline);
        ctx.lineTo(margin.left + plotWidth, baseline);
        ctx.stroke();

        const ticks = [-10, -5, 0, 5, 10];
        ctx.fillStyle = "rgba(152, 166, 201, 0.9)";
        ctx.font = font;
        ctx.textAlign = "center";
        ticks.forEach((tick) => {
          const x = xToPixel(tick);
          ctx.beginPath();
          ctx.moveTo(x, baseline);
          ctx.lineTo(x, baseline + 4);
          ctx.stroke();
          ctx.fillText(String(tick), x, baseline + 16);
        });

        ctx.fillStyle = "rgba(111, 126, 159, 0.95)";
        ctx.font = '10px "Segoe UI", "Noto Sans", sans-serif';
        ctx.textAlign = "right";
        ctx.fillText(t("ui.xAxis"), margin.left + plotWidth, height - 4);
        ctx.restore();
      }

      function draw(timestamp) {
        if (!state.lastTimestamp) state.lastTimestamp = timestamp;
        const delta = Math.min((timestamp - state.lastTimestamp) / 1000, 0.05);
        state.lastTimestamp = timestamp;

        if (state.running) {
          state.t += delta;
          if (shouldRestart()) {
            resetPacket(false);
          }
        }

        drawScene();
        animationFrame = window.requestAnimationFrame(draw);
      }

      function handleSliderInput(event) {
        const input = event.currentTarget;
        const control = input.dataset.control;
        if (!control || !(control in state)) return;

        const previous = state[control];
        const next = parseFloat(input.value);
        const direction = next > previous ? "up" : next < previous ? "down" : "up";

        state[control] = next;
        updateSliderFill(input);
        updateDerivedValues();
        updateControlText();
        updateReadouts();
        resetPacket(false);

        context.setExplanation(pickExplanation(control, direction, state), explanationVars());
      }

      function togglePlay() {
        state.running = !state.running;
        state.lastTimestamp = 0;
        updatePlayState();
      }

      function resetSimulation() {
        resetPacket(true);
        context.setExplanation("reset", explanationVars());
      }

      function bindEvents() {
        [refs.energyInput, refs.barrierHeightInput, refs.barrierWidthInput].forEach((input) => {
          input.addEventListener("input", handleSliderInput);
          updateSliderFill(input);
        });
        refs.playButton.addEventListener("click", togglePlay);
        refs.resetButton.addEventListener("click", resetSimulation);
      }

      function destroy() {
        window.cancelAnimationFrame(animationFrame);
        if (resizeObserver) resizeObserver.disconnect();
      }

      updateDerivedValues();
      refs.energyInput.value = state.energy;
      refs.barrierHeightInput.value = state.barrierHeight;
      refs.barrierWidthInput.value = state.barrierWidth;
      bindEvents();
      refreshTranslations();
      resetPacket(false);
      context.setExplanation("welcome", explanationVars());

      resizeCanvas();
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(canvas.parentElement);
      }
      animationFrame = window.requestAnimationFrame(draw);

      return {
        refreshTranslations: refreshTranslations,
        getState: () => ({
          energy: state.energy,
          barrierHeight: state.barrierHeight,
          barrierWidth: state.barrierWidth,
          transmission: state.T,
          reflection: state.R,
          running: state.running
        }),
        destroy: destroy
      };
    }
  };

  if (!window.QuantumLab || typeof window.QuantumLab.registerSimulation !== "function") {
    console.error("Quantum Lab registry is missing. Load app.js before simulations/tunnelling.js.");
    return;
  }

  window.QuantumLab.physics = window.QuantumLab.physics || {};
  window.QuantumLab.physics.tunnelling = { transmissionProbability: transmissionProbability };
  window.QuantumLab.registerSimulation(simulation);
})();
