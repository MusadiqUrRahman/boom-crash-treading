const DerivAPIBasic = require('@deriv/deriv-api/dist/DerivAPIBasic');
const api = new DerivAPIBasic({ app_id: 1089, endpoint: 'ws.binaryws.com' });
const token = require('./config').loadConfig().apiToken;

const timer = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);

api.onOpen().subscribe(() => {
  api.authorize({ authorize: token })
    .then(r => {
      const acct = r.authorize.account_list.find(a => a.loginid === r.authorize.loginid);
      console.log('LoginID:', r.authorize.loginid);
      console.log('Currency:', acct?.currency || 'USD');
      console.log('Virtual:', acct?.is_virtual === 1 ? 'DEMO' : 'REAL');
      console.log('Account type:', acct?.account_type);

      // Fetch balance
      return api.send({ balance: 1, account: r.authorize.loginid });
    })
    .then(b => {
      clearTimeout(timer);
      console.log('Balance:', JSON.stringify(b, null, 2));
      process.exit(0);
    })
    .catch(e => {
      clearTimeout(timer);
      console.log('ERROR:', e.message || JSON.stringify(e));
      process.exit(1);
    });
});

api.onClose().subscribe(() => console.log('CLOSED'));
