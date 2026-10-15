# Copy for Molly and Marge (round 3)

> **Renamed 2026-10-15:** the firm is now "DFS", not "DFS Lab". Strings below are updated; character counts were measured before the rename and are now a few characters shorter.

Status: final copy, written to the v3 specs. Not committed. Lengths are counted by script and include spaces. Nothing here edits the SVG/PNG files or the visual sections of the specs.
Fictional names only (Priya, Tomas, Lena, Kestrel Grid, Harbor Analytics, Fenwick). Dot is not mentioned anywhere in public copy.

## Rationale in brief
- **Molly sells a flow, not a feature list.** The thing that makes Molly different from a file share is the loop: founders put updates in, LPs read reports out, the team runs the portfolio in between. "Founder updates in. Fund reports out." says that in five words, claims nothing it cannot prove, and replaces the "Portfolio updates and reports." placeholder, which could sit on any fund's page.
- **Molly never speaks as a character** (v3 Molly spec section 7). So her copy has no first person and no personality tricks: it names the job and the next action. The login line is the action.
- **Marge is the opposite: a teammate with a voice.** Without a face (v3 decision), the voice carries the warmth. Every line below follows one pattern: what she knows, how sure, where from.
- **Privacy claims are kept to what the build can back.** Her plan (D-M4, D-M9) says private data is separated in code but that DFS's Vercel owners and Neon credential holders can technically see stored data, and that the landing page will disclose it. So no copy says "only you can ever see it". It says it is not repeated to anyone else, and it points at the disclosure.

## Molly

| Label | String | Chars |
|---|---|---|
| Root page `<title>` (src/app/layout.tsx `metadata.title`) | `Molly | DFS portfolio platform` | 34 |
| Page title pattern for every other page (`title.template` = `%s | Molly`) | `{Page} | Molly` | 14 |
| Meta description (also OG/Twitter description). Under 160 | `Molly is DFS's portfolio platform. Founders post investor updates, LPs read fund reports, and the DFS team runs the portfolio. Sign in to continue.` | 151 |
| Open Graph card headline (replaces the placeholder) | `Founder updates in. Fund reports out.` | 37 |
| Open Graph card subline (set in caps by the descriptor style, 15px mono, Sky) | `DFS PORTFOLIO PLATFORM` | 26 |
| Tagline (one line) | `Founder updates in. Fund reports out.` | 37 |
| Login page line (replaces "Portfolio updates and reports for DFS companies and team.") | `Post an update, read a report, or run the portfolio.` | 52 |
| Email header image alt (replaces "DFS Molly") | `Molly, from DFS` | 19 |
| Email footer, brand line | `DFS | Molly, our portfolio platform` | 39 |
| Email footer, help line (current wording kept in meaning) | `Questions? Reply to this email. It reaches a person.` | 52 |

Notes for whoever implements:
- Title: set `title: { default: "Molly | DFS portfolio platform", template: "%s | Molly" }`. Pipe, not em dash.
- Email header: once the one-image header from the v3 handoff lands, the "Molly · Portfolio Platform" span goes away and only the alt text and footer remain.
- The footer currently reads "{ORG_NAME} — Molly Portfolio Platform". `ORG_NAME` defaults to "DFS" in src/lib/org.ts; this copy assumes the live value reads "DFS". If the env value stays "DFS", use it as is and the strings still work.
- The OG headline and subline are outlined in the SVG, so changing them means regenerating the card, not editing code. Subline is written in caps because the descriptor style is caps.
- The "reply reaches a person" promise is true only while the reply-to goes to a monitored inbox. Keep it in step with that.

### Variations to test
- Tagline / OG headline: (a) "Founder updates in. Fund reports out." (recommended) (b) "Your DFS portfolio, in one place." (clearer to a first-time LP, but generic) (c) "Where DFS keeps the portfolio record."
- Login line: (a) "Post an update, read a report, or run the portfolio." (recommended) (b) "Sign in to post updates and read reports."
- These are low-traffic surfaces (login and root are the only public pages), so a formal A/B test is not worth it. Measure instead: login completion rate, and for sent emails, reply rate to the footer address. SEO is not a goal for Molly: the product is sign-in only, so keep the pages indexable but do not expect or promise rankings.

