# Nuvei event — staff quick guide

Customer website: https://tge-live.netlify.app/

Staff queue: https://tge-live.netlify.app/?staff=1

## Before opening the booth

1. Display the customer QR code. Scan it with a phone to confirm it opens the customer website before printing multiple copies.
2. Sign in to the staff queue using your approved, verified staff account. Firebase Authentication is for managing accounts, not viewing orders.
3. Confirm the queue loads and check any SMS balance warning. Do not share your password.

Orders open on 20–21 October 2026: 50 gifts each day, one gift per email across the event. The closed-order message before those dates is expected.

## Handle an order

1. Check the order reference, engraving text and chosen font.
2. Select **Start engraving** when production begins.
3. Select **Mark ready** when the gift can be collected. This automatically requests the collection SMS. Submitted does not mean delivery has been confirmed.
4. At the booth, check the customer's order reference and hand over the correct gift. Select **Confirm collected** after handover.

Workflow: Order received → Engraving → Ready for collection → Collected.

The customer's QR opens the order form; submitting the form creates the record in the staff queue. Scanning alone does not create an order. Customers receive an order reference after submission.

## Refresh and warnings

- The queue refreshes automatically. **Refresh** checks for updates; it does not send another SMS.
- A light-red balance warning appears at US$5 or below. It does not automatically top up Twilio.
- If the balance is unavailable, check the Twilio console rather than assuming the balance is zero.
- Do not repeatedly retry an SMS whose result is uncertain. Check its delivery log first.
- Update order statuses in the staff website. Airtable mirrors the website; editing its Status field is not a substitute for a staff action here.

## Keep test records separate

Do not produce or count these labelled rehearsal records as gifts:

- `TEST-AIRTABLE-20261008` — INTEGRATION TEST - NOT A GIFT ORDER.
- `NU·5265A58B3B` — REHEARSAL TEST - NOT A GIFT ORDER.

Keep customer records for the approved future-reference purpose. Avoid sharing screenshots containing customer email addresses or phone numbers.

Two Airtable views are available: [Test records](https://airtable.com/appdvB1aUSC8Q0Z2T/tblj0ReKCFJmEf9x3/viwRgtKYnbZI8dGVy) and [Orders - excluding tests](https://airtable.com/appdvB1aUSC8Q0Z2T/tblj0ReKCFJmEf9x3/viwzukR8rJxZz72gk). They separate records using the label `TEST - NOT A GIFT ORDER` in Name. The original Grid view still contains everything. The non-test view also contains older records; its row count is not this event's stock total. Clearly label any future rehearsal records the same way.
