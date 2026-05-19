# Flowchart Studio

Flowchart Studio is een browsergebaseerde planningstool voor mediastrategieën. De app helpt bij het plannen van campagnes, flights en tactics inclusief budget, kanalen, creatie- en toolingkosten.

## Wat is nieuw in deze repository

- `index.html` — huidige startpagina met gescheiden HTML-structuur.
- `styles.css` — centraliseert de styling.
- `app.js` — de applicatielogica in een eigen JavaScript-bestand.
- `package.json` — projectmetadata en scripts.
- `.github/workflows/ci.yml` — GitHub Actions voor linting.
- `LICENSE` — MIT-licentie.
- `.gitattributes`, `.editorconfig`, `.prettierrc`, `.eslintrc.json` — kwaliteits- en stijlconfiguratie.

> De oude `Flowchart_Studio_v13.5.html` blijft als legacy-versie aanwezig.

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

- `index.html` — startbestand met gescheiden layout.
- `styles.css` — app-styling.
- `app.js` — applicatielogica.
- `package.json` — npm scripts en dev dependencies.
- `.github/workflows/ci.yml` — CI voor linting en formatter checks.
- `.gitignore` — ignore-regels voor editor-, OS- en node-bestanden.
- `LICENSE` — MIT-licentie.
- `Flowchart_Studio_v13.5.html` — legacy single-file app.

## Verbeteringen

1. Gestructureerde codebase met losse HTML-, CSS- en JS-bestanden.
2. Professionele repository-inrichting met linting, formatting en CI.
3. Beter documentatie en projectmetadata.
4. Gebruiksvriendelijke export- en importsupport.
5. Basis voor responsive weergave en verbeterde onderhoudbaarheid.

## Licentie

Deze repository gebruikt de MIT-licentie. Zie `LICENSE` voor details.
