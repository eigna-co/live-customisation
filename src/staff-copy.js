const mirrorLabel = state => ({
  Pending: 'Waiting to sync', Processing: 'Syncing', Synced: 'Saved',
  Error: 'Not synced — try again', Review: 'Check the existing record before retrying',
}[state] || 'Not synced yet');

const smsLabel = order => {
  if (order.smsState === 'Accepted') return 'Submitted — delivery not yet confirmed';
  if (['Review', 'Sending'].includes(order.smsState)) return 'Check Twilio before resending';
  return ({ Pending: 'Waiting to send', Blocked: 'Not sent — check SMS setup' })[order.smsState] || 'Not sent yet';
};

const staffMessage = error => {
  if (error?.name === 'AbortError' || error?.name === 'TypeError' || !error?.status)
    return 'Could not connect. Please try again.';
  if (/Invalid|Unknown action|Method not allowed|configured|Invalid JSON/i.test(error.message || ''))
    return 'Could not complete this action. Please check the details or contact the event team.';
  return error.message || 'Could not complete this action. Please try again.';
};
module.exports = { mirrorLabel, smsLabel, staffMessage };
