const bcrypt = require('bcrypt');
const fs = require('fs');
const https = require('https');

const SALT_ROUNDS = 10;

const passwordHash = async (password) => {
  if (!password || typeof password !== 'string') {
    throw new Error('Invalid password provided');
  }
  
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return await bcrypt.hash(password, salt);
  } catch (err) {
    throw new Error('Error hashing password: ' + err.message);
  }
};

const passwordCheck = async (password, hashP) => {
  if (!password || !hashP) {
    throw new Error('Password and hash must be provided');
  }
  
  try {
    return await bcrypt.compare(password, hashP);
  } catch (err) {
    throw new Error('Error comparing passwords: ' + err.message);
  }
};

const loadSSLCertificates = () => {
  try {
    return {
      key: fs.readFileSync('private-key.pem'),
      cert: fs.readFileSync('certificate.pem')
    };
  } catch (err) {
    console.error('Error loading SSL certificates:', err.message);
    console.error('Ensure private-key.pem and certificate.pem exist in the root directory');
    process.exit(1);
  }
};

module.exports = {
  passwordHash,
  passwordCheck,
  sslOptions: loadSSLCertificates()
};
