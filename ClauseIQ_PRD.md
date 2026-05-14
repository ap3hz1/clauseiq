# CLAUSEIQ

**Commercial Lease Risk Quantification Platform**

*MVP Developer Brief — Version 1.0 — Confidential*

---

## 1. Overview

ClauseIQ is a web-based lease review tool for commercial real estate lawyers and their clients (landlords and tenants). A user uploads two documents — the proposed lease and a subsequent redlined version. ClauseIQ identifies every substantive change, classifies each by clause type, and outputs a dollar-denominated economic impact estimate for each change, totalled into a portfolio-level risk register.

> **MVP Has One Job**
> Prove that the economic quantification layer produces output that a commercial real estate lawyer finds credible and useful in a real negotiation. Everything else is secondary.

---

## 2. User Roles

| Role | Who They Are | What They Need |
|---|---|---|
| Lawyer | Commercial RE solicitor acting for landlord or tenant | Fast first-pass review memo they can validate, annotate, and send to client |
| Landlord | Private or mid-market commercial property owner | Dollar-denominated summary of what tenant's redline costs them |

---

## 3. Core Workflow

The MVP workflow has five steps, each corresponding to a screen or automated process.

| # | Actor | Action |
|---|---|---|
| 1 | User | Upload landlord's base lease (PDF or DOCX) and tenant's redlined version (DOCX with tracked changes, or second clean PDF). |
| 2 | System | Extract and compare both documents. Identify every substantive change — additions, deletions, and modifications — and map each to a clause type from the clause taxonomy. |
| 3 | System | For each identified change, apply the appropriate quantification method (deterministic calculation, actuarial estimate, or qualitative flag) to produce an economic impact estimate. |
| 4 | User | Review the Change Risk Register on screen. Annotate, override estimates, accept or dismiss items. Download as PDF report. |
| 5 | System | Generate a formatted PDF report — the Change Risk Register — suitable for sharing with a client or attaching to a negotiation file. |

---

## 4. Screens to Build

### 4.1 Upload Screen

- Two file upload zones: current lease document and most recent turn
- Accepted formats: DOCX (preferred — preserves tracked changes), PDF (fallback — system performs diff)
- Property context inputs: property type dropdown (Industrial / Office / Retail / Mixed-Use), province (Ontario default), gross leasable area (sqft), base rent ($/sqft/year), lease term (years), estimated operating costs ($/sqft/year — optional, system estimates if blank)

### 4.2 Change Risk Register

The core screen. Displayed as a sortable, filterable table with one row per identified change.

| Column | Type | Description | Example | Sortable | Filterable |
|---|---|---|---|---|---|
| Clause Type | Text | Category from taxonomy | CAM Cap | Yes | Yes |
| Change Summary | Text | One-line plain-language description of what changed | Tenant proposes 3% non-cumulative cap (was 5% cumulative) | No | No |
| Favours | Badge | Landlord / Tenant / Neutral | Tenant | No | Yes |
| Impact (Low) | Currency | Low end of estimated economic cost to landlord | $18,000 | Yes | No |
| Impact (High) | Currency | High end of estimated economic cost to landlord | $54,000 | Yes | No |
| Confidence | Badge | High / Medium / Low — reflects quantification method | Medium | No | Yes |
| Method | Text | Deterministic / Actuarial / Benchmarked / Qualitative | Deterministic | No | Yes |
| Recommendation | Text | Accept / Counter / Reject — system suggestion | Counter | No | Yes |
| Notes | Text | User annotation field — editable inline | — | No | No |

**Summary bar above the table shows:** Total changes identified · Changes favouring tenant · Total estimated landlord exposure (low–high range) · Overall risk signal (Manageable / Material / Significant).

**Actions:** Export PDF Report · Reset Annotations · Re-run Analysis

### 4.3 PDF Report Output

Auto-generated on export. Formatted for professional use — suitable to attach to a client advice memo or negotiation file.

