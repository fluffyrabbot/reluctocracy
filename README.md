# Reluctocracy

> The people least likely to seek power are, on average, the most trustworthy to
> wield it. The hard part is that *any system rewarding this trait attracts people
> who counterfeit it.* Reluctocracy is a design theory that treats
> **grift-resistance as a security property** and builds against it.

This repository is, for now, a body of **design theory** plus a narrow v0
reference scaffold for the protocol substrate: append-only events, deterministic
replay projections, and machine-checkable invariant results.

## Read in this order

1. **[THEORY.md](THEORY.md)** — the core. Grift defined as a security property;
   the central theorem (grift is the conversion of a performed signal into a
   durable asset — attack the conversion at either end); the threat model of seven
   grifters; the three defensive axes (input authenticity, output perishability,
   accountability-over-time); meta-layer defense; impossibility results; and the
   irreducible core.
2. **[A4-NOMINATION.md](A4-NOMINATION.md)** — deep-dive on the keystone's weak
   joint: Sybil-resistant nomination without surveillance. Vouching graphs, the
   sparse cut, staked vouches, stratified pools, correlation de-weighting, the
   zero-knowledge attestation route, and the irreducible seed-set trust root.
3. **[MODERATION.md](MODERATION.md)** — the load-bearing open problem:
   moderation-as-curation. Why "moderation" is six distinct powers, not one;
   plural legible lenses instead of one feed; labeling *form* but never *truth*;
   making every curation act a contestable entry; and the residual leaks (the
   default lens, the watchdog-minority dependency).
4. **[PROTOCOL.md](PROTOCOL.md)** — v0 protocol spec: the append-only signed
   event log, the data model (event types), the compute/trust boundary (mechanize
   the rule-bound, sortition the discretionary, cryptographically root the rest),
   the deliberation lifecycle state machine, and the sixteen checkable invariants —
   each cross-referenced to the theory clause it enforces.
5. **[AGGREGATION.md](AGGREGATION.md)** — the judgment math the protocol rests on:
   two-shot Condorcet-independent aggregation with bridging-consensus surfacing
   (never a bare majority), quadratic voting for intensity, and the live capture-
   posterior in log-odds — where each structured suspicion-claim is a likelihood
   ratio and coordination leaves a statistical fingerprint even when ties are
   hidden, with explicit evidence-family discount rules to avoid double-counting
   overlapping signals. Adds invariants INV-12..16.
6. **[LINEAGE.md](LINEAGE.md)** — prior statecraft and political thought that
   carries over: Venetian/Florentine/Athenian selection, the accountability
   cluster (*dokimasia* / *euthyna* / *graphe paranomon*, the Chinese Censorate,
   Haudenosaunee recall), Condorcet, pol.is/vTaiwan, Ostrom's commons principles,
   futarchy — and the failure modes (Michels, liquid-democracy super-delegates,
   DAO plutocracy) we must keep rebutting.

## The thesis in one paragraph

> Decide by **lottery over the trusted**, not election of the eager. Make standing
> **perishable and non-transferable**. Let **experts frame options while the
> drafted decide values**. Gate entry with pre-vetting and exit with audit, and
> attach liability to whoever sets the agenda. Publish the **provenance** and be
> honest about the limits. Net effect: the grifter's expected return goes negative.

## Status

Early theory with a greenfield-safe TypeScript substrate scaffold. Open problems
are named, not hidden — see the impossibility results (`THEORY.md` §5), residual
tensions (`A4-NOMINATION.md` §8), and invariant checks that intentionally return
`not_implemented` where the required standing lifecycle has not been specified
yet.

The first executable moderation seam is now present: `Lens` events define
plural, legible claim-ranking rules, `CurationAct` events carry attributed,
contestable, evidence-backed procedural labels, and the reference code includes
chronological plus contestedness lenses without adding any truth-verdict power.
The first claim render view-model now co-locates each rendered claim with its
strongest procedurally ranked rebuttal, and `INV-6` fails any executable claim
lens that would render an unchallenged claim.

The executable selection seam is now public and reusable:
`reluctocracy.draw.public-hash-sort-v1` ranks a stable draw-eligible pool
fingerprint against a `RandomBeacon`, including deterministic
`minimumDistinctStrata` handling. `INV-1` checks exact panel recomputation,
`INV-2` runs deterministic forked-beacon statistical fairness verification for
equal-ticket pools, and `INV-11` replays comparable independent seed forks to
require pool/draw stability or an explicit matching `pool_seed_instability`
trust-fragility flag on the `Draw`.

The executable credence-model seam is now first-class as well: `CredenceModel`,
`CredencePrior`, and `CredenceFeatureWeight` events make priors and feature
weights attributed, plural, and contestable, while `CredenceEvidenceFamily` and
`CredenceEvidenceDiscountRule` events make correlated-signal discounting explicit.
Each posterior `Credence` references the model inputs that produced it. `INV-15`
now fails a single-model scaffold, and `INV-16` fails overlapping active feature
families without a discount rule.
