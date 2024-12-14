const bcrypt = require('bcrypt');
const fs = require('fs');
const https = require('https');

const passwordHash = async (password) => {
  const sbcrypt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, sbcrypt);
};

const passwordCheck = async (password, hashP) => {
  return await bcrypt.compare(password, hashP);
};

const sslOptions = {
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem')
};

module.exports = {
  passwordHash,
  passwordCheck,
  sslOptions
};
