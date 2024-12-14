const assert = require('assert');
const { passwordHash, passwordCheck } = require('./auth');

async function runTests() {
  console.log('Starting auth tests...');
  
  try {
    // Test 1: Password hashing
    console.log('Test 1: Password hashing');
    const password = 'testPassword123';
    const hashedPassword = await passwordHash(password);
    assert(hashedPassword && hashedPassword.length > 0, 'Password should be hashed');
    
    // Test 2: Password verification
    console.log('Test 2: Password verification');
    const isValid = await passwordCheck(password, hashedPassword);
    assert(isValid === true, 'Password verification should work');
    
    // Test 3: Invalid password check
    console.log('Test 3: Invalid password check');
    const isInvalid = await passwordCheck('wrongpassword', hashedPassword);
    assert(isInvalid === false, 'Invalid password should not verify');
    
    // Test 4: Empty password handling
    console.log('Test 4: Empty password handling');
    try {
      await passwordHash('');
      assert(false, 'Should throw error for empty password');
    } catch (err) {
      assert(err.message.includes('Invalid password'), 'Should throw invalid password error');
    }
    
    console.log('All tests passed! ');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

runTests();