- Cover page: property address, lease parties, date of analysis, analyst name (editable)
- Executive summary: total exposure range, overall signal, top three risk items
- Change Risk Register table: full register as displayed on screen, with user annotations included
- Methodology notes: brief explanation of how each quantification method works
- Disclaimer: estimates are decision-support tools, not legal or financial advice

### 4.4 Account and File History

- Simple user account — email and password, no SSO required at MVP
- Previous analyses listed by upload date, property type, and file name
- Ability to re-open a previous analysis, add notes, and re-export
- No team/sharing features at MVP

---

## 5. Clause Taxonomy (MVP Scope)

The MVP quantification engine covers the following clause categories. These represent the highest-frequency, highest-economic-impact provisions in Canadian commercial lease negotiations. Expand in subsequent releases.

| Clause Type | Quantification Method | What Is Being Measured |
|---|---|---|
| CAM / Operating Cost Cap | Deterministic | NPV of unrecoverable operating cost growth above the proposed cap vs. uncapped baseline, over lease term |
| Free Rent / Rent Abatement | Deterministic | Lost rental income in present value terms; abatement period × monthly rent × discount factor |
| Tenant Improvement Allowance | Deterministic | Delta between proposed TI amount and market benchmark for property type and submarket |
| HVAC Capital Replacement Responsibility | Actuarial | Expected replacement cost × probability of replacement event during lease term, based on system age and ASHRAE lifespan data |
| Roof Replacement Contribution | Actuarial | Tenant's proposed contribution vs. market standard (typically $0.15–$0.25/sqft/year); delta × lease term × GLA |
| Personal Guarantee Scope | Actuarial | Difference in expected recovery between full-term guarantee and limited guarantee; weighted by tenant category default probability |
| Asphalt / Parking Lot Cap | Deterministic | Proposed annual cap vs. uncapped obligation; projected cost above cap over lease term |
| Assignment and Subletting Rights | Benchmarked | Value of landlord control right based on remaining term, market rent vs. in-place rent, and sublease premium data |
| Renewal Option Terms | Deterministic | Economic value of renewal at fixed vs. market rent; sensitivity to market rent assumptions shown |
| Structural Repair Responsibility | Actuarial | Expected structural repair cost during lease term based on building age and property type benchmarks |
| Operating Cost Exclusions | Deterministic | Estimated annual cost of excluded items × remaining lease term; benchmarked against market standard exclusion lists |
| Demolition / Redevelopment Right | Benchmarked | Option value of landlord's right to terminate for redevelopment; loss of that right estimated from land value and zoning data |
| Insurance Requirements | Deterministic | Delta in required coverage limits × benchmark premium rates for property type and location |
| Management Fee Cap | Deterministic | Proposed cap vs. uncapped management fee at current and projected portfolio values over term |

> **Out of Scope for MVP — Quantification**
> Force majeure modifications · Percentage rent provisions · Ground lease structures · Environmental indemnity changes · Landlord default and remedy modifications. These are flagged qualitatively (Confidence: Low / Method: Qualitative) but not dollar-quantified in the MVP.

---

## 6. Quantification Engine Logic

### 6.1 Confidence and Method Classification

Every impact estimate is classified by the method used to produce it. This is displayed to the user and included in the PDF report. Transparency about methodology is a core product principle — a commercial real estate lawyer needs to understand how a number was derived before they will trust it.

| Method | Confidence | When Used | Data Source |
|---|---|---|---|
| Deterministic | High | Direct financial calculations with defined formulas. Inputs are known from the lease itself. | Lease economics entered at upload; standard discount rate (configurable, default 6%) |
| Actuarial | Medium | Provisions where cost depends on a probabilistic future event. Expected value calculated from industry lifespan and frequency data. | BOMA, ASHRAE, commercial insurance industry actuarial tables; tenant default rates from commercial credit bureau data |
| Benchmarked | Medium–Low | Provisions where value depends on market practice. Estimated from comparable transaction data. | Clause benchmark library (built from annotated training corpus); initially seeded with US EDGAR lease data, refined with Canadian transactions over time |
| Qualitative | Low | Provisions where quantification is not yet possible or where the range is too wide to be meaningful. | Human review recommended; system provides plain-language description of risk |

