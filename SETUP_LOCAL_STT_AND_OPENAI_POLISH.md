# Setup: STT Locale + Polish OpenAI

Questa guida spiega come configurare OpenWhispr per:
1. **Trascrizione 100% locale** (whisper.cpp) - zero costi, nessun audio inviato al cloud
2. **Polish/cleanup testo** con OpenAI API

---

## Prerequisiti

- Node.js v18+ (`node -v`)
- npm (`npm -v`)
- Git (`git --version`)
- Chiave OpenAI API (solo per polish, NON per trascrizione)

---

## 1. Installazione Dipendenze

Apri un terminale nella cartella del progetto ed esegui:

```powershell
cd C:\Users\Federico\GitHub_Repo\open-whispr
npm install
```

Questo installerà tutte le dipendenze necessarie.

---

## 2. Download Binario whisper-server

Dopo `npm install`, scarica il binario di whisper.cpp:

```powershell
npm run download:whisper-cpp
```

### Cosa succede:
- Scarica `whisper-server-win32-x64.exe` da GitHub
- Lo salva in `resources/bin/`

### ⚠️ Windows Defender potrebbe bloccare il file!

Se vedi un avviso o il file viene messo in quarantena:

1. **File bloccato:** `resources\bin\whisper-server-win32-x64.exe`
2. **Cosa fare:**
   - Apri **Windows Security** → **Virus & threat protection**
   - Vai in **Protection history**
   - Trova il file bloccato e clicca **Allow on device**
   - Oppure aggiungi un'esclusione per la cartella `resources\bin\`

---

## 3. Download Modello Whisper (al primo avvio)

I modelli Whisper vengono scaricati dall'app. Al primo avvio:

1. Vai in **Settings** (icona ingranaggio)
2. Sezione **Transcription**
3. Seleziona un modello (consigliato: **Base** - 74MB)
4. Clicca **Download**

I modelli vengono salvati in:
```
C:\Users\<TuoNome>\.cache\openwhispr\whisper-models\
```

### Modelli disponibili:

| Modello | Dimensione | Qualità | Velocità |
|---------|------------|---------|----------|
| tiny | 39MB | Bassa | Velocissimo |
| **base** | 74MB | Buona | Veloce |
| small | 244MB | Migliore | Medio |
| medium | 769MB | Alta | Lento |
| large | 1.5GB | Massima | Molto lento |
| turbo | 809MB | Alta | Veloce |

---

## 4. Configurazione in App

### Impostare Trascrizione Locale

1. Avvia l'app: `npm run dev`
2. Clicca sull'icona **Settings** (ingranaggio)
3. Vai alla sezione **Transcription**
4. Attiva il toggle **"Local"** (non "Cloud")
5. Seleziona il modello Whisper (es. "Base")

### Impostare Polish con OpenAI

1. Nella sezione **API Keys**, inserisci la tua `OPENAI_API_KEY`
2. Vai alla sezione **Reasoning** (o "Text Processing")
3. Seleziona provider: **OpenAI**
4. Seleziona modello economico:
   - `gpt-4.1-nano` (più economico, velocissimo)
   - `gpt-5-nano` (economico, veloce)
   - `gpt-4.1-mini` (bilanciato)

---

## 5. Verifica Configurazione

### Test Trascrizione Locale

1. Premi il tasto hotkey per registrare
2. Parla per qualche secondo
3. Premi di nuovo per fermare
4. Verifica che il testo appaia (senza errori di rete)

### Test Polish OpenAI

1. Dopo la trascrizione, il testo viene automaticamente "polished"
2. Controlla i log (F12 → Console) per vedere:
   ```
   OPENAI_REQUEST: { endpoint: "https://api.openai.com/v1/responses", ... }
   ```

---

## 6. Troubleshooting

### Errore "whisper-server binary not found"

```
✗ whisper-server: Not found
```

**Soluzione:** Esegui di nuovo `npm run download:whisper-cpp` e controlla Windows Defender.

### Errore "Model not downloaded"

```
Whisper model "base" not downloaded
```

**Soluzione:** Vai in Settings → Transcription e scarica il modello.

### Errore 403/401 con OpenAI

```
OpenAI API error: 403
```

**Soluzione:** La tua API key potrebbe non avere i permessi necessari.

Vai su [OpenAI Platform](https://platform.openai.com/api-keys) e verifica che la key abbia accesso a:
- `/v1/responses` (Responses API) **OPPURE**
- `/v1/chat/completions` (Chat Completions)

**Nota:** Per il polish NON serve `/v1/audio/transcriptions` - quello è solo per trascrizione cloud!

### Errore "EACCES" o permessi file

Su Windows, assicurati di eseguire il terminale come Amministratore se hai problemi di permessi.

---

## 7. Verifica Finale

### Checklist ✓

- [ ] `node_modules/` esiste
- [ ] `resources/bin/whisper-server-win32-x64.exe` esiste
- [ ] Modello Whisper scaricato (es. `~/.cache/openwhispr/whisper-models/ggml-base.bin`)
- [ ] `.env` contiene `OPENAI_API_KEY=sk-...`
- [ ] In app: Transcription impostato su "Local"
- [ ] In app: Reasoning model impostato su OpenAI (es. gpt-4.1-nano)

### Comandi utili

```powershell
# Avvia in modalità sviluppo
npm run dev

# Avvia in modalità produzione
npm start

# Verifica dipendenze
npm ls better-sqlite3 ffmpeg-static
```

---

## Note sulla Privacy

Con questa configurazione:
- ✅ **Audio:** processato SOLO sul tuo PC (whisper.cpp locale)
- ✅ **Trascrizione:** nessun audio inviato al cloud
- ⚠️ **Polish:** il TESTO trascritto viene inviato a OpenAI per il cleanup
- ✅ **API Key:** salvata localmente in `.env` (file già in .gitignore)

Se vuoi privacy totale, puoi disabilitare il polish nelle impostazioni.

---

## Struttura File

```
open-whispr/
├── .env                          # API keys (NON committare!)
├── resources/
│   └── bin/
│       └── whisper-server-win32-x64.exe  # Binario whisper.cpp
├── ~/.cache/openwhispr/
│   └── whisper-models/
│       └── ggml-base.bin         # Modello Whisper scaricato
```
