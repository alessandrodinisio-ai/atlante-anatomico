# Atlante anatomico

Esploratore interattivo dell'anatomia umana costruito sulle tavole SVG del pacchetto npm
[`@ebi-gene-expression-group/anatomogram`](https://github.com/gxa/anatomogram) (EMBL-EBI Expression Atlas),
con gli identificativi delle ontologie UBERON e CL già incorporati nei disegni.

**Online:** https://alessandrodinisio-ai.github.io/atlante-anatomico/

Un unico file HTML autonomo: [`index.html`](index.html) (documento completo, servito da GitHub Pages) e
[`atlante.html`](atlante.html) (stesso contenuto senza scheletro, per la pubblicazione come artifact).
Gli SVG sono incorporati nella pagina, senza richieste di rete oltre ai font di Google Fonts.

## Cosa contiene

- **Due tavole**: corpo maschile (`homo_sapiens.male.svg`) ed encefalo (`homo_sapiens.brain.svg`, quattro viste).
- **101 schede in italiano**, ciascuna con cinque linguette: Panoramica, Anatomia, Istologia, Clinica, Ontologia.
- **Selezione per strati**: un clic elenca tutte le strutture sovrapposte in quel punto; un secondo clic scende di livello.
- **Zoom e pan** (rotellina, trascinamento, pinch), inquadrature per regione, filtri per sistema.
- **Esercitazione**: individua la struttura sulla tavola, tre tentativi, indizi e punteggio.
- **Feedback sonoro** sintetizzato in Web Audio (legno, carta, scatti), disattivabile con il tasto S.
- Tema chiaro e scuro, layout per telefono, collegamenti diretti alle strutture (`…/atlante-anatomico/#UBERON_0002107`).

Tasti: `/` cerca · `↑ ↓` struttura precedente/successiva · `1–5` linguette · `+ − 0` zoom · `F` inquadra · `S` suoni · `Esc` deseleziona.

## Struttura

```
index.html              pagina generata per GitHub Pages
atlante.html            stessa pagina senza scheletro (artifact)
src/template.html       markup e CSS
src/app.js              logica: caricamento SVG, zoom, selezione, schede, esercitazione, audio
src/data_*.js           contenuti anatomici per sistema
src/svg/                SVG ottimizzati (male.svg, brain.svg)
src/optimize.cjs        ottimizzazione SVGO 1.x con cleanupIDs disattivato
src/build.py            assembla index.html e atlante.html
```

## Ricostruire la pagina

```bash
python3 src/build.py src/svg
```

Per riottimizzare gli SVG originali del pacchetto (serve SVGO 1.x):

```bash
SVGO_PATH=/percorso/node_modules/svgo node src/optimize.cjs homo_sapiens.male.svg src/svg/male.svg
```

## Note sugli SVG

Gli SVG dell'anatomogram dichiarano `fill:none;stroke:none` su ogni struttura. Al caricamento la pagina rimuove quegli stili,
assegna riempimenti e tratti predefiniti, toglie `visibility:hidden` e solo dopo applica i colori dell'atlante.
Gli identificativi sono preservati (`cleanupIDs: false`) perché servono a selezionare le strutture.

Nel file originale l'osso ha l'identificativo `UBERON_00024818`, ricondotto a `UBERON_0002481`.
Alcuni termini (sangue, vasi, linfociti, retina, dura madre) sono elementi `<use>` che riusano un altro disegno: l'atlante li tratta come alias.

## Avvertenza

I contenuti hanno scopo didattico e non sostituiscono il giudizio clinico.

## Crediti

Illustrazioni: `@ebi-gene-expression-group/anatomogram` 2.4.0, EMBL-EBI, licenza Apache-2.0 (vedi [NOTICE](NOTICE)).