### 6.2 Sample Calculations (Reference for Development)

The following illustrate how the deterministic calculations should be implemented. These are the first five clause types to build and test against real leases before adding actuarial and benchmarked methods.

#### CAM Cap Change

Inputs: current operating costs per sqft (C), GLA in sqft (A), proposed cap rate (r_cap), uncapped growth assumption (r_grow, default 5%), lease term remaining in years (T), discount rate (d, default 6%).

```
Uncapped cost year N = C × A × (1 + r_grow)^N
Capped cost year N   = C × A × (1 + r_cap)^N   [non-cumulative] or compound-capped [cumulative]
Annual shortfall year N = max(0, Uncapped_N − Capped_N)
NPV of shortfall = Σ [Shortfall_N / (1+d)^N] for N = 1 to T
```

Output: Low estimate at r_grow = 4%; High estimate at r_grow = 6%. Display as range.

#### Free Rent / Rent Abatement

Inputs: monthly base rent (R), free rent months (M), discount rate (d).

```
PV of abatement = R × Σ [1/(1+d/12)^m] for m = 1 to M
```

Output: single point estimate. High confidence.

#### Personal Guarantee Scope Change

Inputs: monthly rent (R), original guarantee term (T_orig in months), proposed guarantee cap (T_cap in months), tenant industry category (I), probability of default (P_default from actuarial table keyed to I), expected recovery rate under guarantee (E_rec).

```
Exposed rent = R × (T_orig − T_cap)
Expected loss from guarantee reduction = Exposed rent × P_default × (1 − E_rec)
```

Output: Low / Base / High using P_default ±1 standard deviation from industry actuarial table. Confidence: Medium.

---

## 7. AI and Document Processing Layer

### 7.1 Document Comparison

For DOCX files with tracked changes: extract tracked changes directly from DOCX XML. Do not use a diff algorithm — the tenant's tracked changes are the ground truth of what was proposed.

For PDF vs. PDF (fallback): use a text extraction + diff approach. Extract text from both PDFs using PyMuPDF or pdfplumber. Perform paragraph-level diff using difflib or a semantic diff library. Flag this path as lower confidence — PDF diff cannot distinguish between formatting changes and substantive changes reliably.

For DOCX clean vs. DOCX clean (two versions without tracked changes): perform semantic paragraph diff. Flag this path as lower confidence.

### 7.2 Clause Classification

Architecture: RAG (Retrieval-Augmented Generation) at MVP. Maintain a vector database of annotated clause examples. For each identified change, retrieve the most similar annotated examples and use the base LLM to classify the clause type.

- Embedding model: text-embedding-3-small (OpenAI) or equivalent
- Vector database: Pinecone or pgvector (Supabase extension — preferred for stack simplicity)
- Classification LLM: Claude Sonnet via Anthropic API. Prompt includes: the changed text, the surrounding lease context (±2 paragraphs), the top 5 retrieved similar examples with their labels, and the clause taxonomy
- Output: clause type (from taxonomy), a one-sentence plain-language description of what changed, and a direction flag (tenant-favorable / landlord-favorable / neutral)
- Confidence: High if top retrieved example similarity score > 0.85; Medium if 0.70–0.85; Low if < 0.70

### 7.3 Quantification Trigger

Once a clause is classified, the system looks up the quantification method in a clause-type configuration table and executes the appropriate calculation or flags the item as qualitative. The classification and quantification steps are decoupled — classifying a clause does not require the quantification logic to be complete for that clause type.

### 7.4 Seed Training Corpus

