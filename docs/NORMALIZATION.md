# Normalization of `typ_opatreni`

Source: `cykloopatreni_realizovana_opendata` FeatureServer layer 0 (Brno). The distinct values
below were read from the live service on **2026-11-14** with
`returnDistinctValues=true` and grouped statistics (count, sum of `delka`). The mapping lives in
`packages/shared/src/categories.ts` (`NORMALIZATION_TABLE`) and matches exact strings only.
Any value not listed becomes **Neznámý typ** and is flagged in the app's sources dialog.

| Original value (`typ_opatreni`) | Records | Σ `delka` (m) | App class | Route group | Reasoning |
|---|---:|---:|---|---|---|
| Stezka pro cyklisty - C8 | 16 | 3 653 | Oddělená cyklostezka | dedicated | Path for cyclists only (sign C8). |
| Stezka pro chodce a cyklisty (dělená) - C10 | 19 | 3 546 | Oddělená cyklostezka | dedicated | Segregated path: cyclists have their own marked half, off the carriageway. |
| Stezka pro chodce a cyklisty (nedělená) - C9 | 104 | 36 864 | Společná stezka pro chodce a cyklisty | shared | Shared space with pedestrians, off the carriageway. |
| Stezka pro chodce s povoleným vjezdem cyklistů | 18 | 6 260 | Společná stezka pro chodce a cyklisty | shared | Footpath where bikes are allowed; pedestrians have priority. |
| Vyhrazený jízdní pruh pro cyklisty - V14 | 53 | 15 872 | Vyhrazený cyklopruh | lane | Painted lane (solid line) **on the road** – not physically separated. |
| Ochranný jízdní pruh pro cyklisty | 12 | 6 089 | Ochranný cyklopruh | lane | Advisory lane (dashed line) on the road. |
| Jízda cyklistů v protisměru | 164 | 27 801 | Cykloobousměrka | other | Contraflow in a one-way street (mixed traffic). |
| Jízda cyklistů v protisměru - E12 | 1 | 621 | Cykloobousměrka | other | Same, with E12 plate. |
| Jízda cyklistů v protisměru (jízdní pruh) | 7 | 802 | Cykloobousměrka | other | Contraflow with a marked lane. |
| Piktogramový koridor pro cyklisty - V20 | 77 | 13 312 | Piktogramový koridor | other | Only pictograms on a normal road – **never counted as a path or a lane**. |
| Zákaz vjezdu všech motorových vozidel - B11 | 116 | 47 707 | Komunikace bez motorové dopravy | other | Road closed to motor vehicles; not a cycle path, surface/pedestrians vary. |
| Přejezd pro cyklisty | 28 | 429 | Ostatní cykloopatření | other | Short crossing over a road. |
| Vjezd cyklistům povolen | 79 | 20 293 | Ostatní cykloopatření | other | Exception from a no-entry sign for bikes. |
| Vyhrazený pruh pro taxi, cyklo, bus | 9 | 2 440 | Ostatní cykloopatření | other | Shared bus/taxi lane – not a cycle lane. |
| Ostatní | 3 | 115 | Ostatní cykloopatření | other | No further specification in the data. |
| *(empty / null)* | 3 | 249 | Neznámý typ | other | Type not filled in (these 3 records also have no geometry). |
| Úsek byl zrušen | 1 | 56 | Zrušeno / zákaz vjezdu cyklistů | — | Cancelled section – **excluded** from infrastructure and matching. |
| Vjezd cyklistům zakázán | 6 | 547 | Zrušeno / zákaz vjezdu cyklistů | — | Cycling prohibited – **excluded** from infrastructure and matching; hidden by default. |

Total: 716 records in the service (713 with valid geometry).

## Route groups used in statistics

| Group | Classes |
|---|---|
| Oddělené cyklostezky | Oddělená cyklostezka |
| Společné stezky s chodci | Společná stezka pro chodce a cyklisty |
| Cyklopruhy (na vozovce) | Vyhrazený cyklopruh, Ochranný cyklopruh |
| Ostatní cykloopatření | Cykloobousměrka, Piktogramový koridor, Komunikace bez motorové dopravy, Ostatní, Neznámý typ |
| Neověřeno / bez odpovídajícího záznamu | route pieces with no matching record |
