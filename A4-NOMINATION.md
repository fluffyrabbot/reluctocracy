# A4 Hardened — Sybil-Resistance on Nomination

> Deep-dive on the keystone's weak joint (see `THEORY.md` §3, A4). Goal: make
> "stuff the pool with counterfeit-trusted identities" expensive **without
> building surveillance infrastructure.**

---

## 0. Reframe: the lottery already does 80% of the work

In an **election**, one fake influencer has *leverage* — a single viral
fabrication can swing thousands of votes. Capturing 51% of *attention* wins
100% of the prize. The Sybil problem there is catastrophic because it is
super-linear.

Reluctocracy selects by **lottery from the pool** (A1). That changes the math
entirely. If the pool has `H` genuinely-trusted members and an attacker injects
`A` counterfeit ones, and we draw `k` deliberators uniformly:

```
   expected attacker seats  =  k · A / (H + A)
```

There is **no leverage**. To get expected fraction `f` of the seats, the attacker
must manufacture `A ≈ f·H / (1−f)` pool members — i.e. influence is *linear* in
identities injected, and to get a blocking share you must become a comparable
share of the entire trusted population. There is no cheap tipping point.

**So A4's job is not "make Sybils impossible." It is narrower:**

> Keep the *cost-per-unit-of-injected-pool-share* high, and deny the attacker any
> mechanism with leverage.

That is a winnable fight. The rest of this document is how.

---

## 1. Two attacks that get conflated — and need different defenses

| | **Sybil attack** | **Entryism attack** |
|---|---|---|
| What | Fake identities / puppets — not distinct humans | **Real, distinct** humans, coordinated as a faction |
| Beaten by | Proof-of-distinct-personhood + cost | Proof-of-personhood does **nothing** — they're all real |
| Real defense | Graph topology (sparse cut) + scarce, costly vouching | Stratification + correlation de-weighting |

Most "Sybil resistance" discussions only address the left column and quietly lose
to the right one. We address both.

---

## 2. The substrate: a vouching graph, not a vote count

Pool membership is **not** awarded by counting nominations. Raw counts are
brigadeable by construction. Instead:

- A nomination is an **edge**: *person P vouches for person Q.*
- Pool membership is the output of a **trust-propagation + diversity computation
  over the graph** (below), seeded from a known-honest set.

This single design choice kills the naive brigading attack (manufacture 10,000
endorsements) before it starts, because 10,000 endorsements *from the Sybil
region* propagate almost no trust across the cut (§3).

---

## 3. Defense against Sybils (fake identities): the sparse cut

Borrowed from the Sybil-defense literature — **SybilGuard / SybilLimit**
(Yu et al.) and **SybilRank** (Cao et al., deployed at Tuenti/Facebook scale).
The structural fact they exploit:

> An attacker can mint unlimited fake identities and unlimited fake edges
> *among them*. What he **cannot** cheaply manufacture is **attack edges** —
> edges from the honest region into the Sybil region — because each one requires
> fooling or buying a *real, already-trusted* person into a real vouch.

Trust propagated from honest seeds is **bottlenecked at the sparse cut** between
the honest region and the Sybil region. A million puppets behind three attack
edges receive only three attack-edges' worth of trust mass — not a million.

This is the property we want, and crucially it is **surveillance-free**: the
algorithm needs the *shape* of the vouching graph, never the real-world identity
of any node. Nodes can be stable pseudonyms.

The defense therefore reduces to one requirement: **keep attack edges scarce and
expensive.** That is §4.

---

## 4. Keep the cut sparse: accountable, rivalrous vouching

Attack edges are only scarce if real people don't vouch promiscuously and can't
be cheaply bought into vouching. Three properties on the *vouch* itself:

1. **Rivalrous.** Each person has a *small, fixed* vouching budget. Vouches are
   scarce goods, not free likes. Promiscuous vouching is structurally impossible.

2. **Accountable (staked).** Your vouch puts *your own* standing on the line. If
   those you vouched for are later flagged as part of a Sybil/entryist cluster,
   **your vouching capacity is slashed** — transitively. Vouching for strangers
   becomes a risk you carry, which is exactly what keeps the honest/Sybil cut
   sparse. (This is a web-of-trust with slashing.)

3. **Revocable & decaying.** Vouches expire and must be renewed, and weight
   **decays with graph distance** from the seeds. A long chain of vouches to a
   distant cluster carries little weight, so the attacker can't launder trust
   through a long path of intermediaries.

**Cost consequence.** To gain expected seat-share `f`, the attacker must acquire
roughly

```
   attack_edges ≈ f · (honest trust mass) / (trust carried per attack edge)
```

attack edges, each costing some `$C` to bribe/engineer a real trusted person
*and* carrying slashing risk. Cost is **linear in influence gained with a large
constant and no leverage** — the opposite of the election case. That is the whole
goal of A4, expressed as a bound.

---

## 5. Defense against entryism (real coordinated humans)

Proof-of-personhood is useless here — every faction member is a real, unique
human. Two structural defenses:

