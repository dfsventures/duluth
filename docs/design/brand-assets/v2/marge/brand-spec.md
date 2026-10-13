# Marge brand kit, round 2

Status: proposal, not committed. Marge's repo (dfsventures/marge) is untouched.
Preview: https://claude.ai/artifact/Trth4wZeZqTuXPBgZbJbWr
Family rules and the DFS module: `../brand-spec.md`. Molly's kit: `../molly/brand-spec.md`.

## Concept: Deadpan
Marge is a teammate: she remembers what the team says, answers in channels, keeps DMs private. Her voice is plain, direct, a little dry. So her mark is a person built only from DFS parts: the DFS underscore is her mouth, two dots are her eyes, and the head is the DFS "D" as a speech bubble (radius on three corners, the bottom-left square: the DFS corner).
Round 1 refused a face. This round reverses that on purpose, because the brief was character and warmth, and this face contains nothing but the underscore and two dots, so it stays restrained. It also gives her a motion language: the mouth is the cursor, so her typing indicator is her face.
Alternatives drawn and rejected, with reasons, are in the preview and in `../concepts/`: Dog-ear (reads as a sticky note), Beam bubble (the safe fallback: reads as the letter I), and seven killed sketches (thought bubble, lens of scopes that reads as an eye, keyhole, undertie smile, hand-circled ring, bar-and-dot "i", bubble-bird).

## 1. Logo
| File | Use |
|---|---|
| `marge-wordmark.svg`, `-reverse.svg` | **Primary logo**: `_Marge`. Underscore prefix like every DFS name |
| `marge-wordmark-plain.svg` | no underscore, for lockups |
| `marge-mark.svg` | on Paper: Obsidian head, Ochre features |
| `marge-mark-reverse.svg` | on Obsidian: Ochre head, features are real holes so the ground shows through |
| `marge-mark-mono.svg` | one colour, holes |
| `marge-lockup.svg`, `-reverse.svg` | avatar tile + name, cap height centred on the tile |
| `marge-head-construction.svg`, `marge-wordmark-guides.svg`, `marge-expressions.svg` | the drawing and the five states, for handoff |

