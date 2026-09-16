# Madagascar — atlas et sept biomes (v0.2)

## Ce qui fonctionne

- **Atlas géographique interactif** : contour de Madagascar issu de Natural Earth (via `world-atlas` 2.0.2), relief illustré, villes, trois sommets, îles et cours d’eau. Sélection de sept régions depuis la liste ou les repères clavier/souris, zoom, déplacement, recentrage, calques et itinéraire illustratif.
- **Fiches françaises** : ambiances, altitudes de référence, climat, sol, végétation et lieux emblématiques. Les photos d’ambiance sont générées par IA, ce ne sont pas des captures du moteur.
- **Carnet** : sauvegarde des étapes et des régions visitées dans `localStorage`, avec reprise après rechargement. Une région est marquée visitée lorsque le joueur y est effectivement présent dans le moteur chargé. Pas de compte, de serveur ou de synchronisation multi-appareils.
- **Exploration 3D** : chargement à la demande de l’ancien prototype, avec un point d’apparition par biome. Les sept zones coexistent dans la même scène, la marche et le taxi-brousse sont conservés. Retour à la carte avec **M**, ou avec le bouton ; **Échap** libère le pointeur si celui-ci a été capturé par un clic dans le monde.
- **Décors procéduraux ajoutés** : baobabs à gros troncs, Tsingy, végétation épineuse, canopée orientale, mangroves, roches sombres, jacarandas, flamboyants, rizières et canal. Les ravinalas du prototype existant sont conservés. Tronc/rocher : colliders simplifiés ; végétation basse : traversable.
- **Climat léger** : pluie de particules et brouillard selon la région réellement traversée ; cycle illustratif humide 80 % du temps à l’est. Le bouton sonore active un vent synthétique Web Audio, sans téléchargement et sans autoplay.
- **Export heightmap** : script hors ligne jusqu’à 16 384 × 16 384, 16 bits, par bandes pour borner la mémoire.

## Trois espaces distincts — important

| Espace | Géométrie / échelle | Ce que cela représente |
| --- | --- | --- |
| Atlas | Contour Natural Earth, coordonnées longitude/latitude | Géographie réelle ; relief et cours d’eau illustrés, non utilisables pour la navigation réelle |
| Prototype jouable | Grille de 760 m, 152 × 152 cellules | Sept zones comprimées autour du réseau routier existant, **pas** une reproduction géoréférencée à l’échelle 1:1 |
| Export `.r16` | Emprise EPSG:4326, résolution configurable jusqu’à 16K | Contour géographique et relief de direction artistique, **pas** un MNT/DEM mesuré |

Les chiffres **1 580 km** et **2 876 m** sont des références géographiques, pas les dimensions jouables. La simulation n’est pas encore une réalisation AAA : assets stylisés simples, pas de terrain en streaming, de brouillard volumétrique, de traversée chronométrée de 30 minutes, de navigation en bateau, ni d’enregistrements d’indris. Le raster 16K n’est pas chargé dans le navigateur.

## Exporter une heightmap

```bash
python3 -m venv .venv
.venv/bin/pip install numpy pillow

# Vérification rapide : 0,5 MiB
.venv/bin/python scripts/export-heightmap.py --size 512 --output generated/test

# Production : 512 MiB, volontairement hors Git
.venv/bin/python scripts/export-heightmap.py --size 16384
```

Produit `generated/madagascar-16k.r16` et `generated/madagascar-16k.json` :

- 16 bits non signés, little-endian, lignes du nord au sud ;
- altitude en mètres = `sample / 65535 × 3250 − 250` ;
- emprise `[42.7, -26.2, 50.8, -11.6]`, longitude/latitude WGS84 ;
- importer avec les **dimensions physiques non carrées** correspondant à l’emprise ;
- profils asymétriques, pente occidentale douce, escarpement oriental resserré ;
- contraintes de sommets : Maromokotro (2 876 m), Ankaratra / Tsiafajavona (2 642 m), Pic Boby / Imarivolanitra (2 658 m).

La prochaine étape de production serait de remplacer les altitudes illustrées par un MNT approprié, de reprojeter en coordonnées métriques, de découper le terrain en tuiles LOD et de placer les biomes selon des données écologiques validées.

## Régénérer le relief de l’atlas

```bash
# Le téléchargement est seulement nécessaire pour régénérer les assets.
npm pack world-atlas@2.0.2
# Extraire countries-50m.json vers public/data/countries.json.
.venv/bin/pip install numpy pillow scipy
.venv/bin/python scripts/make-atlas.py
# Ne pas conserver le fichier mondial complet dans public/data.
```

Le script extrait Madagascar et crée `public/data/madagascar.json`, `public/images/atlas-relief.png`, puis découpe le contact-sheet d’ambiance en six images. Aucun service distant n’est requis pour afficher l’application : images, polices et données finales sont locales.

## Nuances géographiques

Le brief est traité comme une direction artistique, pas comme une source scientifique exhaustive :

- le sud-ouest de Madagascar possède aussi des lagons et récifs ; ils ne sont pas limités aux petites îles ;
- la côte est comporte aussi des plages, cordons littoraux et lagunes, et n’est pas partout une falaise se jetant dans l’océan ;
- les Pangalanes sont un réseau de lagunes et de canaux aménagés : la longueur dépend du périmètre retenu ;
- le ravinala n’est pas un palmier ; jacarandas et flamboyants ne sont pas des espèces endémiques de Madagascar ;
- aucun manteau neigeux permanent n’est représenté sur les sommets ; les trois sommets de référence ne sont pas tous situés au nord et au sud.

## Vérifications

```bash
npm run lint
npm run build
npm test                  # suite existante + sept biomes
npx playwright install chromium
npm run dev               # autre terminal
npm run test:ui            # atlas, sauvegarde, clavier, calques, 3D et mobile
```

`check-biomes.mjs` vérifie la présence des sept régions, leurs points d’apparition secs et praticables, des sols distincts, les images locales, le placement déterministe et la validité des géométries. `check-atlas-ui.mjs` couvre les interactions principales et les erreurs runtime. Le test physique existant conserve ses 72 assertions.

## Sources et licences

- Côte : Natural Earth, domaine public, distribuée par `world-atlas` (ISC). Licence incluse dans `public/data/LICENSE-world-atlas.txt`.
- DM Sans et Manrope : polices locales, licences dans `public/fonts/`.
- Images d’ambiance : générées pour ce prototype, sans recours à des photos tierces.
- Le relief illustré, les shaders, les modèles procéduraux et l’interface sont générés par le code du projet.
