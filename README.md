# Flowchart Studio v13.5

Een lokale Git-repository voor `Flowchart_Studio_v13.5.html`, een statische HTML-app voor Flowchart Studio.

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
