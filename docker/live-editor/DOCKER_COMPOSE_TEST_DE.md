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

1. In den Tab **Debug** wechseln.
2. Im **Debug**-Tab auf **Zonen & Masken Editor** klicken. Der Button steht nun **direkt neben Show/Hide Options** und ist unabhängig vom Aufklappen der Checkboxen sichtbar. Der normale Tab **Live** enthält keinen Editor-Button mehr. Beim Editieren wird bewusst **JSMpeg** verwendet.
3. Zuerst nur eine neue, nicht störende Testzone zeichnen.
4. Drei oder mehr Eckpunkte setzen, Polygon auswählen/verschieben und **Speichern**.
5. Kontrollieren, dass `config.yml` auf dem Host die neue `cameras.<kamera>.zones.<name>.coordinates` enthält. Bei einem Fehlschlag **nicht** weitermachen, sondern Logs ansehen.
6. Damit die Erkennung die neuen Zonen verwendet, den Testcontainer neu starten:

```bash
docker compose -f docker-compose.yml -f docker-compose.live-editor.yml \
  restart frigate
```

Prüfe zusätzlich: Zonenwahl, Eckpunktverschiebung mit vergrößerter unsichtbarer Trefferfläche, Löschen über **Bereich löschen** (nur bei Auswahl aktiviert), Abwahl über **Bearbeitung beenden** ohne Speichern, Überlappung verschiedener Zonen bei Punkterstellung, Rücksetzen („Verwerfen“), korrekte Koordinaten bei unterschiedlichen Fensterbreiten, bestehende Masken und Speicherhinweise.

**Neue Oberfläche prüfen:**
- Im Tab **Debug** stehen die Buttons **Show/Hide Options** und **Zonen & Masken Editor** direkt nebeneinander, beide mit **40 px Höhe**; auf kleinen Bildschirmen dürfen sie umbrechen. Im aufgeklappten Optionsbereich befinden sich nur die sechs Checkboxen.
- Auf großen Bildschirmen steht rechts vom Videobild ein **330 px** breites Werkzeugmenü mit `Neuen Bereich erstellen`, `Vorhandene Bereiche (Anzahl)` und `Ausgewählter Bereich`. Neue Buttons heißen `+ Zone`, `+ Maske` und `+ Objektfilter`. Die bestehenden Gruppen heißen `Zonen`, `Abgedeckte Bereiche` und `Objektfilter`. Die Einträge heißen z. B. `Einfahrt`, `Maske 1` oder `person 1`, **ohne Haken** oder Präfix. Gruppenüberschriften, Auswahlbuttons und `Keine` sind **14 px** groß; das Objektklassen-Auswahlfeld ist etwa **145 px** breit.
- Auf kleineren Bildschirmen wird das Menü **oberhalb** des Videobilds angezeigt und bleibt **immer vollständig sichtbar**, ohne Ein- oder Ausklappknopf. Alle Buttons, Auswahllisten und Speicheraktionen prüfen.
- Nach einem **erfolgreichen** Klick auf `Speichern` wird die aktive Zonen- oder Maskenauswahl aufgehoben: Die Eckpunktmarkierungen verschwinden, die Polygone bleiben sichtbar. Schlägt das Speichern fehl, bleibt der Bereich ausgewählt. Die Tabs **Live** und **Debug** erscheinen als kompakte Icon-Leiste weiterhin **rechtsbündig**. Ein verweigerter Tab-Wechsel wegen ungespeicherter Änderungen darf die aktive Tab-Markierung nicht verändern.
- **Statusanzeige testen:** Beim Öffnen des Editors **ohne Statusmeldung gibt es keinen reservierten Platz** oberhalb des Livebilds. Die Auswahl einer vorhandenen Zone, eines abgedeckten Bereichs oder Objektfilters blendet sofort `Nicht gespeicherte Änderungen` ein; die Auswahl allein ändert keine Koordinaten und aktiviert `Speichern` nicht. **Zwischen zwei Statusmeldungen liegen immer 16 px, ebenso zwischen der letzten Meldung und dem Livebild.** Bei keiner Statusmeldung gibt es überhaupt keinen zusätzlichen Abstand. Das Livebild darf beim Einblenden einer Meldung nach unten rutschen. Keine Meldung wird abgeschnitten oder in einer Scrollbox dargestellt.
- **Nur normale Statusmeldungen bleiben über dem Videobild:** `Nicht gespeicherte Änderungen` erscheint in weißer, fetter **16-px-Schrift** mit Symbol. Nach erfolgreichem Speichern bleibt die vollständig **grüne** Meldung `Die Änderungen wurden gespeichert. Ein Neustart von Frigate ist erforderlich.` mit grünem Häkchen und fettem zweiten Satz. **Alle roten Fehler und gelben Polygonwarnungen erscheinen ausschließlich in nativen Browser-Popups (`window.alert()`) mit OK-Schaltfläche**, nicht mehr als Elemente über dem Livebild. Beim Zeichnen unvollständiger Bereiche erscheint keine Warnung; erst ein Klick auf `Speichern` öffnet bei einem ungültigen Polygon das Popup und verhindert den API-Aufruf. Auch ungültige oder doppelte Zonennamen, ungültige Objektnamen und Fehler beim Laden/Speichern verwenden diese Popups. Die Abstände über dem Bild werden durch Fehler nicht verändert.
- Der frühere lange Hilfetext wird nicht mehr angezeigt. Das Modal nach **Restart Frigate** sollte über dem Editor erscheinen. Beim Wechsel zu **Live** mit ungespeicherten Änderungen sollte eine Warnung erscheinen.

