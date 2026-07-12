# Tablevoice

> AI-assisted reputation operations for restaurants: understand every review, recommend the operational response, draft the public reply in the restaurant's voice, and detect listing errors that may cost trust or orders.

**Blueprint origin:** inspired by the product shape pioneered by Superorder (YC S19), ranked #12 of 500 in the YC-500 Fable 5 Venture Blueprint (score 7.15/10).

## Current phase

**Phase 0 — Concierge validation is implemented as an operating system, not a SaaS build.**

The purpose is to prove that restaurant decision-makers repeatedly:

1. provide real reviews and business information;
2. approve, edit, and publish Tablevoice drafts;
3. act on listing or operational findings;
4. return without repeated prompting; and
5. pay for continued monitoring.

Start with [`phase-0/README.md`](phase-0/README.md).

## Product thesis

Reply generation alone is a commodity. Tablevoice should become the decision layer between public reputation and restaurant operations:

```text
review or listing signal
        ↓
classification + risk
        ↓
recommended internal action
        ↓
public reply in restaurant voice
        ↓
owner approval
        ↓
publication + outcome evidence
        ↓
recurring issue intelligence
```

## MVP direction after validation

- Review inbox
- Risk-aware AI reply drafts
- Restaurant voice constitution
- Listing-health audit
- Internal issue actions
- Weekly owner intelligence
- Controlled approval and publishing

## Proposed production architecture

`Workers + Supabase + model gateway` — Cloudflare Workers with Hono, Supabase Postgres/Auth/RLS, asynchronous queues, and model routing. Google Business Profile should be isolated behind a source adapter. Zomato must not be on the critical path until a supported integration route is verified.

## Business hypothesis

| Dimension | Initial hypothesis |
|---|---|
| Monetization | Per-location monthly subscription or managed service |
| First buyer | Single-location independent restaurant decision-maker |
| Daily user | Owner, manager, receptionist, or agency operator — to be discovered |
| GTM wedge | Evidence-backed free listing/reputation snapshot |
| Retention wedge | Review workflow plus recurring issue intelligence |
| Primary risk | Owners value the audit but do not form a recurring paid habit |
| Trust model | Draft-first; explicit approval for every public response in Phase 0 |

## Phase sequence

1. **Phase 0:** Concierge validation
2. **Phase 1:** Manual/imported review copilot
3. **Phase 2:** Google integration proof
4. **Phase 3:** Production inbox and approval workflow
5. **Phase 4:** Restaurant voice system
6. **Phase 5:** Listing-health audit engine
7. **Phase 6:** Issue-resolution layer
8. **Phase 7:** Weekly owner intelligence
9. **Phase 8:** Controlled autopilot
10. **Phase 9+:** Multi-location, agency mode, and additional platforms

No later phase is justified merely because its features are technically buildable. Each phase must pass its evidence gate.
