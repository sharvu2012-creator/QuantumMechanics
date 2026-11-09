# Quantum Lab

A free, static web app for school and college students to explore quantum
physics through interactive simulations. The first experiment is **quantum
tunnelling through a rectangular potential barrier**.

Built with plain HTML, CSS and JavaScript. No framework, no build step, no
database. The simulation runs entirely in the browser; the optional AI tutor
uses one Netlify Function so the Gemini API key never reaches the front end.

## What is included

- Live 1D wave-packet animation at 30–60 fps on HTML canvas.
- Sliders for particle energy, barrier height and barrier width.
- Exact analytical transmission and reflection probabilities for a rectangular
  barrier, with `T + R = 1`.
- Bright probability-density curve and a shaded barrier block.
- Play/Pause and Reset controls.
- Dark, responsive interface for laptops and phones.
- English, Hindi and Punjabi interface with all labels and explanations in one
  `translations.js` object.
- “Why did that happen?” box with contextual pre-written explanations.
- “Ask a question” box that sends the question and current slider values to a
  Gemini-powered Netlify Function. If the call fails or is rate-limited, the UI
  shows a friendly message and falls back to the pre-written explanation.
- A tiny simulation registry so particle-in-a-box, interference and orbitals can
  be added later without changing the page shell.

## Quick start

### 1. Just open the simulation

Open `index.html` in a browser. The tunnelling simulation works immediately,
including all three languages and the pre-written explanations.

The AI question box will show a friendly “AI needs the Netlify function” message
when the page is opened with `file://`, because there is no server to hold the
Gemini key.

### 2. Run the full app, including the AI tutor

