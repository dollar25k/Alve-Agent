export function run(input) {
  // Accept a bare number, numeric string, or { value }.
  let raw = input;
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    raw = input.value;
  }
  if (typeof raw === 'string') raw = raw.trim();
  if (raw === '' || raw === null || raw === undefined) {
    throw new Error('missing input: provide a number or { value }');
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error('invalid input: value must be a finite number');
  if (!Number.isInteger(n)) throw new Error('invalid input: value must be an integer');
  if (!Number.isSafeInteger(n)) throw new Error('invalid input: value out of safe integer range');

  const abs = Math.abs(n);

  const isPrime = (m) => {
    if (m < 2) return false;
    if (m % 2 === 0) return m === 2;
    if (m % 3 === 0) return m === 3;
    for (let i = 5; i * i <= m; i += 6) {
      if (m % i === 0 || m % (i + 2) === 0) return false;
    }
    return true;
  };

  const factors = [];
  for (let i = 1; i <= abs; i++) {
    if (abs % i === 0) factors.push(i);
  }

  const primeFactors = [];
  {
    let m = abs;
    for (let d = 2; d * d <= m; d++) {
      while (m % d === 0) { primeFactors.push(d); m /= d; }
    }
    if (m > 1) primeFactors.push(m);
  }

  const digitSum = String(abs).split('').reduce((s, c) => s + Number(c), 0);
  const properDivisors = factors.filter((f) => f !== abs);
  const divisorSum = properDivisors.reduce((s, f) => s + f, 0);

  return {
    value: n,
    isInteger: true,
    isNegative: n < 0,
    isEven: n % 2 === 0,
    isOdd: n % 2 !== 0,
    isPrime: isPrime(abs),
    isPerfect: abs > 0 && divisorSum === abs,
    digitCount: String(abs).length,
    digitSum,
    factors,
    primeFactors,
    binary: n.toString(2),
    octal: n.toString(8),
    hex: n.toString(16),
    squared: n * n,
    sqrt: Math.sqrt(abs)
  };
}
