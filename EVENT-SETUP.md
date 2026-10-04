# Nuvei event configuration

The active event and product rules are in `firebase-functions/event-config.json`.
The browser and both hosting adapters use the same rules. This file is edited in
code; it is not a staff administration screen.

Configured from supplied requirements:
- Nuvei, 20–21 October (year deliberately omitted pending confirmation).
- Black travel adaptor, event allocation 100.
- One to five letters; surrounding whitespace is trimmed, internal spaces,
  numbers and symbols are rejected. Letter casing is preserved. International
  letters are accepted; any narrower character or word restrictions are pending.
- Times New Roman, Segoe Print and Lucida Sans Regular.
- Personalisation above the front three-pin socket, logo below.
- Inter Tight website typography, one of the two requested website fonts.

The supplied product reference image is included unmodified. The name preview
shows the selected text and font next to that reference; it is not a production
engraving proof. Exact font rendering currently depends on fonts installed on
the guest's device. Licensed web font files and matching production fonts are
needed before approving the proof. No fonts were copied from Windows or bundled.

The existing website colours remain provisional. Supply official HEX values and
the Nuvei logo file before finalising branding and the foamboard artwork. The
font size, physical placement template and whether 100 units is shared across
both dates also remain to be confirmed.

## Airtable preparation before publishing

Use the separate event table. Required fields:
`Name`, `Company`, `Email`, `Phone`, `Gift`, `Decoration`, `Font`, `Ticket`, `Status`.
Add `Font` as a text field (or a single-select with the three exact font names).
Allow `travel adaptor` in `Gift` and `Queued` in `Status` if using single-select.
No live Airtable schema changes have been made.

Quantity 100 is event configuration, not a live remaining-stock counter.
Automatic sold-out enforcement and atomic duplicate prevention still require
durable inventory/order coordination. No claimed stock figure is displayed by
default. SMS, staff queue updates and collection confirmation are not implemented
here; the ticket acknowledges the order and directs guests to the event team.

Changes are prepared locally on `migration/firebase-preparation`. No domain
change, deployment, Firebase project creation or billing change has been made.

Verification: 29 automated tests pass, including shared text/font validation,
server-side order fields and hosting adapters. Both production builds succeed.
Browser check: sample guest details, adaptor selection, invalid text blocked,
five-letter text accepted, and font selection/preview confirmed locally. No
test order was submitted to a live service. Cloud runtime verification is pending.
