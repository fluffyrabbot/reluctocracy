# Reluctocracy Protocol Specification — v0

> Turns the irreducible core (`THEORY.md` §6) into an implementable design: the
> data model, the deliberation lifecycle, the compute/trust boundary (who computes
> what), and the invariants each protocol element must preserve. This is **v0:
> theory-complete, not cryptography-complete** — it names the primitives it relies
> on (ZK group membership, a public random beacon, a transparency log) without
> specifying their internals. Every element is cross-referenced to the theory
> clause it enforces, so nothing from the design is silently dropped.

---

## 0. Substrate: an append-only signed event log

Everything is an **immutable, signed, content-addressed event** appended to a
transparency log (Merkle-chained, tamper-evident). **All state is a deterministic
projection over the log** — pool membership, credences, rankings, standing are
*computed*, never stored as authoritative mutable rows.

Why this substrate:
- **Immutability (`THEORY.md` §1c)** and **auditable provenance (M3)** are now
  structural, not features to be added: the log *is* the provenance trail, and
  nothing can be erased — only superseded by a later, equally-immutable event.
- **Recomputability** — anyone can replay the log and reproduce every pool, draw,
  and credence, which is what makes the trust roots *auditable* rather than
  trusted (§5).
- It cleanly separates **definitional events** (what happened) from **operational
  projections** (the current view) — the Ross definitional/operational split.

---

## 1. Data model — the event types

### 1a. Identity & trust graph
| Event | Key fields | Enforces |
|---|---|---|
| `Identity` | pubkey; stable pseudonym; *no real-world identity* | B3, A4 (surveillance-free) |
| `Attestation` | community_id; ZK proof "one unique member of C"; not *which* member | A4 §6 (one-bit, ZK) |
| `Vouch` | from→to; stake; issued_at; **expires_at**; signature | A4 §4 (scarce, staked, decaying) |
| `Slash` | target_voucher; cause (flagged cluster); capacity_delta | A4 §4 (accountable vouching) |

### 1b. Pool & selection
| Event | Key fields | Enforces |
|---|---|---|
| `Stratum` | identity; tag (geo/community/demographic) from attestations | A4 §5a (stratification) |
| `PoolEpoch` | window; **seed_set used**; propagation params; → {identity, trust_rank, strata} | A4 §3, §7 |
| `RandomBeacon` | round; verifiable randomness (drand/VDF/commit-reveal) | A1 (trustless lottery) |
| `Draw` | PoolEpoch_ref; beacon_round; diversity constraints; → selected panel | A1, A4 §5b |

### 1c. Deliberation & dialectic
| Event | Key fields | Enforces |
|---|---|---|
| `AgendaItem` | **proposer (attributed)**; framing; challenge_window | C3, M1 (proposer liable) |
| `Deliberation` | agenda_ref; panel_ref; expert_refs; lifecycle_state | — |
| `Briefing` | author (expert); **side (red/blue)**; funding_disclosure; **options[] (≥2), no recommendation** | M2 |
| `Claim` | author + role∈{panelist,expert,public,curator}; content; type | §1c |
| `Rebuttal` | targets claim_ref; content | INV-6 co-location |
| `SuspicionClaim` | target; predict_if_true; predict_if_false; evidence_for[]; evidence_against[]; credence | M4 + 5 guardrails |
| `Credence` | target_ref; posterior; basis | M4 #4 (live posterior) |

### 1d. Curation
| Event | Key fields | Enforces |
|---|---|---|
| `Lens` | id; **declarative ranking function** (auditable) | MODERATION §1 |
| `CurationAct` | author; type∈{rank_weight, summary, **procedural_label**}; cited_rule; target_ref | MODERATION §2,§3 |
| `Summary` | panel_ref (red/blue); **extractive quotes preferred**; contestable=true | MODERATION §4,§5 |

> **Schema-level prohibition:** there is *no* `TruthVerdict` event type. The system
> cannot, by construction, label a claim "false." Truth is handled only by
> co-located rebuttal + `Credence`. (MODERATION §2 / INV-9.)

### 1e. Output & accountability
| Event | Key fields | Enforces |
|---|---|---|
| `Dokimasia` | candidate_ref; vetting-predicate result | C1 |
| `Judgment` | deliberation_ref; **anonymized aggregate**; **attached credence**; live_dissent[] | B3, M4 #4 |
| `Provenance` | PoolEpoch_ref; beacon_round; briefing_refs; deliberation_log_hash; aggregation_method | M3 |
| `Euthyna` | deliberation_ref; audit findings (process-followed? interests-disclosed?) | C2 |

---

## 2. Roles & the compute / trust boundary

The central design discipline (MODERATION §4): **mechanize the rule-bound;
sortition the discretionary; cryptographically root what must be trustless; and
explicitly name the few irreducible trust roots.**

| Layer | What it does | Capture defense |
|---|---|---|
| **Mechanical / algorithmic** (open, anyone recomputes from the log) | trust propagation → `PoolEpoch`; the `Draw`; `Lens` ranking; `Credence` aggregation; `Slash` computation; dedup suggestions | no human discretion → nothing to capture; recomputable |
| **Cryptographic primitives** | `Identity` signatures; ZK group-membership (`Attestation`); public `RandomBeacon`; Merkle transparency log | math, not authority |
| **Sortition'd human panels** (perishable, adversarial) | deliberators (decide values); contested-label juries; red/blue `Summary` panels; rotating M1 agenda control | A1 + B1/B2 + M2 |
| **Adversarial experts** | `Briefing` (frame options, may not recommend) | M2 |
| **Bootstrapped trust roots** (irreducible, §5) | seed sets; community attestation authorities; the beacon | plural, public, rotated, **audited for stability** |

