# Aggregation & Credence — the Judgment Math

> Fills the keystone `PROTOCOL.md` deferred to (§5): how a `Judgment` is computed.
> Two distinct functions get conflated under "the math," and they need separate
> treatment:
>
> - **(A) Judgment aggregation** — how the drafted panel's individual views combine
>   into the output (phase 6 SYNTHESIZE).
> - **(B) The live credence** — the M4 capture-probability `P(captured | evidence)`
>   attached to that output and updated forever after.
>
> Both ship inside the `Judgment`. The pleasing result of §2: the `SuspicionClaim`
> schema we already designed *is* the elicitation form for (B)'s Bayesian update.

---

## 1. Judgment aggregation

### 1a. What is being aggregated
Per M2, experts supply the **option-space** (≥2 options, no recommendation), and
the panel decides *values over it*. So aggregation runs over a **given, bounded
option set**, plus free-text statements panelists author during the dialectic.

### 1b. Two-shot capture: independent T0, deliberated T1
To honour Condorcet independence (`LINEAGE.md` §3 — aggregation is only wise if
judgments are independent), collect judgments **twice**:

- **T0** — independent priors, recorded *before* discussion. Preserves independence.
- **T1** — informed judgments, recorded *after* the dialectic.

Report both. The **T0→T1 shift is itself first-class data** — and feeds (B): a
sincere panel shows diverse, idiosyncratic movement; a coordinated bloc shows
*synchronized* shifts or *pre-committed* non-movement. The delta is evidence.

### 1c. The rule — bridging-consensus first, decision second
- **Primary output = bridging-consensus surfacing** (pol.is-style, `LINEAGE.md`
  §3): for each option/statement, report support **and its cross-stratum /
  cross-cluster agreement**. The headline is *"what commands broad agreement across
  divides,"* never *"what a bare 51% wanted."* This directly implements the anti-
  faction, anti-polarization goal and surfaces dissent natively.
- **When a single decision is required**, run a **Condorcet method (ranked pairs /
  Schulze)** over the T0 *and* T1 rankings. Condorcet-consistent (aligns with the
  Jury Theorem), clone-resistant, resolves cycles, and harder to manipulate than
  plurality.
- **For resource / intensity tradeoffs**, offer **Quadratic Voting** as the
  intensity layer. QV's usual fatal flaw is whales and collusion — but a
  **sortition panel with equal credits and anonymized, non-transferable standing
  removes the concentration QV is vulnerable to**, so sortition+QV is a genuinely
  better pairing here than QV in the open.

### 1d. Never collapse to a bare winner
The `Judgment` ships the decision (if one was needed) **plus** the full support
distribution, the cross-stratum agreement map, and the `live_dissent[]`. Collapsing
to a single verdict is prohibited (extends INV-10). A considered judgment that
hides its own dissent is not a considered judgment.

### 1e. Manipulation — costly and visible, not impossible
Gibbard–Satterthwaite is honest law: for ≥3 options, no non-dictatorial rule is
strategy-proof. We therefore **do not claim strategy-proofness.** The defenses are
the usual posture — make manipulation costly and visible:
1. Condorcet methods are harder to game than plurality in practice.
2. Independent T0 judgments reduce coordination opportunity.
3. Equal-weight, anonymized panel removes the concentration that makes gaming pay.
4. The credence layer (§2) surfaces the statistical fingerprint of coordination.

---

## 2. The live credence — `P(captured | evidence)`

### 2a. The quantity and its form
A posterior probability that the judgment is the product of coordinated capture.
Update in **log-odds**, which makes evidence additive:

```
  logit P(C | E)  =  logit P(C)  +  Σ_i  log LR_i
```

where each evidence item `i` contributes a log-**likelihood-ratio**
`log [ P(E_i | C) / P(E_i | ¬C) ]`. Output is a **probability with an uncertainty
band** (it is an estimate of an estimate), never a binary verdict.

### 2b. The `SuspicionClaim` *is* the LR elicitation form
Recall its schema: `predict_if_true`, `predict_if_false`, `evidence_for`,
`evidence_against`, `credence`. That is **exactly** `P(E|C)`, `P(E|¬C)`, and the
evidence to weigh — i.e. a structured likelihood ratio. The credence update is the
**product of LRs (sum of log-LRs) over admitted, surviving suspicion-evidence.**
M4's structured form was, in hindsight, designed to be Bayes-update inputs.

### 2c. The observable signals (the `E_i`)
Capture must leave a statistical fingerprint even when ties are hidden (the Off-
Graph Entryist). Candidate signals, each yielding an LR:

