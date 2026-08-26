# Evia ↔ Milos QR contract

Milos uses versioned, minimal QR payloads so the two apps can exchange course and review information without exchanging a learner's identity or evidence files.

## Evia progress → Milos

Prefix: `NISI:EVIA:PROGRESS:1:` followed by base64url-encoded UTF-8 JSON.

Core compact fields:

| Field | Meaning |
| --- | --- |
| `v` | Payload schema version |
| `t` | `progress` |
| `r` | Pseudonymous shared learner reference |
| `c` | Milos course route, such as `ST0095` or `ST0264-SITE` |
| `s`, `e` | Course start and planned end (`YYYY-MM-DD`) |
| `l`, `lt` | Current learning hours and target hours |
| `z` | Completed KSB/AC codes |
| `d` | Codes changed in the legacy progress baseline |
| `tg` | Current targets: title, due date and optional course code |
| `lr`, `ec`, `u` | Last review, evidence count and export timestamp |

### Evia Coach extension

Evia v231 can also include `co`, an anonymous review-period Coach Snapshot. Milos 2.22 sanitises this structure before attaching it to the locally named learner profile.

| `co` field | Meaning |
| --- | --- |
| `p` | Review-period id, start, end and elapsed days |
| `u` | Evia sessions, active days/weeks and Course/Learn/Test activity counts |
| `c` | Course coverage at the period baseline and now, plus newly covered codes |
| `e` | New evidence totals by photo, video, audio, written, witness and assessor sources |
| `l` | OTJ/GLH added in the period and new learner-recorded entries |
| `q` | Multiple-choice, discussion, practical, Maths and English practice summaries |
| `tg` | Targets completed, open and overdue |
| `cf` | Confidence baseline/current average, changed areas and lowest current areas |
| `wb` | Number of wellbeing check-ins and the neutral three-state sequence only |

The Coach Snapshot never contains the learner's name, contact details, evidence media, signatures, written evidence text, audio transcripts or wellbeing notes. The `wb` field is a review prompt only; Milos does not infer a diagnosis or emotional label from it.

Milos also accepts the aliases `EVIA-PROGRESS:1:` and `EVIA1:PROGRESS:` and a plain JSON form. It rejects unknown courses and ignores personal keys such as name, photo, contact details and signatures even if a producer includes them accidentally.

## Milos observation → Evia

Prefix: `NISI:MILOS:OBS:1:` followed by base64url-encoded UTF-8 JSON.

| Field | Meaning |
| --- | --- |
| `v` | Protocol version (`1`) |
| `t`, `a` | `observation`, `mark-observed` |
| `r` | Same pseudonymous shared learner reference |
| `c` | Course route |
| `o`, `d` | Observation public ID and date |
| `z` | Criteria judged `Observed` |
| `m` | `blue-o` marker instruction |
| `u` | Completion timestamp |

The return QR never contains the learner's name, assessor name, comments, media or signatures. Evia validates the version, learner reference and enrolled course, deduplicates the observation ID, and places a blue `o` only beside supplied valid course codes.

Milos requires a full Evia progress scan containing `r` before it can complete an observation return QR. A manually selected course or course-only QR is sufficient for drafting, but cannot establish the cross-app learner match.
