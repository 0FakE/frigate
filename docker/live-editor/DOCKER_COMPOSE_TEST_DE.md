# Frigate 0.13.2 Live Zone Editor: sicherer Test mit Docker Compose

Dieses Dokument beschreibt **eine zeitweise Umstellung des vorhandenen Compose-Dienstes**. Es ist **keine isolierte Parallelinstallation**. Der Frigate-Container wird dabei ersetzt; die angehängten Daten-Volumes bleiben bestehen.

**Vorbedingungen**

- Der vorhandene Frigate-Container ist bereits **Version 0.13.2**. Ist er neuer, bitte **nicht** dieselbe Datenbank und `config.yml` mit diesem 0.13.2-Testimage verwenden! Dann separate Testinstanz mit separatem `/config`, separaten Medien-Volumes, anderen Ports, und ohne konkurrierende MQTT-Topics aufbauen.
- Docker-Host ist **linux/amd64** (z. B. `uname -m` liefert `x86_64`).
- Der Compose-Dienst heißt `frigate`. Sonst den Namen in Dateibeispiel und Befehlen ersetzen.
- Das gesamte Konfigurations**verzeichnis** (nicht nur die YAML-Datei) ist beschreibbar nach `/config` gemountet.
- Während des Tests gibt es ein Wartungsfenster: laufende Aufnahmen können kurz unterbrochen werden.
- Keine direkt aus dem Internet erreichbare Frigate-0.13.2-Instanz.

## 1. Bestand prüfen

Alle Befehle im Verzeichnis deiner bisherigen `docker-compose.yml` ausführen:

```bash
uname -m
docker compose version
docker compose config --services
docker compose config --images
docker compose ps
docker inspect "$(docker compose ps -q frigate)" \
  --format '{{range .Mounts}}{{println .Type .Source "->" .Destination}}{{end}}'
```

Damit lässt sich erkennen, wo `/config` tatsächlich auf dem Host liegt. Andere reale Compose-Dateinamen (z. B. `compose.yaml`) in den folgenden Befehlen entsprechend einsetzen.

## 2. Backup

Bisherige Compose-Datei und vorhandene `config.yml` / `config.yaml` **auf dem Host** kopieren:

```bash
cp -a docker-compose.yml docker-compose.yml.before-live-editor
# Beispiel – an den echten Host-Pfad des /config-Mounts anpassen!
cp -a /PFAD/ZU/FRIGATE-CONFIG/config.yml /PFAD/ZU/FRIGATE-CONFIG/config.yml.before-live-editor
```

Enthält die Datei `config.yaml` statt `config.yml`, diesen Namen verwenden. Nur wenn das Original angehalten ist oder eine konsistente SQLite-Backupmethode genutzt wird, zusätzlich ein komplettes Datenverzeichnis mit offener SQLite-Datenbank archivieren. Backups sicher aufbewahren; sie können RTSP-/MQTT-Zugangsdaten enthalten.

**Sind bestehende Frigate-Version oder Datenbankzustand unklar, hier noch nicht fortfahren.**

## 3. Image ziehen

```bash
docker pull ghcr.io/0fake/frigate:0.13.2-live-editor-dev
```

Falls `denied` / `unauthorized` erscheint, prüfe die Paket-Sichtbarkeit im GitHub-Konto. Bei einem privaten Paket kann eine GHCR-Anmeldung mit einem geeigneten persönlichen Token und `read:packages` nötig sein. Keine Zugangstoken im Chat teilen.

## 4. Override-Datei erstellen

Die Beispiel-Override-Datei liegt hier im Fork:

`docker/live-editor/docker-compose.live-editor.yml.example`

Kopiere sie in dasselbe Verzeichnis wie deine bestehende `docker-compose.yml` und benenne sie `docker-compose.live-editor.yml`:

```yaml
services:
  frigate:
    image: ghcr.io/0fake/frigate:0.13.2-live-editor-dev
```

Prüfen, welches Image tatsächlich verwendet würde:

```bash
docker compose -f docker-compose.yml -f docker-compose.live-editor.yml config --images
```

