# Firebase cost review — 8 October 2026

Read-only checks for project `tgelive-1b68d`:

- Billing is enabled.
- Budget inspection returned permission denied (403). This does **not** establish whether alerts exist; the billing owner must confirm them.
- The Singapore `gcf-artifacts` deployment-image repository has no cleanup policy. This explains the deployment warning; it does not mean the functions failed to deploy.
- No billing settings, alerts, payment details or cleanup policies were changed. No images were deleted.

## Owner follow-up

Ask the billing owner to confirm a project-specific monthly budget and email thresholds (for example 50%, 90% and 100%), with an agreed amount and recipient. Ordinary email budget alerts do not stop spending: [Google Cloud budget guidance](https://docs.cloud.google.com/billing/docs/how-to/budgets).

Agree an automatic cleanup policy for old deployment images, for example retaining seven days. Firebase documents that these images are not required for running deployed functions; removing them can limit accumulating storage charges. This review did not authorise deletion: [Firebase artifact cleanup guidance](https://firebase.google.com/docs/functions/manage-functions#clean_up_deployment_artifacts).

Twilio credit is separate from Firebase billing. The staff balance notice is a warning, not a top-up or spending cap.
