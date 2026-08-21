# Evia ↔ Milos QR contract (version 1)

Milos uses versioned, minimal QR payloads so the two apps can exchange course status without exchanging a learner's identity or evidence files.

## Evia progress → Milos

Prefix: `NISI:EVIA:PROGRESS:1:` followed by base64url-encoded UTF-8 JSON.

Compact fields:

| Field | Meaning |
| --- | --- |
| `v` | Protocol version (`1`) |
| `t` | `progress` |
| `r` | Pseudonymous shared learner reference |
| `c` | Milos course route, such as `ST0095` or `ST0264-SITE` |
| `s`, `e` | Course start and planned end (`YYYY-MM-DD`) |
| `l`, `lt` | Current learning hours and target hours |
| `z` | Completed KSB/AC codes |
| `d` | Codes changed since the previous review |
| `tg` | Current targets: title, due date and optional course code |
| `lr`, `ec`, `u` | Last review, evidence count and export timestamp |

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

The return QR never contains the learner's name, assessor name, comments, media or signatures. Evia should validate the version, learner reference and enrolled course, deduplicate the observation ID, and place a blue `o` only beside the supplied valid course codes.

Milos requires a full Evia progress scan containing `r` before it can complete an observation return QR. A manually selected course or course-only QR is sufficient for drafting, but cannot establish the cross-app learner match.
