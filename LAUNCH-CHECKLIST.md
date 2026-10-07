# Nuvei event launch checklist — 6 October 2026

## Confirmed

- Event: 20–21 October 2026; 50 gifts per Singapore calendar day, 100 total; no rollover.
- One gift per normalised email for the entire event. This replaces phone uniqueness.
  The phone number is still required for SMS.
- Travel adaptor; customer name above the socket, up to five letters; fixed Nuvei logo below.
- Fonts: Times New Roman, Segoe Print, Lucida Sans Regular. Final production files pending.
- Workflow: Order received → Engraving → Ready for collection → Collected.
- Approved staff email: siewping.fong@thegiftexpert.com; account not provisioned yet.
- Collection at the Nuvei booth. No cancellation or editing after customer confirmation.
- Keep customer records for future reference. No deletion automation.
- User-created Firebase project tgelive-1b68d is on Spark. Company billing access is outstanding.
- Supplied Airtable base/table are recorded in server integration-config.json.
- Twilio +18142643662 delivered the one authorised Singapore test SMS.
  Angie accepts the Likely-SCAM label; no paid sender registration requested.
- live.thegiftexpert.com is approved as a future address; no DNS changes made.

## Prepared locally, not deployed

- Transactional stock allocation and email uniqueness; safe request retries.
- Authenticated staff queue and audit trail.
- Airtable order mirror; uncertain writes require reconciliation.
- Ready-transition SMS worker; durable attempt guard prevents automatic duplicate sends.
  Sending/Review states require checking Twilio logs; Accepted does not mean Delivered.
- Staff SMS setup/status display. Only blocked, never-attempted SMS can be requeued.
- SMS is deliberately disabled. No provider secrets are in source control.

## Next steps requiring access or input

1. Company billing administrator links the project to approved billing and enables Blaze.
   Do not sign up with a personal card or create a new billing account as a workaround.
2. Enable secure storage and enter AIRTABLE_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET
   privately. Create appropriately scoped credentials; never paste them in chat or Git.
3. Verify Airtable field names/types: Name, Company, Email, Phone, Gift,
   Decoration, Font, Ticket, Status; supported statuses Queued, Decorating, Ready, Collected.
   Preserve existing records and keep its old SMS automation off to avoid duplicate SMS.
4. Provision Firestore and staff authentication; verify the approved staff user,
   then grant the eventStaff claim using trusted administrator tooling.
5. Production confirms engraving dimensions, size, font files and permitted characters.
6. Review customer-facing privacy/retention/SMS notice before publication. Name/font
   confirmation is not a replacement for that notice. Do not introduce marketing consent.
7. Deploy backend only after approval, test using isolated staging records/table,
   and enable SMS only for an explicitly authorised controlled test.
8. Verify duplicate-email contention, final-unit stock, status changes, Airtable mirror,
   SMS failures/ambiguous outcomes, actual cloud authentication, and delivery.
9. Connect the live frontend only after those checks. DNS owner can connect the approved
   subdomain later without replacing the main company website.

Local tests use a deterministic database double, not a Firestore emulator. Cloud trigger,
Node 22 runtime and external-service integration verification remain outstanding.