### 5a. Stratified, federated pools (raise the breadth of attack needed)

The pool is not one big bucket. It is **stratified across many independent
communities** (geographic, institutional, demographic) and deliberators are drawn
*proportionally* across strata — the same machinery real citizens' assemblies use
for representativeness (e.g. stratified sortition à la the Sortition Foundation),
repurposed here for **attack-resistance.**

Effect: a faction that fully captures *one* community (a subreddit, a congregation,
a party chapter) gains only that stratum's small quota. To gain real share it must
infiltrate a *representative cross-section of society simultaneously* — raising the
attack from "capture one forum" to "capture the country," which has no economy of
scale.

### 5b. Correlation de-weighting in the draw (coordination is visible)

A genuine trust web is **broad and sparse**: trusted people are vouched for from
many unrelated directions. A coordinated faction is a **dense, correlated
subgraph**: they nominate each other, join at the same time, share strata.

That density is **statistically detectable even when every member is a real
person.** The draw therefore *maximizes diversity / de-weights correlation*:
selecting one member of a tight cluster sharply lowers the draw weight of the
rest. Coordination, the faction's core tactic, becomes the signal that defeats it.
(This also hardens §3 — a Sybil region is the densest correlated cluster of all.)

---

## 6. The surveillance escape hatch (the explicit constraint)

The tension: Sybil-resistance seems to require knowing "who is real," which smells
like a panopticon. The resolution is a strict **data-minimization** discipline —
we need the graph's *shape* and a few one-bit *attestations*, never a who's-who
registry:

- **Pseudonymous nodes.** §3's topology defense needs no real identities. Nodes
  are stable pseudonyms; the central system never learns who they are.
- **Attestation, not identity, for strata.** §5a needs "this pseudonym is one
  member of community X" — a *single bit*, issued *by that community*, not a
  dossier held centrally. No layer learns more than it must.
- **ZK proof of unique membership.** Where we need "one real, unique person within
  group X" without surveillance, use **anonymous-credential / ZK group-membership**
  tech (Semaphore-style nullifiers, Idemix/Privacy-Pass-style credentials):
  prove *unique* membership while revealing *which* member to no one. This is the
  surveillance-free route to proof-of-personhood — and it is the part that needs
  the most careful cryptographic engineering before it can be trusted.

Principle: **each layer learns exactly one bit, and no central party holds the
join.**

---

## 7. The seed problem (honest — this is a G6 vector)

Trust propagation (§3) must start from a **seed set of known-honest nodes.**
Whoever picks the seeds biases the entire graph — so the seed set is a *trust
root*, and is exactly the meta-capture (G6) vulnerability dressed in math.

Mitigations, none of which fully eliminate it:

- **Multiple independent seed sets**, published openly, run in parallel.
- **Sensitivity analysis as a public health check:** recompute the pool under
  different seed sets. If the resulting pool is *unstable* across seeds, the graph
  is fragile/capturable and the result must not be trusted. Stability across
  independent seeds is the auditable evidence that the root isn't steering the
  outcome.
- Treat the seed set with the same `M1` discipline as any other agenda-power:
  distributed, rotated, transparent.

---

## 8. Residual tensions (the honest part)

A4 is *hardened*, not *solved*. Three genuine unsolved tensions remain, and naming
them is itself part of the grift-resistance:

1. **Accountability vs. receipt-freeness.** §4's staked vouching needs to *trace*
   bad vouches; anti-vote-buying needs vouchers to be *unable to prove to a briber*
   how they vouched. These pull in opposite directions. Partial resolution: make
   slashing a *system-computed* consequence of cluster-detection rather than a
   publicly provable act by the voucher — but the tension is real and not fully
   closed.

2. **Locality requires *some* attestation.** §5a's stratification needs a minimal,
   community-issued bit of "belonging." Minimized, decentralized, but nonzero — a
   pure zero-knowledge-of-everything system cannot also be stratified by real
   community. We trade a sliver of disclosure for entryism-resistance, knowingly.

3. **The seed trust-root is irreducible (§7).** It can be distributed, rotated,
   and audited-for-stability, but never made trustless. Anyone who claims
   otherwise is selling something.

---

## 9. A4 in one paragraph

> Make nomination an **edge**, not a tally. Award pool membership by **trust
> propagated from honest seeds**, so a Sybil army behind a sparse cut earns almost
> nothing. Keep that cut sparse with **scarce, staked, decaying vouches**, so
> attack edges are few and expensive. Beat *real* factions with **stratified
> pools** (forcing breadth, not depth) and **correlation de-weighting** (turning
> coordination into the signal that sinks them). Need only the graph's **shape**
> plus **one-bit, community-issued, zero-knowledge attestations** — never a
> registry. Concede openly that the **seed set is a trust root** and audit it for
> stability. Net effect: injecting pool-share costs **money linear in the share
> gained, with no leverage and no tipping point** — which is exactly the invariant
> from `THEORY.md` §0, enforced at the nomination layer.
