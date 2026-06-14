# Lineage — Prior Statecraft & Political Thought That Carries Over

> Reluctocracy's hard problems were partly *solved centuries ago, then forgotten.*
> This document maps extant political thought and well-documented statecraft onto
> the design (`THEORY.md`, `A4-NOMINATION.md`), noting for each: **the idea**,
> **what it adds**, and **how it rearchitects to digital form.** It also records
> the failure modes we must keep rebutting.

---

## 1. Anti-capture selection machinery → hardens A1 / A4

### The Venetian Doge election (1268)
- **Idea:** A ten-stage process *alternating lottery and election* — 30 by lot →
  9 by lot → those 9 elect 40 → 12 by lot → … for ten rounds.
- **Adds:** A deliberate anti-faction algorithm. No cabal can predict or control
  enough stages to fix the result; bribery's target keeps moving.
- **Digital:** Alternate sortition and election rounds so the attack surface is
  non-stationary. Capture cost compounds across stages.

### Florentine *borse* + Athenian *dokimasia*
- **Idea:** Florence drew offices by lot from vetted-eligible names in leather
  bags (*imborsazione*). Athens vetted office-holders *before* service
  (**dokimasia**).
- **Adds:** The formal **pre-vetting gate** in front of the lottery pool — a piece
  A4 implied but never specified.
- **Digital:** A pre-vetting predicate on pool entry, computed over the vouching
  graph + minimal attestations, not by a central committee.

### BrightID / Proof of Humanity / Gitcoin Passport
- **Idea:** Running, real-world implementations of social-graph Sybil resistance.
- **Adds:** Prior art (and documented failure cases) for A4 — study before
  reinventing.
- **Digital:** Already digital; these are candidate substrates / cautionary
  reference implementations.

---

## 2. The structurally-protected critic + accountability for proposers → our G6 answer

*The deepest cluster: it attacks the agenda-setter problem (G6) that the rest of
the theory leaves under-defended. See `THEORY.md` §3a (the accountability layer).*

### Athenian *graphe paranomon*
- **Idea:** You could be *prosecuted for proposing an illegal/bad decree* — even
  after the assembly passed it. Liability attached to the **proposer**.
- **Adds:** Accountability for whoever *sets an agenda item*, not just whoever
  votes. The first real handle on G6.
- **Digital:** Every agenda item / framing has a signed, attributed proposer and a
  challenge window in which the proposal (not just the proposer) can be contested.

### The Chinese Censorate (御史台 / 都察院) and remonstrance officials (谏官)
- **Idea:** An independent branch whose sole job was to audit, impeach, and
  *criticize the ruler*, with structural protection for doing so.
- **Adds:** A standing, protected adversary — M2's "adversarial expert"
  generalized into a permanent institution. **Loyal opposition baked into the
  architecture** rather than hoped for.
- **Digital:** A sortition-staffed, protected "censor" role with a mandate and
  immunity to challenge framings, expert selection, and the seed set (§7 of A4).

### Haudenosaunee clan mothers (Great Law of Peace)
- **Idea:** Clan mothers *nominated* the sachems and could *depose* them, while
  not holding the office themselves.
- **Adds:** Clean **separation of nomination-power from office-holding**, plus a
  **recall** mechanism — both sharpen B1/B2 perishability.
- **Digital:** The nominating body and the served role are distinct populations;
  recall is a first-class, always-available action, not an exception.

---

## 3. Deliberation & aggregation that resists polarization → the synthesis layer

### Condorcet Jury Theorem
- **Idea:** If jurors are each better-than-chance **and independent**, majority
  accuracy → 1 as the group grows.
- **Adds:** Formal justification for A4's correlation-de-weighting. A coordinated
  faction doesn't merely stuff the pool — it **destroys the statistical
  independence that makes aggregation wise.** Anti-coordination is therefore an
  *epistemic* requirement, not just an anti-capture one.
- **Digital:** The draw and the aggregation must both preserve independence:
  de-weight correlated clusters (A4 §5b) *and* avoid information cascades during
  deliberation (e.g. independent judgments before discussion).

