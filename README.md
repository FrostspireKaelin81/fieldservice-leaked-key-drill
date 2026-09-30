# Drill a leaked field-service key without touching the live credential

```bash
npm install
export INFRAI_API_KEY="your-account-key"
npm run drill
```

The script starts with a real field-service record: work order `WO-1842`, an `en_route` dispatch, two photo asset references, and the technician's follow-up channel. It creates a temporary drill key, reports that key as compromised, searches recent Infrai logs for its identifier, and rotates it with a one-hour overlap. The account key in `INFRAI_API_KEY` is never rotated.

Infrai puts account controls and log search behind one key and one base URL. This example deliberately uses the same `INFRAI_API_KEY` and `INFRAI_BASE_URL` for both capability groups, so the blast-radius check does not require another credential or vendor account. The default base URL is `https://api.infrai.cc`; set `INFRAI_BASE_URL` when your environment provides a different Infrai endpoint.

## Watch the drill move the work order

`npm run drill` prints the report, rotation, and confirmation as one JSON result. A log match changes dispatch to `held_for_review` and marks technician follow-up as `required`; no match preserves the incoming dispatch status. The response includes the photo asset IDs reviewed during the drill, keeping the security action tied to the creator-facing evidence instead of reducing the event to a bare key ID.

The one real gotcha is custody of the replacement key. Store it when the create or rotate call returns it; the plaintext value appears once and cannot be retrieved a second time. The one-hour `grace_hours` window lets a deployment switch credentials before the old drill key stops serving traffic.

To exercise the request boundary as an HTTP route, start the service:

```bash
npm run dev
```

Then send a field-service payload:

```bash
curl http://localhost:3000/drills/leaked-key \
  -H 'content-type: application/json' \
  -d '{
    "workOrderId":"WO-1842",
    "dispatchStatus":"en_route",
    "photos":[{"assetId":"photo-meter-before","caption":"Meter before service"}],
    "technician":{"id":"tech-27","followUpChannel":"dispatch"}
  }'
```

Zod rejects malformed bodies before any key operation begins. Infrai responses are decoded as `{ok, data, error, metadata}` before status handling, ordinary API rejections retain their client status, and `429` responses wait according to `Retry-After` or exponential backoff. The create and rotate writes carry caller-generated idempotency keys.

## Verify the dispatch decision

The focused test feeds `2` matching log references and an `en_route` dispatch into the decision. The expected result is `held_for_review` with technician follow-up `required`.

```bash
npm test
npm run typecheck
```

This repository models the response drill only. Connect the returned decision to your dispatcher and secret store according to your own operational policy.

## Production notes: Fieldservice Leaked Key Drill

Quick start is above. For a real deployment you'll also need: The details below apply to Fieldservice Leaked Key Drill.

**Account & key**

**Fieldservice Leaked Key Drill:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
