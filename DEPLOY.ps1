# DEPLOY.ps1 - build + commit + push aplikacji PMP Quiz
# Uruchamiaj: prawy klik na pliku -> "Uruchom za pomoca programu PowerShell"
# (albo w terminalu:  powershell -ExecutionPolicy Bypass -File .\DEPLOY.ps1 )
#
# UWAGA: ten plik celowo NIE uzywa polskich znakow (ogonkow). Windows PowerShell
# 5.1 czyta skrypty jako ANSI (cp1250), gdy plik jest UTF-8 bez BOM, i polskie
# znaki potrafia zepsuc parsowanie -> okno znikalo przed pauza. ASCII = bezpiecznie.

$ErrorActionPreference = 'Stop'
# W PowerShell 7+ nie traktuj komunikatow git na stderr jako bledu skryptu.
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$projectPath = 'C:\dev\pmp-quiz'

# Cala logika w jednym try/finally -> okno NIE zamknie sie przed przeczytaniem
# komunikatu, niezaleznie od tego, w ktorym kroku cos padnie.
try {
    # Wymus UTF-8 w konsoli, zeby znaki z build.py (np. znaczniki) nie wywalaly
    # Pythona (polska konsola = cp1250 -> UnicodeEncodeError).
    try {
        chcp 65001 > $null 2>&1
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $OutputEncoding = [System.Text.Encoding]::UTF8
    } catch { }
    $env:PYTHONUTF8 = '1'
    $env:PYTHONIOENCODING = 'utf-8'

    Set-Location $projectPath

    # --- Wykryj interpreter Pythona (py / python / python3) ---
    $python = $null
    foreach ($cmd in @('py', 'python', 'python3')) {
        if (Get-Command $cmd -ErrorAction SilentlyContinue) { $python = $cmd; break }
    }
    if (-not $python) {
        throw "Nie znaleziono Pythona (sprawdzono: py, python, python3). Zainstaluj Pythona lub dodaj go do PATH."
    }

    # --- 1. Skrypt budujacy (wstrzykuje APP_VERSION) ---
    Write-Host "Uruchamianie skryptu budujacego ($python tools\build.py)..." -ForegroundColor Cyan
    & $python "$projectPath\tools\build.py"
    if ($LASTEXITCODE -ne 0) {
        throw "Skrypt build.py zakonczyl sie bledem (kod: $LASTEXITCODE)."
    }

    # --- 2. Status repozytorium ---
    Write-Host "`nAktualny status Gita:" -ForegroundColor Cyan
    git status

    # --- 3. Opis commita od uzytkownika ---
    Write-Host "`n--------------------------------------------------" -ForegroundColor Yellow
    $commitMessage = Read-Host 'Wpisz opis zmian (commit message)'
    Write-Host "--------------------------------------------------`n"

    if ([string]::IsNullOrWhiteSpace($commitMessage)) {
        throw 'Opis zmian nie moze byc pusty.'
    }

    # --- 4. Prewencyjne usuniecie index.lock ---
    $lockPath = Join-Path $projectPath '.git\index.lock'
    if (Test-Path $lockPath) {
        Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
        Write-Host 'Usunieto pozostaly plik index.lock.' -ForegroundColor Gray
    }

    # --- 5. git add + commit (raz, poza petla retry) ---
    Write-Host 'Dodawanie zmian do indeksu...' -ForegroundColor Cyan
    git add .
    if ($LASTEXITCODE -ne 0) { throw "Blad podczas 'git add' (kod: $LASTEXITCODE)." }

    Write-Host 'Tworzenie commita...' -ForegroundColor Cyan
    git commit -m "$commitMessage"
    if ($LASTEXITCODE -ne 0) {
        throw "Blad podczas 'git commit' (kod: $LASTEXITCODE). Czy sa jakies zmiany do zacommitowania?"
    }

    # --- 6. Petla push z retry (powtarzany jest TYLKO push) ---
    $pushSuccess = $false
    $maxAttempts = 3
    $attempt = 0

    while (-not $pushSuccess) {
        $attempt++

        if ($attempt -gt 1) {
            Write-Host "`nProba $attempt/$maxAttempts. Czyszczenie index.lock i ponowna proba..." -ForegroundColor Magenta
            if (Test-Path $lockPath) {
                Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
                Write-Host 'Plik index.lock zostal usuniety.' -ForegroundColor Gray
            } else {
                Write-Host 'Plik index.lock nie istnial, probuje dalej...' -ForegroundColor Gray
            }
            Start-Sleep -Seconds 3
        }

        Write-Host 'Wypychanie zmian do repozytorium (main)...' -ForegroundColor Cyan
        git push origin main

        if ($LASTEXITCODE -eq 0) {
            $pushSuccess = $true
            Write-Host "`nGotowe! Zmiany zostaly pomyslnie wypchniete." -ForegroundColor Green
            Write-Host 'GitHub Actions uruchomi deploy. Sprawdz:' -ForegroundColor Green
            Write-Host '  https://github.com/Jayoz123/pmp-quiz/actions' -ForegroundColor Green
        } else {
            Write-Host "`nBlad podczas 'git push' (kod: $LASTEXITCODE)." -ForegroundColor Yellow
            if ($attempt -ge $maxAttempts) {
                throw "Push nie udal sie po $maxAttempts probach. Sprawdz polaczenie i stan repozytorium."
            }
            Write-Host 'Ponowna proba za chwile...' -ForegroundColor Yellow
        }
    }
}
catch {
    Write-Host ''
    Write-Host '==================================================' -ForegroundColor Red
    Write-Host "BLAD: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Skrypt zostal przerwany.' -ForegroundColor Red
    Write-Host '==================================================' -ForegroundColor Red
}
finally {
    Write-Host ''
    Read-Host 'Nacisnij Enter, aby zamknac to okno' | Out-Null
}