### pol.is / vTaiwan (Audrey Tang)
- **Idea:** Clusters participants by opinion and surfaces the statements that
  **bridge clusters**, deliberately de-weighting divisive takes. Done at national
  scale (Taiwan's Uber regulation).
- **Adds:** A working digital form of "synthesize takes into a considered judgment
  *without amplifying hot takes*."
- **Digital:** Near-direct reference architecture for the synthesis stage —
  consensus-statement surfacing rather than engagement-ranked feeds.

### Iris Marion Young — critique of deliberative democracy
- **Idea:** "Rational deliberation" quietly privileges the dispassionate,
  educated, articulate speaker; admit greeting, narrative, and rhetoric as
  legitimate modes.
- **Adds:** Inoculation against re-selecting the articulate elite we're trying to
  bypass. If eloquence is the entry fee, the genuinely wise-but-inarticulate
  never surface.
- **Digital:** Multiple input modalities (story, testimony, not just argument);
  facilitation that translates rather than filters.

---

## 4. The most empirically validated institutional design → Ostrom

### Elinor Ostrom — 8 design principles for governing the commons (Nobel 2009)
- **Idea:** Principles derived from real self-governing institutions that *lasted
  centuries.*
- **Adds:** Evidence about *what actually survives*, not normative aspiration.
  Near one-to-one mapping:

  | Ostrom principle | Reluctocracy mechanism |
  |---|---|
  | Graduated sanctions | Staked-vouching slashing (A4 §4) |
  | Nested enterprises (polycentricity) | Federated / stratified pools (A4 §5a) |
  | Monitoring by participants themselves | Community-internal accountability |
  | Clear boundaries + congruence w/ local conditions | Subsidiarity in pool design |
  | Collective-choice arrangements | Those affected help write the rules |
  | Conflict-resolution mechanisms | Cheap, local dispute channels |

- **Digital:** Use the table as a design checklist; any layer that violates an
  Ostrom principle is a predicted failure point.

---

## 5. Cleaner values/facts split → sharpens M2

### Futarchy (Robin Hanson) — "vote on values, bet on beliefs"
- **Idea:** Democracy sets the *objective*; prediction markets estimate *which
  policy achieves it*.
- **Adds:** A sharper M2 — cleanly separates the **value question** (legitimately
  democratic) from the **empirical question** (where aggregated belief, not
  authority, should rule).
- **Digital:** The drafted body ratifies the objective function; a forecasting /
  evidence layer estimates which option meets it. Experts frame; markets/forecasts
  estimate; the drafted choose values.

### Rawls — veil of ignorance
- **Idea:** Choose rules without knowing which role you'll occupy.
- **Adds:** Both a **design test** (would we accept these rules blind to our
  position?) and a **deliberation technique**.
- **Digital:** Bake a "veil" framing into both the constitution and individual
  deliberations.

---

## 6. Failure modes to keep rebutting (write them down so we don't rebuild them)

### Michels' Iron Law of Oligarchy
- *Every* organization, even radically democratic ones, drifts toward rule by a
  small elite. This is G6 stated as an empirical law. B2 perishability is a
  partial answer; treat Michels as the adversary we must *continuously* rebut, not
  fix once.

### Liquid democracy's super-delegates
- LiquidFeedback / Pirate Party experiments showed delegated votes **concentrate**
  on a few popular delegates, recreating an elite. A documented violation of our
  non-accumulation rule — proof that delegation *without decay* re-grows oligarchy.

### DAO / token-voting plutocracy
- On-chain governance mostly collapsed into "most tokens wins." Cautionary: anti-
  Sybil-*by-stake* quietly becomes anti-poor-*by-design*. Our Sybil resistance must
  be graph/personhood-based (A4), never wealth-based.

---

## 7. Honorable mentions (lower priority, still load-bearing if scaled)

- **Swiss collegial executive (Federal Council, "magic formula," rotating
  presidency) + Landsgemeinde** — de-personalized executive power; open assembly.
- **Estonia e-governance (X-Road, once-only, transparency-of-access)** — citizens
  see *who accessed their data*; maps to M3 auditability and A4 data-minimization.
- **Roman Republic (collegiality, the tribunate's *intercessio*, time-boxed
  dictatorship)** — mutual veto and the Cincinnatus pattern of power laid down.
- **Decidim (Barcelona) / Consul** — open-source participatory-democracy platforms;
  reference deployments for the public-facing layer.