**Head construction** (100-unit box): radius 50 on three corners, 0 bottom-left. Eyes r 6.5 at (32.5, 40) and (68.5, 40). Mouth 30 x 8.2 (the DFS bar's own 3.67:1) at (35.5, 61.5). The face is centred 0.5 right of the box to balance the square corner.
**Wordmark**: the capital M is Molly's drawing scaled to Space Grotesk's cap height. The lowercase is Space Grotesk: its single-storey `a` (stylistic set ss01, foot cut flush with the stem), `r`, `g` (descender compressed so the tail's bottom sits on the underscore line, 25.5 below the baseline) and `e`, interpolated 1.5x beyond the 600 to 700 master step (about weight 850; the axis stops at 700) so the stems equal the M's at 0.205 of cap. Spacing by closest approach: M-a 7.8%, a-r 11.1%, r-g 8.5%, g-e 8.9% of cap. This exists only as outlines; it cannot be live text.
- **Clear space**: 0.5 of the head on every side. **Minimum size**: head 16px with the pixel-grid cut; wordmark cap height 9px.

## 2. Avatars and icons
| File | Use |
|---|---|
| `marge-slack-avatar-512.svg`, `png/marge-slack-avatar-512.png` | **Slack app icon.** Full-bleed square (Slack rounds it): Ochre tile, Obsidian head at 60%, Ochre features. `png/marge-slack-avatar-{72,36}.png` are previews |
| `marge-slack-avatar-small-512.svg`, `png/marge-slack-avatar-small-{40,20}.png` | cut for 24px and under: Paper features, head at 64% |
| `marge-slack-avatar-dark-512.svg`, `png/marge-slack-avatar-dark-512.png` | alternate: Obsidian tile, Ochre head. Loses its tile edge on Slack dark |
| `marge-telegram-avatar-512.svg`, `png/marge-telegram-avatar-512.png` | head at 54% so the square corner stays well inside Telegram's circle crop. Upload the square |
| `marge-icon-512.svg`, `png/marge-icon-512.png`, `png/marge-apple-touch-180.png` | web icon |
| `marge-icon-favicon-16.svg`, `marge-icon-favicon.svg` (32), `marge-icon-favicon-48.svg`, `png/marge-favicon-{16,32,48}.png`, `marge-favicon.ico` | favicon on a 16 grid: tile 16 (radius 3), head 12 at (2, 2), eyes 1 pixel at y 6, mouth 4 x 1 at y 10, Paper features. 32 and 48 are exact multiples |

Notes: Slack asks for a square PNG for the app icon (I recall 512 to 2000px; check the app config page). Display name **Marge**, description **DFS Lab team agent**, handle **@marge**. The Ochre tile was chosen because it keeps its edge on both Slack themes.

## 3. Colour roles
| Role | Token | Hex |
|---|---|---|
| Field of the avatar | Ochre | #C9963A |
| Head, ink | Obsidian | #14140F |
| Features on a dark head | Ochre | #C9963A |
| Reverse wordmark, small-cut features | Paper | #EBE8DE |
| The underscore, wordmark prefix only (never in the avatar: 1.3:1 on Ochre) | Sky | #5B8DC5 |

Ochre never sits directly on Paper (2.2:1); on Paper use `marge-mark.svg`.

## 4. Type and voice
She writes in the host font in Slack and Telegram. On pages we own: Space Grotesk for display, IBM Plex Sans for body, JetBrains Mono only for ids and quoted numbers. No mono caps (that is Molly's voice).
Voice: first person, short sentences, no emoji, no exclamation marks, no "as an AI". She says what she knows, how sure she is and where it came from. She keeps private things private and says so.
- First DM: "Hi, I'm Marge. I keep track of what DFS Lab is working on: the thesis, the portfolio, the meetings. Ask me anything about those in a channel. What you tell me in a DM stays between us, and I will tell you when I am answering from something private. First, link your account here: [link]"
- Unknown: "I don't have that. The last meeting I can see mentioning it is the Tuesday call, and it doesn't say. Want me to flag it for the next one?"
- Private answer: "That one comes from your DMs, so I'm answering here only with you. Want me to post it to the channel?"

## 5. Motion: the cursor talks (one idea)
Five states (`marge-expressions.svg`): neutral, blink, thinking, nod, smile. Idle: a blink every four to six seconds. Thinking: eyes glance up and right, the mouth blinks like a cursor at 1Hz. Answered: one nod, 160ms (head dips 5% and tilts 4 degrees). Thanked: the mouth bends into a smile for 1.5s, rarely. Slack and Telegram cannot animate an avatar, so this lives on marge.dfs.vc and in any web surface. Reduced motion: no auto-play.

## 6. Do and don't
Do: level mouth, eyes on one line (deadpan is the brand); the Ochre head with real holes on Obsidian; Ochre tile for Slack.
Don't: smile by default (it is for being thanked); put an Ochre head on Paper; flip the corner; dress her (brows, tears, hearts, emoji); give her a different mouth than the underscore; use Sky in the avatar.

## Implementation notes
Marge's repo has no product code yet. Slack app config: icon, name, description. Telegram bot: avatar. marge.dfs.vc: favicon, apple-touch, the wordmark in the header, motion states. No OG card was designed for Marge.

## Open decisions (recommendations)
1. A face at all: yes, Deadpan; if the team balks use concept C (beam bubble) and change nothing else.
2. Ochre tile or Obsidian tile: Ochre, with the dark alternate exported.
3. Dot's lineage (two dot eyes, she replaces Dot): leave it unmentioned publicly until Dot is retired.
4. Name display "Marge" alone (Slack shows the workspace anyway): yes.
5. Expression in Slack status: static; Slack has no API for avatar state.
6. 16px legibility (dot, dot, dash): check in a real tab. Fallback: the 12px head with 1px Paper features is already the favicon cut.
