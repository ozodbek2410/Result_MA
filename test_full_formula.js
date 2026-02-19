// Test full formula matching

const text1 = "CH_4 va C_3H_8 dan iborat";
const text2 = "H_2SO_3 tarkibidagi protonlar";
const text3 = "NH_3 da nechta atom";

// New pattern: match full formula
const pattern = /((?:[A-Z][A-Za-z0-9]*_\d+)+)|(\d+)\^(\d+|{[^}]+})|\\cdot/g;

console.log('=== TEST 1 ===');
console.log('Text:', text1);
console.log('Matches:', text1.match(pattern));

console.log('\n=== TEST 2 ===');
console.log('Text:', text2);
console.log('Matches:', text2.match(pattern));

console.log('\n=== TEST 3 ===');
console.log('Text:', text3);
console.log('Matches:', text3.match(pattern));

// Expected:
// CH_4 → ['CH_4']
// C_3H_8 → ['C_3H_8']
// H_2SO_3 → ['H_2SO_3']
// NH_3 → ['NH_3']
