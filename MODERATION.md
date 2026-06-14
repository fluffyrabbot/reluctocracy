# Moderation-as-Curation — the Load-Bearing Open Problem

> The successor to the now-defused "permanent doubt" attack (see `THEORY.md` §4 M4,
> §5.5). M4's immutable record prevents *erasure* — but not *burial, ordering, or
> labeling.* A captured moderator never deletes; they shape what is surfaced, what
> is tagged "distortion," what sits at the top versus on entry 4,000. That is G6
> (the agenda-setter / `THEORY.md` §2) wearing the editor's hat, fused with the
> **attention problem**: an ever-growing dialectic is only legible if something
> surfaces and summarizes it, and that surfacing is power. This document does not
> *solve* it — nothing does (§5.1). It makes it **expensive and visible.**

---

## 0. The key move: "moderation" is not one power

Treating moderation as a single role is the vulnerability. It is five or six
distinct powers with different capture profiles. **Unbundle them** (separation of
powers, Montesquieu applied to curation) and each gets a different, weaker-to-
capture defense — and no single holder accumulates them all.

| Function | What it controls | Capture profile | Primary defense |
|---|---|---|---|
| **Surfacing / ranking** | what 99% of readers ever see | **most dangerous** — attention is the real power | Plural legible lenses (§1) |
| **Summarization** | the "state of the debate" everyone reads | representation power; the new AI vector | Adversarial + extractive (§4, §5) |
| **Labeling** | tagging "distortion," "ad hominem," "consensus" | epistemic-judgment power; most-abused on today's web | Label form, not truth (§2) |
| **Threading** | duplicates, canonical claim, reply structure | low stakes, mostly mechanical | Author-declared + contestable merge |
| **Admission / gatekeeping** | what is allowed in (spam, scarcity) | who gets to speak | Bright-line rules, sortition'd jury (§6) |
| **Norm enforcement** | adjudicating rule violations | classic moderation | Rule-of-law, logged + appealable (§6) |

The bottom three are old, largely-solved problems. The top three are the new and
dangerous ones, and §§1–5 below are mostly about them.

---

## 1. Plurality of legible lenses, never one authoritative feed

The single biggest departure from the web, and the strongest anti-capture move.

- **Do not ship "the top."** Ship *multiple* ranking lenses — chronological, by
  credence, by contestedness, by consensus-bridging (pol.is-style), by strongest-
  steelman — let the reader choose, and **show them which lens they are in.**
- **Capture now requires capturing *every* lens simultaneously**, and the reader
  can always switch. The web's core sin is the *monopoly* on salience; plurality
  dissolves it.
- **Legibility is mandatory.** Every lens must be explainable: a reader can see
  *why* something ranks where it does. Opacity is where capture hides; the opaque
  black-box feed is the enemy. Prefer simple, auditable ranking functions (e.g.
  pol.is's clustering is PCA over votes, not a black box) over engagement ML.

---

## 2. Label form, not truth

The most-abused moderation power on the current web is the **truth-verdict**
("false," "misleading"), because it smuggles in a worldview.

- **Reluctocracy renders no truth-verdict.** It binds a claim to its strongest
  rebuttal and surfaces a *posterior* (M4); the reader sees the contest, not a
  referee's ruling. Truth is handled by co-located rebuttal + credence, never by
  moderator fiat.
- **Procedural labels are allowed** (ad hominem, strawman, unsupported assertion,
  duplicate) — they are rule-bound and roughly objective. But each must **cite the
  rule and the evidence** in the structured M4 form, and be **contestable.** A
  label is an argument, not a decree.
- This removes the single worst capture vector *by design*: the system can be
  wrong about *form* (and corrected on the record), but it never claims the
  authority to declare *substance* true or false.

---

## 3. The recursion bottoms out: every curation act is a dialectic entry

The classic objection is infinite regress — *who moderates the moderators?* It
terminates not in a trusted authority but in **self-application**:

> A ranking weight, a summary, a label — each is itself attributed (pseudonymously),
> immutable, and **contestable via M4 / auditable via M3**, exactly like any other
> claim. The editor wears the hat *in public, on the record.*

The curation layer is subject to the contestability it administers, and capture-
cost compounds across every lens and panel. Consistent with §5.1: not *trustless*,
just *expensive and visible.*

---

## 4. Mechanize the mechanical; sortition the discretionary

- **Rule-bound work → open, auditable algorithm.** No human in the loop means no
  human to capture; the *algorithm* is the thing that is published and contested.
- **Judgment work → sortition'd, perishable, adversarial panel** (A1/B + M2):
  opposing summarizers who co-sign, or who publish **side-by-side red/blue
  summaries** — never one neutral-seeming voice. Panels are drawn fresh and their
  standing expires (B1/B2), so curation cannot become a career.

---

## 5. Extractive over abstractive (and the AI-summarizer vector)

- Where summary is unavoidable, **quote the corpus's strongest actual statements**
  rather than paraphrase. This cuts editorial latitude and lets the arguments
  speak for themselves — also the more honest default.
- **The AI-summarizer is a curator and must be treated as one.** In practice the
  obvious tool for compressing a huge thread is an LLM — which makes the
  *model + prompt* a salience authority. So summarizer models must be **open,
  plural, and their outputs contestable** like any other curation act (§3).
  Summaries are claims too: a disputed summary spawns its own dialectic.

---

## 6. The old, solved-ish layer (admission & enforcement)

Included for completeness; these are rule-of-law problems with known answers:

- **Bright-line, pre-published rules** — no discretionary "we know it when we see
  it." Scarcity/anti-flood enforcement (M4 guardrail #3) lives here.
- **Every enforcement action logged immutably and appealable.**
- **Contested cases → a sortition'd jury** — a fresh, perishable panel rules on
  whether a norm was violated (the common-law jury analog; *dokimasia* / *euthyna*
  applied to moderation, `LINEAGE.md` §1–2).

---

## 7. Honest residuals (where this still does not close)

Naming these is itself part of the grift-resistance (§5).

1. **The default-lens leak.** Plurality is powerful, but most people take the
   default. Whoever sets the *default lens* gets most of the power back. Best
   mitigation: make the default a *mechanical, neutral-ish* one (chronological or
   bridging) and make the default-choice itself a published, sortition-rotated,
   contestable decision — but "plurality with a default" still leaks power to the
   default-setter. This is how today's platforms *pretend* to offer choice while
   keeping the power; we must not repeat it accidentally.

2. **The watchdog-minority dependency.** Legibility and contestability only bite
   if *someone* reads the rebuttals and contests the labels. The system relies on
   an engaged minority to stay honest. Realistic, but a genuine dependency: if
   everyone reads only the default summary, capture of the summarizer is capture
   of the discourse.

3. **The AI-summarizer is hard to audit.** Model-level bias is subtler than a
   human editorial choice. Open + plural + contestable mitigates; it does not fully
   close.

---

## 8. Net posture

Moderation-as-curation goes from *fatal unsolved hole* to **G6 made expensive and
visible, with two named leaks (default-lens, watchdog-minority).** Same honest
posture as everywhere else in the theory — not solved, but costed, with the
residuals named rather than hidden.

> Unbundle the powers; offer plural legible lenses instead of one feed; label form
> but never truth; make every curation act a contestable entry on the record;
> mechanize what is rule-bound and sortition the rest; quote rather than paraphrase.
> The curator can still steer at the margin — but only in public, at rising cost,
> against a reader who can switch lenses and contest the label.
