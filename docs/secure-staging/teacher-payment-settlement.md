# Teacher payment form and atomic settlement — 2026-11-20

The original form allowed selecting a teacher service in a different currency, then sent an invalid direct payment link that the existing server correctly rejected. The reviewed form now shows the settlement rate, a converted-value preview and explicit confirmation when the chosen service uses a different currency.

After confirmation it prepares exactly one new teacher payment without an invalid cross-currency direct link, plus one settlement referring to that payment and the chosen service. Both records use the existing atomic `/api/save` transaction and request-id replay protection. Server ownership, rate, balance, duplicate and settlement validation remain unchanged. The form checks remaining obligation/category amounts before mutation, blocks missing rates and excess settlement, and resets confirmation when the relevant entered values change. Existing payment editing continues through the original form; historical payments/settlements are not rewritten.

Same-currency payments retain their direct link and do not create a settlement. Payments with no selected service retain the original category/advance behavior. A base-currency target can prefill the displayed settlement rate from the entered payment-to-base rate; other target currencies require an explicit rate rather than a guessed conversion.

Integration preserves `aplus-preview/original/` unchanged: the server runtime injects the client-only form through an adapter, and the secure engine embeds its source. No database schema change, migration, credential or real local database is part of this commit. Historical settlements recorded on the owner's local 3000 instance are intentionally not uploaded.

Validation: 22 synthetic planner checks, plus original-engine integration checks for served UI, atomic payment/settlement save, one deduction, preserved historical records and idempotent replay. The 86 secure gateway checks and 21 cash-flow checks also pass. The full secure build also passed, including server-only engine/WASM finalization. This update does not publish or approve production release.