You need [Node.js](https://nodejs.org/) 18 or newer and a free
[Netlify](https://www.netlify.com/) account.

```bash
cd quantum-lab
npx netlify-cli dev
```

Open the URL printed by Netlify (normally <http://localhost:8888>).

Create a `.env` file in this folder with your Gemini key:

```bash
GEMINI_API_KEY=your_google_ai_studio_key
```

The `.env` file is already ignored by git. You can get a key from
[Google AI Studio](https://aistudio.google.com/app/apikey).

Optional: choose a Gemini model with another environment variable.

```bash
GEMINI_MODEL=gemini-2.5-flash
```

If `GEMINI_MODEL` is omitted, the function uses `gemini-2.5-flash`.

### 3. Run a static server without AI

Any static server works:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. The AI box will fall back gracefully unless
you point it at a deployed Netlify Function.

## Deploy for free

### Netlify (recommended: simulation + AI)

1. Push this folder to GitHub, GitLab or Bitbucket.
2. In Netlify, choose **Add new site → Import an existing project**.
3. Use these settings:
   - **Build command:** leave empty
   - **Publish directory:** `.`
   - **Functions directory:** `netlify/functions`
4. Add an environment variable:
   - `GEMINI_API_KEY` = your Google AI Studio key
5. Deploy.

`netlify.toml` already contains the publish and functions paths, so the settings
should be detected automatically.

You can also drag the `quantum-lab` folder into the Netlify dashboard. Add the
environment variable before testing the question box.

### GitHub Pages (static simulation)

1. Push the folder to GitHub.
2. Go to **Settings → Pages**.
3. Publish from the branch/folder that contains `index.html`.

The simulation, languages and explanations work on GitHub Pages. The AI tutor
needs a serverless function, so it will not work unless you deploy
`netlify/functions/ask.js` somewhere and point the front end at it.

To use a separately deployed Netlify Function from GitHub Pages, edit the config
near the bottom of `index.html`:

```html
<script>
  window.QUANTUM_LAB_CONFIG = {
    askEndpoint: "https://YOUR-SITE.netlify.app/.netlify/functions/ask"
  };
</script>
```

The function sends `Access-Control-Allow-Origin: *`, so it can be called from a
GitHub Pages origin. For a public production site, consider restricting that
header to your own domain.

## Project structure

```text
quantum-lab/
├── index.html                  Page shell, language switcher, explainer, ask box
├── style.css                   Dark responsive theme and canvas layout
├── app.js                      Language handling, simulation registry, AI form
├── translations.js             All UI strings and explanations (en / hi / pa)
├── simulations/
│   └── tunnelling.js           Tunnelling physics, canvas animation, controls
├── netlify/
│   └── functions/
│       └── ask.js              Serverless Gemini proxy (key stays on the server)
├── netlify.toml                Netlify publish/functions configuration
├── package.json                Convenience `npm run dev` script
├── .gitignore
└── README.md
```

## Physics notes

The readouts use the standard plane-wave transmission probability for a
rectangular barrier of height `V0` and width `a`:

For `E < V0`:

```text
T = 1 / [1 + V0² sinh²(κa) / (4E(V0 − E))]
κ = sqrt(2m(V0 − E)) / ħ
```

For `E > V0`:

```text
T = 1 / [1 + V0² sin²(k₂a) / (4E(E − V0))]
k₂ = sqrt(2m(E − V0)) / ħ
```

At `E = V0` the code uses the continuous limit:

```text
T = 1 / [1 + V0 a² / (4ħ²/2m)]
```

Reflection is `R = 1 − T`.

The code uses `ħ² / (2mₑ) = 0.038099 eV nm²`, an electron mass, energies in eV
and widths in nm. The moving curve is a teaching visual: a Gaussian wave packet
approaches the barrier and splits into reflected and transmitted packets with
amplitudes `sqrt(R)` and `sqrt(T)`, so the visual probabilities match the
analytical readouts. It is not a full time-dependent Schrödinger-equation
solver; the numerical readouts are the exact rectangular-barrier result for the
selected energy.

## Adding another simulation

The page shell is independent of the tunnelling code. A new simulation only
needs to register itself.

1. Create `simulations/particle-in-box.js`.
2. Register a simulation object before `DOMContentLoaded`:

```js
(function () {
  "use strict";

  window.QuantumLab.registerSimulation({
    id: "particle-in-box",
    nameKey: "simulations.particleInBox.shortName",

    mount(root, context) {
      root.innerHTML = "<section class=\"simulation-panel card\">...</section>";

      // context.t("key") gives the current language.
      // context.setExplanation("key", { value: "..." }) updates the explainer.
      // context.getLanguage() returns "en", "hi" or "pa".

      return {
        refreshTranslations() {
          // Update your simulation's labels here.
        },
        getState() {
          // Used by the "Ask a question" box.
          return { energy: 1, boxWidth: 2, transmission: 1, reflection: 0 };
        },
        destroy() {
          // Cancel animation frames and observers here.
        }
      };
    }
  });
})();
```

3. Add its title, labels and explanations to `translations.js`.
4. Add the script to `index.html` after `app.js`:

```html
<script src="simulations/particle-in-box.js"></script>
```

The simulation tabs are generated from `QuantumLab.simulations`, so the new
experiment appears automatically.

## AI tutor details

The browser sends only this to `/.netlify/functions/ask`:

- the student’s question,
- the selected language,
- the current simulation values,
- the last explanation key.

The Netlify Function reads `GEMINI_API_KEY` from the server environment and
calls the Gemini API. It validates and limits input, applies a small in-memory
rate limit per function instance, and returns friendly JSON errors. The front
end never sees the key.

If the function is missing, returns an error, times out, or hits a rate limit,
the question box displays a translated message and the current pre-written
explanation.

## Troubleshooting

**The AI box says the function is not configured.**
Add `GEMINI_API_KEY` to the Netlify environment (or to `.env` when using
`netlify dev`) and restart the dev server.

**The AI box works locally but not on GitHub Pages.**
GitHub Pages only serves static files. Deploy the Netlify Function and set
`askEndpoint` to its full URL in `index.html`.

**The simulation does not animate.**
Make sure JavaScript is enabled. The canvas uses `requestAnimationFrame`, so the
animation pauses automatically when the browser tab is in the background.

**A very small transmission probability shows in scientific notation.**
That is intentional: tunnelling probabilities can be many orders of magnitude
below 1%. The formula is still producing the exact value.

## License

Use, adapt and share this project freely for teaching and learning.
