# Flowchart Studio

Flowchart Studio is een browsergebaseerde planningstool voor mediastrategieën. De app helpt bij het plannen van campagnes, flights en tactics inclusief budget, kanalen, creatie- en toolingkosten.

## Wat is nieuw in deze repository

- `index.html` — startpagina, laadt de modules in volgorde.
- `styles.css` — centraliseert de styling.
- `src/` — applicatielogica opgesplitst in modules:
  - `constants.js` — kanalen, metrics, statussen, kleurpalet.
  - `state.js` — alle muteerbare toestand achter `FS.state`.
  - `utils.js` — formatters, datum/week-conversie, HTML-escape, debounce.
  - `calc.js` — pure budget- en fee-berekeningen.
  - `render.js` — Gantt, summary en legend.
  - `modals.js` — campagne-, flight-, tactic- en settings-modals.
  - `io.js` — autosave (debounced), JSON save/load, CSV en XLS export.
  - `events.js` — event-bindings en bootstrap.
- `package.json` — projectmetadata en scripts.
- `.github/workflows/ci.yml` — GitHub Actions voor linting.
- `LICENSE` — MIT-licentie.
- `.gitattributes`, `.editorconfig`, `.prettierrc`, `.eslintrc.json` — kwaliteits- en stijlconfiguratie.

> De oude single-file versie staat onder `legacy/Flowchart_Studio_v13.5.html`.

## Deploy / live omgeving

De live versie draait op **GitHub Pages**: <https://c-gunerwpp.github.io/Flowchart/>.

De site wordt rechtstreeks vanaf branch `main` geserveerd — er is **geen build-stap**. Elke wijziging op `main` moet dus gecommit én gepusht worden om live te komen:

```powershell
git add <bestanden>
git commit -m "<beschrijving>"
git push origin main
```

GitHub Pages bouwt binnen 1–2 minuten opnieuw. Doe daarna een **hard refresh** (Ctrl+F5) in de browser om de cache te omzeilen.

> ⚠️ Reminder voor Copilot/agent: bij werken op `main` is een lokale wijziging niet zichtbaar op de live site totdat er gepusht is. Altijd commit + push uitvoeren wanneer de gebruiker vraagt om de live pagina te updaten.

## Installatie

1. Open de repository in Visual Studio Code of een andere editor.
2. Open `index.html` in de browser om de app direct te gebruiken.
3. Voor ontwikkeling installeer je dependencies met:

```powershell
npm install
```

4. Run linting met:

```powershell
npm run lint
```

5. Formatteer bestanden met:

```powershell
npm run format
```

## Hoe te gebruiken

1. Open `index.html` in een moderne browser zoals Chrome, Edge of Firefox.
2. Begin met `Nieuw` voor een frisse planning of laad een bestaande `.json` file.
3. Voeg campagnes, flights en tactics toe.
4. Pas kanalen, budgetten en metrics aan in de modalinterfaces.
5. Exporteer naar JSON, CSV, XLS of print direct naar PDF.

## Branch en workflow

- Deze wijzigingen zijn aangebracht op branch `Verbeterd`.
- Het nieuwe project bevat een professionele structuur voor verdere ontwikkeling.

## Projectstructuur

- `index.html` — startbestand, laadt de modules.
- `styles.css` — app-styling.
- `src/` — modulair opgebouwde applicatielogica (zie hierboven).
- `package.json` — npm scripts en dev dependencies.
- `.github/workflows/ci.yml` — CI voor linting en formatter checks.
- `.gitignore` — ignore-regels voor editor-, OS- en node-bestanden.
- `LICENSE` — MIT-licentie.
- `legacy/Flowchart_Studio_v13.5.html` — legacy single-file app.

## Verbeteringen

1. Gestructureerde codebase: HTML/CSS/JS gescheiden + JS gesplitst in modules per verantwoordelijkheid.
2. XSS-veilige rendering: alle gebruikersinvoer wordt geëscaped voordat het in `innerHTML` belandt.
3. Debounced autosave (250 ms) — geen IO-druk meer bij snel typen van metrics of notities.
4. Slimme modal-updates: tekstvelden updaten state + Gantt zonder de modal te herrenderen, dus cursorpositie blijft staan tijdens typen.
5. Leesbare codebase: `const`/`let`, sprekende namen (`campaigns`, `flightBudget`, `formatCurrency`) en JSDoc waar nuttig.
6. Professionele repository-inrichting met linting, formatting en CI.
7. Gebruiksvriendelijke export- en importsupport.

## Licentie

Deze repository gebruikt de MIT-licentie. Zie `LICENSE` voor details.