The RAG system requires an initial set of annotated clause examples before it can classify reliably. The following sources should be used to build the seed corpus before launch.

- **US SEC EDGAR commercial lease exhibits:** publicly available, searchable by SIC code, large volume. Download 500–1,000 office, industrial, and retail leases filed as 10-K or 10-Q exhibits. Extract and annotate clause examples across the taxonomy.
- **CanLII commercial tenancy decisions:** lease clauses quoted in Ontario Superior Court and Court of Appeal decisions. Smaller volume but Canadian-specific and dispute-tested.
- **OREA standard form commercial lease:** the standard Ontario starting point. Annotate every clause in the standard form as baseline examples.
- **Synthetic augmentation:** use LLM to generate 10–20 variations of each annotated clause example (different phrasings, different levels of tenant-favorable modification). Label synthetic examples with lower confidence weight.

**Target: 200 annotated clause examples across all 14 MVP clause types before launch. Minimum viable: 10 examples per clause type.**

---

## 8. Recommended Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend | Next.js + Tailwind | Responsive web app. No mobile-native required at MVP. |
| Backend / API | Node.js (Next.js API routes) | REST endpoints for upload, analysis, report generation. |
| Database | PostgreSQL (Supabase) | Analyses, clause registry, user accounts, annotation history. |
| Vector DB | pgvector (Supabase extension) | RAG clause similarity search. Avoids separate Pinecone dependency at MVP scale. |
| Document parsing | python-docx + PyMuPDF | DOCX tracked change extraction and PDF text extraction. Run as a Python microservice called from Node. |
| LLM — Classification | Claude Sonnet (Anthropic API) | Clause type classification and plain-language change description. |
| LLM — Embeddings | OpenAI text-embedding-3-small | Clause embedding for RAG retrieval. Switch to open-source model if cost becomes an issue at scale. |
| Quantification engine | Node.js (custom) | Deterministic and actuarial calculations. Pure TypeScript, no ML required. Well-tested with unit tests against known lease scenarios. |
| PDF report generation | Puppeteer | Render the Change Risk Register as HTML then print to PDF. Gives full styling control. |
| Auth | Supabase Auth | Email/password at MVP. No SSO required. |
| File storage | Supabase Storage | Uploaded lease documents. Encrypted at rest. |
| Hosting | Vercel (frontend) + Railway (Python microservice) | Zero-config deploys. Railway for the Python document processing service. |
| Billing (later) | Stripe | Not required at MVP — use manual invoicing for first 20 customers. |

---

## 9. Data Model (Simplified)

### `analyses`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | Foreign key → users |
| created_at | timestamp | |
| property_type | enum | industrial \| office \| retail \| mixed_use |
| province | enum | ON \| BC \| AB … default ON |
| gla_sqft | integer | Gross leasable area |
| base_rent_psf | decimal | Base rent per sqft per year |
| lease_term_years | decimal | |
| operating_cost_psf | decimal | Estimated or entered by user |
| base_lease_file | text | Storage path |
| redline_file | text | Storage path |
| status | enum | processing \| complete \| error |
| total_changes | integer | Count of identified changes |
| total_impact_low | decimal | Sum of low-end estimates |
| total_impact_high | decimal | Sum of high-end estimates |
| signal | enum | manageable \| material \| significant |

### `changes`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| analysis_id | uuid | Foreign key → analyses |
| clause_type | text | From taxonomy |
| change_summary | text | LLM-generated one-liner |
| favours | enum | landlord \| tenant \| neutral |
| impact_low | decimal | Low estimate (null if qualitative) |
| impact_high | decimal | High estimate (null if qualitative) |
| confidence | enum | high \| medium \| low |
| method | enum | deterministic \| actuarial \| benchmarked \| qualitative |
| recommendation | enum | accept \| counter \| reject |
| original_text | text | Extracted from base lease |
| redlined_text | text | Extracted from redline |
| user_notes | text | Editable annotation — nullable |
| dismissed | boolean | User has dismissed this item |