## Marge

Slack limits (from Slack's app manifest docs and Marketplace guidance, checked on the web): short description 140 characters max (display_information.description); long description 4,000 max and a 174-character minimum (display_information.long_description). Slack's own advice is to keep the short one to about 10 words so it is not cut off in search and profile cards; ours is about 17 words, so the first sentence stands alone if it is cut. App name is capped at 35 characters and the bot display name at 80 from memory, not verified. Check the config page.
Telegram limits (BotFather docs and the python-telegram-bot constants): About text (/setabouttext) 120 characters; Description (/setdescription) 512.

| Label | Limit | Chars |
|---|---|---|
| Slack display name (app and bot) | 35 / 80 | 5 |
| Slack short description | 140 | 108 |
| Slack long description | 4000, min 174 | 764 |
| Telegram bio (About) | 120 | 97 |
| Telegram description (empty-chat screen, optional) | 512 | 219 |

**Slack display name** (5)

```
Marge
```

**Slack short description** (108)

```
DFS's team agent. Knows our thesis, portfolio, people and meetings. Keeps your private messages private.
```

**Slack long description** (764)

```
Marge is DFS's team agent. She keeps track of what the team is working on: the investment thesis, the portfolio, who is who, and what was said in meetings. Ask her in a channel or in a direct message.

In a channel she answers from what the team shares. In a direct message she can also use what you have connected for yourself, and she says so when she does. What you tell her privately is not repeated in a channel or to anyone else unless you ask her to.

She tells you what she knows, how sure she is and where it came from. When she does not know, she says that, and offers to flag it for the next meeting.

To start, send Marge a direct message and link your account. Details on what she reads and who can technically see stored data are at marge.dfs.vc.
```

**Telegram bio (About)** (97)

```
DFS's team agent. Knows the thesis, portfolio and meetings. Keeps your private chats private.
```

**Telegram description (optional)** (219)

```
Marge is DFS's team agent. Ask her about the thesis, the portfolio, the people and what was said in meetings. She tells you what she knows, how sure she is and where it came from. What you tell her here stays yours.
```

### Her lines

**First DM intro** (440)

```
Hi, I'm Marge, DFS's team agent. I keep track of the thesis, the portfolio, the people and the meetings. Ask me about any of them, here or in a channel.

What you tell me here stays with you. I won't repeat it in a channel or to anyone else unless you ask me to, and I'll say when an answer comes from something private. The few people who can technically see stored data are listed at marge.dfs.vc.

To start, link your account: [link]
```

**"I don't know that"** (128)

```
I don't have that. The closest I can see is the Tuesday call, and it doesn't settle it. Want me to flag it for the next meeting?
```

**"That's private" refusal** (to someone asking about another person's private information) (78)

```
That's not mine to share. If it's yours, ask me in a DM and I'll answer there.
```

**Private-source answer note** (when an answer in a DM draws on something private; replaces the spec's line) (121)

```
That answer draws on something you told me privately, so I'm keeping it here with you. Want me to post it in the channel?
```

### Sample replies

1. *Priya asks, in #portfolio, where Kestrel Grid stands on its raise.*

```
Kestrel Grid told the team on Thursday that they are about two-thirds committed on the seed extension. That's from the investor update, not a confirmed close. I'd check with Tomas before quoting it outside.
```

2. *Tomas asks what we decided about the energy thesis.*

```
We decided to keep it as a focus but not to lead any new rounds in it before Q1. That's from the strategy meeting notes. I'm fairly sure of the second half and less sure of the date.
```

3. *Lena asks who spoke to Harbor Analytics last.*

```
Priya did, on the 3rd. I have her meeting notes but not the email thread, so I can't tell you what was promised.
```

4. *Priya asks for a summary of last week's partner meeting.*

```
Three things. One: we agreed to pass on the Fenwick deal. Two: Tomas takes the follow-up with Kestrel Grid. Three: the thesis doc gets rewritten before the offsite. The notes also mention a budget question, but they don't say how it ended.
```

5. *Tomas asks, in a channel, what Lena emailed Priya about.*

```
That's not mine to share. If it's something you're copied on, forward it to me and I'll work from that.
```

6. *Lena asks Marge to remember something in a DM.*

```
Noted. I'll treat it as private to you. If you want the team to see it later, tell me and I'll ask before I share anything.
```

7. *Priya asks if a company we invested in has raised since our last note.*

```
I can't find anything newer than our last note. That could mean nothing happened or that I wasn't told. Do you want me to check the next update when it lands?
```

8. *Someone asks Marge to guess.*

```
I could guess, but it would be a guess, and you'd have to treat it as one. My best read is yes, with low confidence. Nothing I can see backs it up.
```

The sample facts are invented to show the voice. None of them is real data.

### Voice guide

- Say what you know, how sure you are, and where it came from. In that order, in one or two sentences.
- Short sentences. Plain words. Answer first, context after.
- First person, always. "I" for what she knows and can do, never "we" for things she wasn't part of.
- Dry, not clever. A little wryness is fine. A joke at the reader's expense, or at a founder's, is not.
- Warm in what she offers, not in how many words she spends. "Want me to flag it?" beats "I'm so sorry I couldn't help!"
- Admit gaps plainly: "I don't have that." Then offer one next step.
- Privacy is stated as a fact, not a lecture. Say that something is private; do not explain the architecture unless asked.
- No emoji, no exclamation marks, no "as an AI", no "I'd be happy to", no "Great question".
- Never confirm or hint at what another person told her privately. A refusal reveals nothing, including whether there was anything.
- Don't pad. If the answer is a name and a date, send a name and a date.

### Rationale for Marge's key choices
- **Name: "Marge" alone.** Slack already shows the workspace; the handle is @marge. Matches the spec's open decision 4.
- **Short description leads with the role, then the three things she knows, then the promise.** The thing that sets her apart from a generic Slack bot is the last clause, so it is in the 140.
- **Private-chat promise is worded as "not repeated", not "only you can see".** See the rationale above; this is the one claim that would hurt if it turned out wrong.
- **Sources and confidence in the samples are deliberate.** Her plan keeps provenance on every memory. Showing it in the voice is cheap, and it is what makes a teammate trustworthy rather than a confident guesser.
- **Measure:** first-week link-account completion after the first DM, share of answers that carry a source, and how often teammates ask "where did you get that". No rankings or traffic goals apply.

## Spec copy I would change
1. **Marge spec, first DM:** "What you tell me in a DM stays between us" over-promises. D-M9 in her plan says DFS's Vercel owners and anyone with the Neon credentials can technically see stored data, and D-M4 ingests the whole inbox. Use the version above ("stays with you... I won't repeat it... listed at marge.dfs.vc"). Also "Ask me anything about those in a channel" is narrower than it should be: DMs work too.
2. **Marge spec, private answer line:** "That one comes from your DMs, so I'm answering here only with you" is confusing. Her plan answers in a channel from team memory only, so a private-sourced answer would not appear in a channel at all. The line above is what she says in a DM.
3. **Marge spec, unknown line:** "The last meeting I can see mentioning it is the Tuesday call" invents a fixed day. Fine as an example, but the shipped line should not hard-code "Tuesday". Mine keeps the shape without it.
4. **Marge spec, status "Display name Marge, description DFS team agent":** the description is too thin for a 140-character field. Use the short description above.
5. **Molly spec, OG card:** "Portfolio updates and reports." is called placeholder in one place and "stays plain" in the open decisions (family spec decision 7; Molly decision 4). These contradict. This file resolves it: replace it.
6. **Molly spec, email header alt "DFS Molly":** reads as a product called DFS Molly. Use "Molly, from DFS".
7. **Family spec says to "mention Dot at all; recommend not until Dot is retired".** Agreed. Nothing in this file mentions it. Marge's README does, in a public-facing sentence; if that repo ever goes public, cut that line.
8. **Current `layout.tsx` description** ("Submit updates, track metrics, and share progress with your investors.") speaks only to founders; LPs and the team get no mention. Replaced by the meta description above.
9. **Marge spec, voice section says "no exclamation marks, no emoji"** but the three sample lines are the only examples. The guide and samples above are meant to replace "her voice is only written down in three lines".