- Beim Öffnen des Editors erscheint bis zum **ersten tatsächlich dekodierten Livebild** die Meldung `Kamera Vorschau wird geladen…`. Der graue Hintergrund muss die **gesamte Fläche der Kameravorschau** abdecken. Videocanvas, Ladehintergrund und Polygon-SVG benutzen jetzt eine einzige, fest dimensionierte Vorschaufläche; das JSMpeg-Canvas wird bei Bedarf an diese Fläche angepasst und darf **keinen zusätzlichen Streifen unter dem Ladehintergrund** erzeugen. Das gilt auch bei schmalerem Browserfenster und wenn die ursprüngliche Videoauflösung ein anderes Seitenverhältnis besitzt. Vorher werden keine Polygone oder Eckpunkte gezeichnet. Erst nach dem ersten Frame werden alle Bereiche eingeblendet; das Menü ist währenddessen sichtbar.
- Im Polygoneditor `Speichern` klicken und anschließend im Hauptmenü den **Config Editor** öffnen: Änderungen müssen dort **ohne Frigate-Neustart** in der rohen `config.yml` sichtbar sein. Unbenutzte Monaco-Modelle werden synchronisiert, **ungespeicherte manuelle Eingaben im Config Editor bleiben unangetastet**. Für die tatsächliche Erkennung ist weiterhin ein Neustart erforderlich.
- Neue Texte stammen aus `web/src/locales/de.json` mit verschachtelten Schlüsseln wie `cameras.debug.editor.button.mask` oder `cameras.debug.editor.header.existing_areas` und dynamischen Platzhaltern. Für Browser-Popups werden jetzt **ausschließlich** `cameras.debug.editor.modal.error.*` und `cameras.debug.editor.modal.warning.*` verwendet; die bisherigen Schlüssel unter `cameras.debug.editor.error.*` bzw. `.warning.*` sind **nicht mehr gültig**. Eine echte Sprachauswahl bzw. deren persistente Speicherung ist erst für später vorgesehen; derzeit bleibt Deutsch der Standard.

**Erwartet:** Beim Speichern legt die API eine `config.yml.live-editor.bak` bzw. `config.yaml.live-editor.bak` an. Die ursprüngliche Sicherheitskopie aus Schritt 2 bleibt separat erhalten.

## Vom Host editierbare deutsche Sprachdatei

Dein Compose-Dienst `frigate-test` verwendet bereits den notwendigen Verzeichnis-Mount:

