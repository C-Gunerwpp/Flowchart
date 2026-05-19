# Run this script from the Flowchart_Studio_v13.5_Repo folder after installing Git.
# It initializes the repository and makes the first commit.

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed or not on PATH. Install Git first."
    exit 1
}

Write-Host "Initializing Git repository..."
git init

git add .
git commit -m "Initial import of Flowchart Studio v13.5"

Write-Host "Repository initialized. Now create a GitHub repo and run the following commands:"
Write-Host "git remote add origin https://github.com/<username>/<repo-name>.git"
Write-Host "git branch -M main"
Write-Host "git push -u origin main"