---

## 3. Lifecycle — the deliberation state machine

```
  [standing infra, continuous]
     Identity / Vouch / Slash  ─►  PoolEpoch (recomputed each window)
                                   RandomBeacon (continuous)

  per deliberation:
   1 PROPOSE    AgendaItem + challenge window           (C3)
   2 FRAME      red/blue Briefings, funding disclosed,   (M2)
                options-not-recommendations enforced
   3 DRAW       beacon + PoolEpoch + diversity → panel   (A1, verifiable)
   4 DOKIMASIA  panelists pass vetting predicate;        (C1, A2/A3)
                acceptance-of-burden reveals reluctance
   5 DELIBERATE structured dialectic: Claims/Rebuttals/  (§1c, M4,
                Evidence/SuspicionClaims; independent      Condorcet
                judgments BEFORE discussion; time-boxed;    independence)
                plural lenses; co-location enforced
   6 SYNTHESIZE aggregate → Judgment (anonymized),       (B3, M4 #4)
                with credence + live dissent; method fixed
   7 PUBLISH    Judgment + full Provenance;              (M3, B1/B2)
                ►► standing EXPIRES here ◄◄
   8 EUTHYNA    post-hoc audit of process & disclosures  (C2)

  [always-on] CONTEST: M4 contestability continues against the published
              Judgment; credence may move; the record only grows.
```

The dialectic (phase 5) and the contestability layer (always-on) admit **public**
authors, not only panelists — but **only panelist judgments aggregate into the
`Judgment`** (phase 6). Public claims are visible, contestable, and can raise
`SuspicionClaim`s or trigger `Euthyna`, but do not vote. This preserves "the
drafted decide" (M2) while keeping the surrounding civic discourse open (North
Star).

---

## 4. Invariants (and the theory clause each enforces)

A conformant implementation must hold all of these; each is checkable against the
log.

| # | Invariant | Enforces |
|---|---|---|
| INV-1 | Any `Judgment`'s panel is recomputable from (`PoolEpoch`, `RandomBeacon`) | A1, M3 |
| INV-2 | Expected panel share = pool trust share (no leverage) | A1, A4 |
| INV-3 | No identity accrues durable cross-deliberation authority; standing is single-use & non-transferable | B1, B2 |
| INV-4 | `Judgment` carries no panelist attribution | B3 |
| INV-5 | Append-only: no event mutated/deleted; state is a projection | §1c, M3 |
| INV-6 | A claim cannot be rendered without its strongest rebuttal | §1c |
| INV-7 | Every `AgendaItem` and `CurationAct` is attributed and contestable | C3, MODERATION §3 |
| INV-8 | Every `Briefing` exposes ≥2 options and no expert verdict | M2 |
| INV-9 | No `TruthVerdict` exists in the schema; only procedural labels w/ cited rule | MODERATION §2 |
| INV-10 | Every `Judgment` ships with a posterior + dissent; none ships as "settled" | M4 #4 |
| INV-11 | Pool is stable across independent seed sets (sensitivity check) or the result is flagged untrustworthy | §5.1, A4 §7 |

---

## 5. Trust roots & what stays unsolved (honest scoping)

**Irreducible trust roots** (cannot be made trustless, only plural + public +
rotated + stability-audited — `THEORY.md` §5.1, A4 §7):
1. The **seed set** for trust propagation.
2. The **community attestation authorities** that issue membership bits.
3. The **random beacon**.

INV-11's sensitivity check is the operational discipline: recompute pools and draws
under independent roots; instability ⇒ the output is flagged, not trusted.

The aggregation and `Credence` math is now specified in `AGGREGATION.md`
(two-shot Condorcet-independent aggregation with bridging-consensus surfacing; the
live capture-posterior in log-odds, with the `SuspicionClaim` as its likelihood-
ratio elicitation form), which adds INV-12..16.

**Explicitly out of scope for v0** (deferred, not denied):
- The concrete ZK group-membership scheme and the trust-propagation algorithm's
  exact parameters (A4 §6 names the requirement; the cryptographic engineering is
  its own project).
- The numeric LR calibration constants and correlated-evidence covariance modeling
  for the credence (`AGGREGATION.md` §5 — structure shipped, constants need data).
- The two named moderation residuals — the **default-lens leak** and the
  **watchdog-minority dependency** (MODERATION §7) — remain open under this spec.
- All UI/UX and the public-facing layer.

---

## 6. The protocol in one paragraph

> An append-only signed log holds every event; all state is a projection over it,
> so immutability and provenance are structural. Pseudonymous `Identity`s vouch in
> a scarce, staked, decaying graph; a mechanical projection yields a `PoolEpoch`; a
> public `RandomBeacon` plus diversity constraints `Draw`s a panel that anyone can
> recompute. A liable proposer opens an `AgendaItem`; adversarial experts `Brief`
> the option-space without recommending; the drafted panel passes `Dokimasia`,
> then deliberates a structured, co-located, plural-lens dialectic carrying a live
> `Credence`; synthesis emits an anonymized `Judgment` shipped *with* its posterior
> and dissent, plus full `Provenance`; standing expires at publication; `Euthyna`
> audits the run; and an always-on contestability layer keeps the record growing.
> The compute boundary is the whole game: mechanize the rule-bound, sortition the
> discretionary, cryptographically root what must be trustless, and name the three
> trust roots you cannot remove.