Der übrige Compose-Inhalt (Kameras, Geräte, Netzwerke, Volumes) muss erhalten bleiben. Vor dem Test kurz klären, ob du eine Aufzeichnungsunterbrechung akzeptieren kannst.

## 5. Vorhandenen Frigate-Container vorübergehend ersetzen

```bash
docker compose -f docker-compose.yml -f docker-compose.live-editor.yml \
  up -d --no-deps --force-recreate frigate

docker compose -f docker-compose.yml -f docker-compose.live-editor.yml ps frigate

docker compose -f docker-compose.yml -f docker-compose.live-editor.yml \
  logs --tail=120 frigate
```

Keinesfalls `docker compose down -v` ausführen: Das würde benannte Volumes löschen können.

## 6. Browser-Test

In derselben Weboberfläche wie bisher die Kamera öffnen:

1. In die **Live-Ansicht** wechseln.
2. **Zonen & Masken bearbeiten** wählen. Beim Editieren wird bewusst **JSMpeg** verwendet.
3. Zuerst nur eine neue, nicht störende Testzone zeichnen.
4. Drei oder mehr Eckpunkte setzen, Polygon auswählen/verschieben und **Speichern**.
5. Kontrollieren, dass `config.yml` auf dem Host die neue `cameras.<kamera>.zones.<name>.coordinates` enthält. Bei einem Fehlschlag **nicht** weitermachen, sondern Logs ansehen.
6. Damit die Erkennung die neuen Zonen verwendet, den Testcontainer neu starten:

```bash
docker compose -f docker-compose.yml -f docker-compose.live-editor.yml \
  restart frigate
```

Prüfe zusätzlich: Zonenwahl, Eckpunktverschiebung, Löschen, Rücksetzen („Verwerfen“), korrekte Koordinaten bei unterschiedlichen Fensterbreiten, bestehende Masken, Speicherhinweise.

**Erwartet:** Beim Speichern legt die API eine `config.yml.live-editor.bak` bzw. `config.yaml.live-editor.bak` an. Die ursprüngliche Sicherheitskopie aus Schritt 2 bleibt separat erhalten.

## 7. Rollback auf die bisherige Version

Zuerst den Testcontainer stoppen:

```bash
docker compose -f docker-compose.yml -f docker-compose.live-editor.yml stop frigate
```

Wenn du den Konfigurationsstand von vor dem Test vollständig zurücksetzen möchtest, die gesicherte `config.yml` bzw. `config.yaml` jetzt auf dem Host wiederherstellen. Danach **nur mit deiner ursprünglichen Compose-Datei** starten:

```bash
docker compose -f docker-compose.yml up -d --no-deps --force-recreate frigate
docker compose -f docker-compose.yml ps frigate
```

Solange ein Test-Override besteht, **nicht** versehentlich künftig damit deployen, wenn die alte Version zurückgewünscht ist. Nach erfolgreichem Rollback kannst du das Override entfernen.

## Falls etwas schiefgeht

- Image nicht abrufbar: GitHub Packages Sichtbarkeit / Anmeldung überprüfen.
- Editor-Schaltfläche fehlt: Browser-Cache hart neu laden und Container-Version kontrollieren.
- 400 beim Speichern: ungültiges Polygon oder Konfigurationsschema (Logs kontrollieren).
- 409 beim Speichern: `config.yml` wurde zwischen Laden und Speichern geändert → Editor „Verwerfen“ / erneut laden.
- 500 beim Speichern: Schreibrechte auf **das Konfigurationsverzeichnis** prüfen. Einzeldatei-Bind-Mounts sind wegen atomaren Ersetzens ungeeignet.
- Livebild und Polygone nicht deckungsgleich: Bildschirmfoto ohne private Kamerainhalte bzw. Angaben über Stream-/Detect-Auflösung liefern.
- Bei älterer 0.13.2-Hardware oder nicht amd64 → keine Ausführung des AMD64-Images erzwingen.

**Status:** Frontend-Build, Lint, Python-Unit-Tests und Docker-Preview-Build sind erfolgreich. Vollständige Funktion mit einem realen Kamerastream ist noch nicht nachgewiesen.
