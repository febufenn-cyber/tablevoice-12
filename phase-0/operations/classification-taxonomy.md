# Review Classification Taxonomy

Use one primary category and zero or more secondary categories. Assign risk independently from star rating.

## Categories

| Code | Category | Typical signals | Default internal check |
|---|---|---|---|
| PRAISE | General praise | good, excellent, loved it | Identify detail worth reinforcing |
| FOOD_TASTE | Taste/quality | bland, salty, stale, excellent flavour | Item/preparation context |
| PORTION | Portion size | too small, generous | Menu promise and serving standard |
| PRICE | Pricing/value | expensive, worth it, overcharged | Menu price and billing record |
| SPEED | Service speed | long wait, slow table service | Shift, staffing, ticket time |
| STAFF | Staff behaviour | rude, helpful, ignored | Manager review; protect privacy |
| HYGIENE | Cleanliness/hygiene | dirty table, insects, smell | Immediate manager inspection |
| DELIVERY_DELAY | Delivery timing | arrived late | Order and dispatch timeline |
| MISSING_ITEM | Missing item | item absent | Packing/order record |
| WRONG_ORDER | Incorrect item | wrong dish, wrong variant | Order and packing record |
| PACKAGING | Packaging/leakage | spilled, damaged | Packaging standard |
| AMBIENCE | Noise, seating, comfort | crowded, loud, hot | Facility/shift context |
| PARKING | Parking/access | no parking, hard to find | Public information and signage |
| BILLING | Billing/payment | extra charge, duplicate charge | Bill/payment record |
| RESERVATION | Booking/waitlist | table not held | Booking record and policy |
| LISTING_INFO | Public information | wrong hours/phone/location/menu | Confirm official field |
| SAFETY | Food safety/allergy/injury | poisoning, allergy, foreign object | Red workflow |
| HARASSMENT | Harassment/discrimination/threat | abuse, bias, assault | Red workflow |
| FRAUD | Scam/fraud accusation | fake bill, card misuse | Red workflow |
| FAKE_SUSPECTED | Potential spam/fake review | no matching visit, extortion claim | Verify records; no public accusation |
| OTHER | Does not fit | — | Manual analysis |

## Sentiment

- Positive
- Mixed
- Negative
- Neutral/informational
- Unclear/sarcastic

Do not infer sentiment from rating alone.

## Risk policy

### Green

Routine praise or low-stakes feedback with no sensitive person, safety, financial, legal, or compensation issue.

Examples:

- Positive review
- Rating-only praise
- Mild preference criticism
- Simple menu compliment

### Amber

Requires judgement or factual context but is not an immediate sensitive incident.

Examples:

- Slow service
- Missing item
- Pricing dispute without fraud allegation
- Staff rudeness complaint
- Mixed review
- Suspected fake review
- Named employee in a non-severe complaint

### Red

Stop normal drafting and follow `escalation-policy.md`.

Triggers include:

- Food poisoning, allergy, contamination, foreign object, injury
- Harassment, discrimination, sexual misconduct, violence, threats
- Fraud, theft, card misuse, legal claim, police, regulator, media threat
- Personal information exposure
- Allegation involving a child
- Extortion or blackmail
- Severe employee accusation
- Self-harm or suicide reference
- Any case where a public reply could materially worsen liability or safety

## Confidence

- **High:** classification follows explicit review text.
- **Medium:** likely, but context could change the interpretation.
- **Low:** ambiguity, sarcasm, poor translation, cropped source, or conflicting facts.

Low confidence does not automatically mean red; it means the draft must expose uncertainty.

## Urgency

- **Immediate:** safety, threat, viral/media escalation, exposed personal data
- **Same business day:** 1–2 star complaint, named staff, billing dispute, active customer follow-up
- **Normal:** routine positive or low-stakes feedback

## Recommended disposition

Choose one:

- Reply publicly
- Reply publicly and move offline
- Request context before replying
- Report through platform tools and consider no reply
- Do not reply
- Escalate

Silence can be the correct recommendation; response rate is not the only goal.

## Recurrence tags

Use stable tags for repeated signals:

- daypart
- day_of_week
- menu_item
- service_mode
- location_area
- staff_role
- delivery_partner
- complaint_category

A recurrence claim requires at least three comparable observations or a clearly documented severe pattern. Do not manufacture trends from two unrelated reviews.
