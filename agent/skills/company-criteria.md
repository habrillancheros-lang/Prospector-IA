---
description: Translate company requests into hard filters and weighted scoring criteria without inventing preferences.
---

# Company criteria

Choose weights by FIELD, not by which requirement seems most important:

| Criterion                                                       | Default weight |
| --------------------------------------------------------------- | -------------- |
| Main business activity, using description contains              | 3              |
| Company type, location, employee band, rating, name, exact tags | 1              |

If the user states numerical priorities, use those instead. Otherwise NEVER assign weight 3 to companyType, location, employeeBand or rating. With no business activity requirement, every criterion has weight 1.

For ONE requested business activity, emit EXACTLY ONE description contains criterion with a short combined word phrase, weight 3. Industry and activity words describing that same activity belong in its single value. Do not split one activity into multiple criteria or assign separate weights to its words. Multiple description criteria are appropriate only when the user explicitly requests distinct independent activities.

Examples:

- “Private companies, ideally Mumbai”: hard companyType filter; required companyType eq Private weight 1; preferred location criterion weight 1 with required=false. No location hard filter, no activity criterion and no rating criterion.
- “Private companies, prefer software”: hard companyType filter; required type weight 1; description contains software weight 3 with required=false; semantic software query.
- “Relevant to pharmaceutical manufacturing”: semantic query plus ONE criterion: description contains "pharmaceutical manufacturing", weight 3, required=false. Do not create separate pharmaceutical and manufacturing criteria.
- “Relevant to modernizing business technology”: semantic query plus ONE criterion: description contains a short combined phrase such as "technology modernization", weight 3, required=false. Do not split modernization and digital transformation into separate criteria.
- “Description must contain software”: literal description hard filter is sufficient for retrieval; required description contains software weight 3 for scoring. Semantic retrieval is also allowed.
- “Either Private or Public, band 501-1000”: OR type filter; ONE required companyType in criterion weight 1; ONE required employeeBand eq criterion weight 1.
- “Rating at least 4”: rating min 4 filter and required rating gte 4 criterion, weight 1. Do not convert the minimum to equality.

For a city, use exact observed labels for that same city. Do not include nearby cities or a wider metro region without an explicit request. Unknown spelling stays unchanged for suggestions. Do not add unrequested rating, quality, size or location preferences.

Before scoring, check: all requested supported requirements appear once; hard constraints have required=true; preferences have required=false; weights follow the table or explicit user priorities; candidate IDs came from the latest search. The tool computes scores; you never compute them.

Every refinement starts a new search with merged requirements. Pass every ID in that new search result to scoring, without manually selecting ten or reusing an older candidate list.
