// Test different regex patterns

const text = "X_3(PO_4)_2 ning molyar massasi";

// Try different patterns
const patterns = [
  { name: 'Pattern 1 (old)', regex: /([A-Z][a-z]?_\d+\([A-Z][a-z]?_\d+\)_\d+)/g },
  { name: 'Pattern 2 (new)', regex: /([A-Z][a-z0-9]*_\d+\([A-Z][a-z0-9]*_\d+\)_\d+)/g },
  { name: 'Pattern 3 (flexible)', regex: /([A-Z]+[a-z0-9]*_\d+\([A-Z]+[a-z0-9]*_\d+\)_\d+)/g },
  { name: 'Pattern 4 (very flexible)', regex: /([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g },
  { name: 'Pattern 5 (simple)', regex: /(\w+_\d+\(\w+_\d+\)_\d+)/g },
];

patterns.forEach(({ name, regex }) => {
  const match = text.match(regex);
  console.log(`${name}:`, match);
});

// Manual test
console.log('\n=== MANUAL BREAKDOWN ===');
console.log('X_3(PO_4)_2');
console.log('X - [A-Z] ✓');
console.log('_3 - _\\d+ ✓');
console.log('(PO_4) - \\([A-Z][A-Za-z0-9]*_\\d+\\) ?');
console.log('  P - [A-Z] ✓');
console.log('  O - [A-Za-z0-9]* ✓');
console.log('  _4 - _\\d+ ✓');
console.log('_2 - _\\d+ ✓');

// Test Pattern 4
const pattern4 = /([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g;
console.log('\n=== PATTERN 4 TEST ===');
console.log('Match:', text.match(pattern4));