```yaml
services:
  frigate-test:
    container_name: frigate-test
    image: ghcr.io/0fake/frigate:0.13.2-live-editor-dev
    volumes:
      - ./conf/frigate:/config
      - ./data/frigate/media:/media/frigate
```

**Kein zusätzlicher Volume-Mount erforderlich.** Die relative Pfadangabe bezieht sich auf den Speicherort der Compose-Datei. Nach dem ersten Start mit dem neuen Image wird die Datei automatisch angelegt, sofern sie noch nicht existiert:

- Host: `./conf/frigate/lang/de.json`
- Container: `/config/lang/de.json`

Die eingebauten Vorgaben stehen weiterhin unter `web/src/locales/de.json`. Eine bereits vom Host bearbeitete Datei wird beim Containerstart **niemals überschrieben**. Ihre Einträge können auch nur einzelne Textschlüssel enthalten; fehlende Schlüssel fallen automatisch auf die eingebauten deutschen Standardtexte zurück. **Achtung:** Falls deine Host-Datei den alten Text `Livebild wird geladen …` enthält, bitte `cameras.debug.editor.status.loading_stream` dort selbst in `Kamera Vorschau wird geladen…` ändern. Eine vorhandene Host-Datei wird absichtlich nicht durch ein Image-Update überschrieben.

**Umstellung der Popup-Texte ohne Rückwärtskompatibilität:** Bestehende eigene Fehlermeldungen unter `cameras.debug.editor.error` und `cameras.debug.editor.warning` müssen in der Host-Datei **manuell** in `cameras.debug.editor.modal.error` und `cameras.debug.editor.modal.warning` verschoben werden. Die alten Schlüssel werden ignoriert. Fehlt ein neuer Popup-Schlüssel, wird sein integrierter deutscher Standardtext angezeigt; die Host-Datei wird weiterhin nicht verändert.

Beispiel der neuen Übersetzungsstruktur für native Browser-Popups:

```json
{
  "cameras": {
    "debug": {
      "editor": {
        "modal": {
          "error": {
            "invalid_zone_name": "Der eingegebene Zonenname ist ungültig. Bitte verwende ausschließlich Buchstaben, Zahlen und Unterstriche.",
            "duplicate_zone_name": "Eine Zone mit diesem Namen ist bereits vorhanden. Bitte wähle einen anderen Zonennamen.",
            "save_failed": "Die Änderungen konnten nicht gespeichert werden. {details}"
          },
          "warning": {
            "invalid_zone": "Die Zone „{name}“ kann nicht gespeichert werden. Bitte lege mindestens drei Eckpunkte fest, die nicht auf einer Linie liegen."
          }
        }
      }
    }
  }
}
```

Beispiel der editierbaren Datei:

```json
{
  "cameras": {
    "debug": {
      "editor": {
        "button": {
          "open": "Zonen & Masken Editor"
        },
        "header": {
          "new_area": "Neuen Bereich erstellen"
        }
      }
    }
  }
}
```

1. Die Datei mit einem JSON-fähigen Texteditor auf dem Host ändern und speichern.
2. **Die vollständige Weboberfläche neu laden** (z. B. Strg+F5); ein Frigate-/Docker-Neustart ist für die Textänderungen nicht erforderlich.
3. Der Browser lädt die neue Datei über `/api/lang/de` ohne HTTP-Zwischenspeicherung.

Bei fehlerhaftem JSON, einer unlesbaren Datei oder einem API-Fehler erscheint eine verständliche, schließbare Warnung; die integrierten deutschen Texte bleiben verwendbar. Das fehlerhafte Host-Dokument wird **nicht gelöscht oder überschrieben**. Der Container benötigt Schreibrechte auf `./conf/frigate`, damit `lang/de.json` beim ersten Start angelegt werden kann. Eine dauerhafte Sprachauswahl in Frigates Einstellungen ist noch nicht enthalten.

`docker compose pull/up` muss mit dem tatsächlichen Dienstnamen **`frigate-test`** ausgeführt werden (nicht `frigate`, sofern dieser Dienst in deiner Compose-Datei nicht existiert).

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