### `clause_examples` (RAG corpus)

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| clause_type | text | Taxonomy label |
| clause_text | text | Raw clause text |
| embedding | vector(1536) | OpenAI embedding |
| favours | enum | landlord \| tenant \| neutral |
| property_type | enum | Nullable — some clauses are type-agnostic |
| source | text | EDGAR / CanLII / OREA / synthetic |
| confidence_weight | decimal | 1.0 real, 0.7 synthetic — used in RAG scoring |

---

## 10. Key Rules and Validation

- DOCX tracked change extraction is the primary path. If tracked changes cannot be extracted, fall back to two-document diff and flag lower confidence on all items from that analysis.
- All economic impact estimates must display as ranges (low–high), never as point estimates. False precision destroys lawyer trust faster than wide ranges.
- Every estimate must display its quantification method and confidence level. This is non-negotiable — it is what separates this product from a black-box AI tool.
- Lease inputs (GLA, base rent, operating costs) entered by the user override any values extracted from the document. Never silently override user inputs.
- A change that cannot be classified with confidence ≥ 0.70 is classified as Qualitative regardless of clause type. Do not force a low-confidence classification.
- All uploaded documents are stored encrypted. No document content is sent to third-party services other than the Anthropic API and OpenAI embeddings API. Include this in the privacy policy.
- The system does not provide legal advice. Every screen, every report, and every email must include: *'ClauseIQ provides decision-support estimates, not legal or financial advice. Always seek qualified legal counsel before making decisions based on this analysis.'*

---

## 11. Out of Scope for MVP

> **Do Not Build Until Validated**
> Multi-user / law firm teams and permissions · SSO / enterprise auth · Portfolio-level analysis across multiple leases · API access for third-party integrations · Automated lease drafting or redline suggestions · Lender underwriting module · Billing and subscription management (use manual invoicing for first cohort) · Mobile app · Fine-tuned proprietary model (use RAG + base LLM until corpus reaches 2,000 annotated examples)

---

## 12. Success Metrics

| Metric | Target | Why It Matters |
|---|---|---|
| Clause classification accuracy | ≥ 85% on held-out test set | Below this, lawyers correct more errors than the tool saves them |
| Analysis completion time | ≤ 90 seconds (standard lease, ≤ 60 pages) | Lawyers will not wait longer than this for a first-pass result |
| Economic estimate within acceptable range | ≥ 70% of estimates rated 'reasonable' by pilot lawyers | Key validation metric — lawyers judge estimates against their own experience |
| PDF report used with client | ≥ 60% of analyses result in a downloaded report | Proxy for whether the output is trusted enough to share |
| Lawyer would use again | ≥ 80% in post-pilot survey | Core NPS proxy for MVP validation |
| Leases processed in pilot | 20 real leases across ≥ 3 property types | Minimum to validate clause taxonomy and quantification calibration |

---

## 13. Pilot Approach

The MVP should be validated with a closed pilot of 5–10 commercial real estate lawyers before any public launch. The pilot process has three phases.

| Phase | Duration | Activity |
|---|---|---|
| 1 | Weeks 1–2 | Provide pilot lawyers with 5 pre-selected leases (across industrial, office, and retail) and ask them to run ClauseIQ. Collect structured feedback on every estimate — reasonable / too high / too low — with their own assessment. |
| 2 | Weeks 3–4 | Recalibrate quantification formulas and actuarial assumptions based on pilot feedback. Re-run the same 5 leases and measure improvement. Add lawyer-specific leases (real files they are currently working on). |
| 3 | Weeks 5–8 | Lawyers use ClauseIQ on live files. Collect usage data, download rates, and NPS survey. Identify the clause types with highest error rates for prioritised improvement. |

---

*ClauseIQ · MVP Developer Brief v1.0 · Confidential*
*Questions about this brief should be directed to the product owner before development begins.*
