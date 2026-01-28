---
description: "Aggiorna OpenWhispr da upstream: fetch, merge, build"
argument-hint: "[--skip-build] [--force]"
---

Aggiorna OpenWhispr prendendo gli ultimi commit dalla repository upstream (HeroTools/open-whispr), li integra nel branch main locale, pusha sul fork, e rigenera la build.

## Supported Syntax

```
/update-from-upstream                 # Flusso completo con conferme
/update-from-upstream --skip-build    # Solo git operations, senza rebuild
/update-from-upstream --force         # Salta conferme (usa con cautela)
```

## Contesto del Progetto

- **Repo locale**: `C:\Users\Federico\GitHub_Repo\open-whispr`
- **origin**: fork personale (`https://github.com/Hiygos/open-whispr.git`)
- **upstream**: repo originale (`https://github.com/HeroTools/open-whispr.git`)
- **Build output**: `dist\win-unpacked\OpenWhispr.exe`
- **Launcher**: `run-openwhispr.cmd`

## Flusso di Lavoro (esegui in ordine)

### 0. Check Aggiornamenti Disponibili (PRIMO STEP OBBLIGATORIO)

Prima di qualsiasi altra operazione, verifica se ci sono aggiornamenti:

```bash
cd C:\Users\Federico\GitHub_Repo\open-whispr
git fetch upstream
git rev-list --count main..upstream/main
```

**Se il conteggio è 0**:
- STOP IMMEDIATO
- Mostra: "✅ Nessun aggiornamento disponibile. Hai già la versione più recente."
- Mostra versione corrente: `git log -1 --oneline`
- NON procedere con gli altri step
- ESCI dal flusso

**Se il conteggio è > 0**:
- Mostra: "📦 Trovati X nuovi commit da upstream"
- Mostra lista commit: `git log --oneline main..upstream/main`
- Chiedi conferma: "Vuoi procedere con l'aggiornamento? (sì/no)"
- Se l'utente conferma, procedi con Step 1

---

### 1. Pre-flight Check

Verifica lo stato del repository prima di procedere:

```bash
git status
git remote -v
git branch --show-current
git log -1 --oneline
```

**STOP se**:
- Working tree non è clean (modifiche non committate)
- Non sei sul branch `main`
- Remote `upstream` non configurato

### 2. Merge upstream/main → main

```bash
git checkout main
git merge upstream/main
```

**Se ci sono conflitti**:
1. NON fare commit automaticamente
2. Elenca i file in conflitto: `git diff --name-only --diff-filter=U`
3. Mostra i conflitti all'utente
4. Proponi risoluzioni (preferisci upstream)
5. CHIEDI CONFERMA prima di `git add` e `git commit`

### 3. Push sul Fork

```bash
git push origin main
```

**Se fallisce**: Spiega il motivo e proponi la fix.

### 4. Verifica App Chiusa

Prima della build, verifica che OpenWhispr non sia in esecuzione:

```bash
tasklist | findstr /i "OpenWhispr"
```

**Se in esecuzione**: CHIEDI all'utente di chiudere l'app prima di procedere.

### 5. Aggiornamento Dipendenze

```bash
npm install
```

Ignora i warning di deprecazione (sono normali).
Le vulnerabilità in `electron-builder` sono solo nel tool di build, non nell'app.

### 6. Build

```bash
npm run pack
```

Genera `dist\win-unpacked\OpenWhispr.exe`.

### 7. Validazione Finale

Verifica che l'EXE esista:
```bash
Test-Path dist\win-unpacked\OpenWhispr.exe
```

Suggerisci all'utente di avviare l'app:
```bash
.\run-openwhispr.cmd
```

## Vincoli di Sicurezza

- **NON stampare** mai contenuti di `.env` o API keys
- **NON committare** `.env`, `dist/`, `node_modules/`
- **NON procedere** automaticamente in caso di conflitti git
- **NON fare** `git push --force` senza esplicita conferma

## Output Richiesto

Al termine, mostra:
- Stato repo prima/dopo (commit hash)
- Numero di commit integrati
- File modificati (riassunto)
- Percorso EXE finale
- Comandi di rollback se necessario

## Rollback

Se qualcosa va male dopo l'update:

```bash
# Trova il commit precedente
git reflog

# Torna al commit precedente (sostituisci HASH)
git reset --hard HASH

# Rigenera la build
npm run pack
```

## Note

- L'auto-updater è disabilitato via `OPENWHISPR_DISABLE_UPDATES=true` in `src/.env`
- `dbus-next` è stato rimosso (non serve su Windows)
- Il file `run-openwhispr.cmd` è in `.gitignore` (locale)
