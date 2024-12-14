const bcrypt = require('bcrypt');
const fs = require('fs');
const https = require('https');

const passwordHash = async (password) => {
  const sbcrypt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, sbcrypt);
  try {
    const scrypt = await bcrypt.genSalt(SALT_ROUNDS);
    return await bcrypt.hash(password, scrypt);
  } catch (err) {
    throw new Error('There was an error when hashing password: ' + err.message);
  }
};

const passwordCheck = async (password, hashP) => {
  if (!password || !hashP) {
    throw new Error('Please given password and hash);
  }  
  try {
    return await bcrypt.compare(password, hashP);
  } catch (err) {
    throw new Error('There was an error finding the password: ' + err.message);
  }
};

const sslOptions = {
  try {
    return {
      key: fs.readFileSync('private-key.pem'),
      cert: fs.readFileSync('certificate.pem')
    };
  } catch (err) {
    console.error('Had trouble loading SSL certificates:', err.message);
    console.error('Do the private-key.pem and certificate.pem exist in the root?');
    process.exit(1);
  }
};

module.exports = {
  passwordHash,
  passwordCheck,
  sslOptions: loadSSLCertificates()
};
