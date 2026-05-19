# Flowchart Studio v13.5

Een lokale Git-repository voor `Flowchart_Studio_v13.5.html`, een statische HTML-app voor Flowchart Studio.

## Wat is `Flowchart_Studio_v13.5.html`?

`Flowchart_Studio_v13.5.html` is een complete, zelfstandige webpagina die je direct in een moderne browser kunt openen. Er is geen installatie of server nodig: de hele app zit in één HTML-bestand met alle code voor de gebruikersinterface, logica en exportfuncties.

De app helpt je om media-campagnes te plannen in drie niveaus:

- Campagnes
- Flights binnen die campagnes
- Tactics binnen die flights

Je kunt budgetten, start- en einddata, kanalen en extra kosten invoeren en daarna de planning bekijken in een interactieve tijdlijn.

## Hoe werkt de app?

1. Open `Flowchart_Studio_v13.5.html` in een browser zoals Chrome, Edge of Firefox.
2. Kies een bestaande campagnebestanden via de knop `JSON laden` of sleep een `.json` bestand op het startscherm.
3. Je kunt ook een nieuwe planning maken met de knop `Nieuw`.
4. In het hoofdscherm kun je:
   - campagnes toevoegen en bewerken
   - flights toevoegen, wijzigen en verwijderen
   - tactics verdelen over kanalen met budget en metrics
   - status en kleuren aanpassen
5. De app toont een visuele tijdlijn met weken, budgetten en totale overzichten.

## Wat kun je ermee doen?

- Campagnes plannen volgens een mediastrategie
- Budgetten bijhouden per campagne, flight en tactic
- Creatie- en tooling-kosten toevoegen
- Handling fee berekenen per kanaal
- Exporteren naar:
  - JSON (voor later opnieuw openen)
  - CSV (gegevenslijst)
  - XLS (Excel-compatibel formulier)
  - PDF/print
- Instellingen aanpassen en automatische opslag in de browser gebruiken

## Snel starten

1. Open `Flowchart_Studio_v13.5.html` in een browser zoals Chrome, Edge of Firefox.
2. Klik op `Nieuw` om een nieuwe planning te maken.
3. Voeg een campagne toe en geef deze een naam.
4. Voeg een flight toe aan de campagne en kies de start- en einddatum.
5. Voeg eventueel een tactic toe en verdeel het budget over kanalen.
6. Gebruik `JSON laden` of sleep een eerder opgeslagen `.json` bestand om een bestaande planning terug te lezen.
7. Sla je werk op met `Opslaan` of exporteer naar `CSV`, `XLS` of `PDF`.

## Belangrijk om te weten

- De app draait volledig in je browser; er is geen installatie of server nodig.
- Als je gegevens wilt bewaren, sla het bestand op als JSON of exporteer naar XLS/PDF.
- De browser kan de laatste sessie onthouden, maar dit is niet hetzelfde als een online opslagdienst.
- Er is geen realtime samenwerking of gebruikersbeheer; dit is een lokale tool voor één gebruiker.

## Over deze repository

Deze repository bevat één hoofdbestand:

- `Flowchart_Studio_v13.5.html` — de volledige Flowchart Studio app in één HTML-bestand.

Daarnaast bevat de repository:

- `.gitignore` — uitsluitingen voor tijdelijke en systeembestanden.
- `setup_git.ps1` — een PowerShell-script om de repo te initialiseren en de eerste commit te maken.

## Hoe te gebruiken

1. Open de map `Flowchart_Studio_v13.5_Repo` in Visual Studio Code of een andere editor.
2. Open `Flowchart_Studio_v13.5.html` in een browser om de app te bekijken.
3. Bewerk bestanden zoals gewenst in de editor.

## Git-installatie en setup

Als Git nog niet is geïnstalleerd, installeer het dan eerst. Op Windows kun je bijvoorbeeld `winget install --id Git.Git -e --silent` gebruiken.

Als de repository nog niet is geïnitialiseerd, voer dan het volgende uit in PowerShell:

```powershell
Set-Location 'C:\Users\Can.Guner\Flowchart_Studio_v13.5_Repo'
.\setup_git.ps1
```

## Pushen naar GitHub

Nadat je een repository op GitHub hebt aangemaakt, voeg je de remote toe en push je naar `main`:

```powershell
git remote add origin https://github.com/C-Gunerwpp/Flowchart.git
git branch -M main
git push -u origin main
```

## Repository-inhoud

- `Flowchart_Studio_v13.5.html` — HTML-applicatie
- `.gitignore` — standaardignore-regels voor deze repo
- `README.md` — dit bestand
- `setup_git.ps1` — setup-script voor Git-init en commit

## Opmerkingen

- Dit project is een statische HTML-pagina; er is geen extra backend nodig.
- Voor een geoptimaliseerde workflow kun je de HTML openen in een moderne browser zoals Chrome, Edge of Firefox.
- Als je wijzigingen reponeert, gebruik dan een duidelijke commitboodschap zoals `Update Flowchart Studio HTML`.