1. **Position-clustering anomaly** — a subset whose judgment vectors are more
   correlated than the null model predicts. (Their *positions* cluster even when
   their *vouching ties* don't.)
2. **T0→T1 shift synchrony** — coordinated actors move in lockstep or are pre-
   committed (no movement). Low shift-entropy ⇒ evidence for C.
3. **Stratum-vs-position decorrelation** — the entryist *deliberately* spreads
   across strata (to evade A4 §5a) yet shares positions. **Position-similarity
   despite stratum-dissimilarity is a capture signature.**
4. **Provenance anomalies** (from `Euthyna`) — undisclosed interests, briefing
   imbalance.
5. **Surviving suspicion-claims** — structured `SuspicionClaim`s not rebutted,
   weighted by their own credence.

### 2d. Combine carefully — the independence caveat
Naïve Bayes assumes conditional independence of the `E_i`. These signals **are
correlated** (clustering and shift-synchrony overlap). So either model the
covariance or discount for it — **do not double-count.** Stated honestly because
the failure mode (over-confident posteriors from correlated evidence) is real.

### 2e. Gaming the detector — and why it backfires (Goodhart, §5.3)
Once the signals are known, a sophisticated faction optimizes to *not* trip them:
add noise to positions, desynchronize shifts. The defense is twofold:
1. **Plural, rotating feature sets** (metric plurality, `THEORY.md` §5.3) so no
   single gameable target dominates.
2. **The elegant part:** to look uncorrelated, the faction must *actually vote less
   correlatedly* — which **dilutes the very capture they sought.** The detector
   need not be unbeatable; beating it requires behaving like non-colluders, which
   defeats the purpose. Negative expected value again (`THEORY.md` §0).

### 2f. The prior is a trust root
`P(C)` (the base rate of capture attempts) and the feature weights are a trust
root (`THEORY.md` §5.1). Mitigation, not elimination: keep them **public and
plural** (multiple credence models run; report the range), and **sensitivity-test**
— if the conclusion flips under reasonable prior ranges, the judgment is flagged
fragile. The credence model is itself a `CurationAct`: open, attributed, and
contestable (`MODERATION.md` §3).

---

## 3. What ships in the `Judgment`

```
  Judgment {
    decision?            // present only if a single choice was required
    support_distribution // full, per option/statement
    bridging_map         // cross-stratum / cross-cluster agreement (the headline)
    live_dissent[]       // never elided (INV-10, §1d)
    credence C(t)        // P(captured|E) as a range, updated forever (resolve-and-ship)
    provenance           // PoolEpoch, beacon, briefings, log hash, methods (M3)
  }
```

Per M4 #4 (resolve-and-ship-with-a-credence): the judgment publishes at `C(t0)`;
the always-on contest layer keeps updating `C(t)` as new evidence/suspicion
arrives, recorded as a **time series** on the immutable log. Never "settled,"
always current-best-estimate.

---

## 4. Invariants added (extending `PROTOCOL.md` §4)

| # | Invariant | Enforces |
|---|---|---|
| INV-12 | Judgments are collected two-shot (independent T0, deliberated T1); both recorded | Condorcet independence |
| INV-13 | No `Judgment` collapses to a bare winner; distribution + bridging map + dissent always shipped | §1d, M4 #4 |
| INV-14 | Credence ships as a **range**, not a point, and as a time series `C(t)` | §2a, M4 #4 |
| INV-15 | The credence model (features, weights, prior) is open, plural, and contestable | MODERATION §3, §2f |
| INV-16 | Credence evidence is not double-counted across correlated signals | §2d |

---

## 5. Honest residuals / still out of scope

- **LR calibration needs real data.** The numeric `P(E_i|C)` / `P(E_i|¬C)` cannot
  be set a priori; they require observed runs (or simulation) to calibrate. v0
  ships the *structure*, not the constants.
- **Correlated-evidence modeling** (§2d) is specified as a requirement, not solved
  — proper covariance modeling of the signals is deferred.
- **Choice of Condorcet variant** (ranked pairs vs. Schulze) and the **QV credit
  budget** are left open; both are defensible, the difference is second-order.
- **The prior trust root** (§2f) remains irreducible per `THEORY.md` §5.1.

---

## 6. In one paragraph

> Aggregate two-shot — independent priors then deliberated judgments — so the
> Condorcet independence that makes a crowd wise is preserved, and report bridging
> consensus across divides rather than a bare majority, never eliding dissent. When
> a single decision is forced, use a Condorcet method, with quadratic voting for
> intensity tradeoffs (safe here because sortition gives equal, non-transferable
> credits). Attach a live capture-posterior computed in log-odds, where each
> structured `SuspicionClaim` supplies a likelihood ratio and the observable
> signals are the statistical fingerprints of coordination — position clustering,
> synchronized T0→T1 shifts, and position-similarity-despite-stratum-dissimilarity
> — combined without double-counting, evaded only by behaving like non-colluders
> (which dilutes the capture), shipped as a contestable range that updates forever.
