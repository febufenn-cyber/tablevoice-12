# Tablevoice

> AI that answers every Google and Zomato review in the restaurant's voice and flags listing errors that cost orders.

**Alternative to the product-shape pioneered by Superorder (YC S19)** — rank #12 of 500 in the [YC-500 Fable 5 Venture Blueprint](https://github.com/) (score 7.15/10).

## Why this exists
Restaurants lose revenue to bad listings and unanswered reviews. The buildable wedge: review-response drafting and listing-consistency checker.

## MVP scope
- [ ] Review inbox
- [ ] AI reply drafts
- [ ] tone presets
- [ ] listing-audit report
- [ ] weekly digest

## Architecture
`Workers+Supabase+Claude` — Cloudflare Workers + Hono API, Supabase (Postgres + RLS + Auth + pgvector), Claude API via Agent SDK (claude-fable-5 for agent reasoning, claude-haiku-4-5 for volume), wrangler deploys.

**Integrations:** Google Business Profile API; Zomato; Claude API; Stripe
**Data:** Reviews, listing fields, response history, sentiment tags.
**Agent core:** Agent triages and drafts responses to reviews end-to-end for owner approval.

## Business
| | |
|---|---|
| Monetization | Per-location monthly subscription |
| First customer | Single-location independent restaurant owner |
| GTM wedge | Cold DM restaurants with a free listing audit report |
| Competition risk | High: many review tools |
| Regulatory/trust risk | Med: platform terms on automated replies |
| India angle | Zomato/Google reviews drive footfall; owners rarely have time to reply. |
| Difficulty / build time | Low / 2-3 weeks |

## 30-day plan
- **W1:** core loop — Review inbox + AI reply drafts
- **W2:** tone presets + listing-audit report + weekly digest + auth + billing
- **W3:** polish, instrument events, seed first users via: Cold DM restaurants with a free listing audit report
- **W4:** launch + first revenue; kill/scale decision

---
*Built with Fable 5 (Claude Code). Blueprint row: inspired by Superorder — "Manages restaurants' online presence, reputation and delivery performance."*