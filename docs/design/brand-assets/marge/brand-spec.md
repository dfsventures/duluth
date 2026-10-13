# Marge brand kit

Status: proposal, not committed. Preview of both kits: https://claude.ai/artifact/QiNs61skWkvzaDLxs5yGMQ
Marge's repo is untouched. Molly's kit is in `../brand-spec.md`.

## Concept
Marge is a teammate, so she is a person-shaped mark, not a letter. A speech bubble with one square corner (the DFS corner, bottom-left, where the DFS bar sits). Inside: the DFS bar as the message, an ochre dot as presence. Rounded where Molly is square, so the two are never confused, but the bar and the corner tie her to DFS. She does not reuse the letter M, which belongs to Molly.

## 1. Logo
| File | Use |
|---|---|
| marge-mark.svg | Tuareg bubble, Paper bar, Ochre dot, for light grounds |
| marge-mark-reverse.svg | Paper bubble, Obsidian bar, Ochre dot, for Obsidian |
| marge-wordmark.svg | "Marge", Space Grotesk 600, sentence case, outlined |
| marge-lockup.svg / -reverse.svg | Bubble + wordmark, cap height = 62% of bubble height, optically centred |

- **Clear space:** 25% of bubble height on all sides.
- **Minimum size:** mark 16px, lockup 88px wide.
- Geometry (100u box): bubble radius 50 on three corners, 0 on bottom-left; bar 34x14 at (21,43); dot r8 at (72,50).

## 2. Icon set
Sky tile, Obsidian bubble at 56% of the tile, Paper bar, Ochre dot. Chosen so the tile carries its own edge and she is never mistaken for Molly (Obsidian tile).
- `marge-icon-favicon.svg` (32), `png/marge-favicon-{16,32,48}.png`, `marge-favicon.ico`, `png/marge-apple-touch-180.png`, `png/marge-icon-512.png`, `marge-icon-512.svg`.
- Note: the avatar and icon use an Obsidian bubble on Sky, while the standalone mark uses Tuareg. This is deliberate: Sky is the field, so the bubble must go dark to be legible.

## 3. Avatars
- **Slack bot avatar:** `marge-slack-avatar-512.svg`, `png/marge-slack-avatar-512.png`. Full-bleed 512 (Slack rounds it itself); bubble is 59% of the tile. Verified legible at 36px and 20px on Slack light (#FFFFFF) and Slack dark (#1A1D21): the bar and dot survive at 20px (bar about 2.7px tall, dot about 2px).
- **Telegram:** `marge-telegram-avatar-512.svg`, `png/marge-telegram-avatar-512.png`. Same art with the bubble at 47% so the tail corner stays inside the circle crop. Telegram crops the square, so upload as is.

## 4. Colour roles
| Role | Token | Hex |
|---|---|---|
| Mark on light | Tuareg | #3A5876 |
| Avatar and icon field | Sky | #5B8DC5 |
| Presence dot, her signature | Ochre | #C9963A |
| Wordmark, bubble on Sky | Obsidian | #14140F |
| The bar, reverse bubble | Paper | #EBE8DE |

Marge is the warm sibling. Ochre is hers: it never appears in Molly's marks. The dot is always ochre, on every ground.

## Typography usage
Space Grotesk 600 for the wordmark and her name wherever we own the display, sentence case, no tracking. IBM Plex Sans on pages we own. In Slack and Telegram she writes in the host font. JetBrains Mono only for ids, file names, numbers she quotes. No mono caps (that is Molly's voice).

## 5. Voice note
Marge is a teammate: plain, direct, a little dry. First person, short sentences, no emoji, no exclamation marks, no "as an AI". She says what she knows, how sure she is, and where it came from. She keeps private things private and says so.

- **Display name:** Marge. **Title / bot description:** DFS Lab team agent. **Handle:** @marge.
- **Intro (first DM):** "Hi, I'm Marge. I keep track of what DFS Lab is working on: the thesis, the portfolio, the meetings. Ask me anything about those in a channel. What you tell me in a DM stays between us, and I will tell you when I am answering from something private. First, link your account here: [link]"
- **Unknown:** "I don't have that. The last meeting I can see mentioning it is the Tuesday call, and it doesn't say. Want me to flag it for the next one?"
- **Private answer:** "That one comes from your DMs, so I'm answering here only with you. Want me to post it to the channel?"

## 6. Do and don't
Do: tail corner bottom-left; ochre dot always; Sky tile for avatars; reverse on Obsidian.
Don't: flip the tail, recolour the dot, swap to a plain circle, use ochre as the field, put the Molly M in the bubble, give her emoji or a face.

## Open decisions (recommendations)
1. **Persona art.** Abstract bubble (this proposal, recommended: scales to 20px, no uncanny face) vs an illustrated character. Recommend the bubble; revisit only if the team wants personality in marketing.
2. **Name display.** "Marge" alone vs "Marge (DFS Lab)". Recommend "Marge" with the bot description carrying "DFS Lab team agent", since Slack shows the workspace anyway.
3. **Dot as status.** The ochre dot could animate or change (idle vs working) in Slack status. Recommend static in Slack (no API for it); consider a typing-style pulse only on the marge.dfs.vc page.
4. **Dot at 16px.** The dot is 2px at 16; confirm in a real tab. Fallback: enlarge the dot to r10 in the 16px cut.
5. **Dot ochre vs team colour.** If a later user-visible status (e.g. "in a private thread") is wanted, reserve Laterite for it rather than recolouring the dot.
6. **Dot's relation to Dot.** She succeeds the assistant "Dot". The ochre dot is a quiet nod; recommend not mentioning it publicly or giving it a name, to avoid confusion during the overlap while both run.
