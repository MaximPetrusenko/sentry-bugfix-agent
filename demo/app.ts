/**
 * Demo Express app with intentional bugs for end-to-end testing.
 *
 * Bug 1 (TypeError): divide() does not guard against division by zero,
 * causing an unhandled error when denominator is 0.
 *
 * Bug 2 (ReferenceError): getUser() references an undefined variable.
 *
 * Bug 3 (Logic): calculateDiscount() applies discount incorrectly
 * (multiplies instead of divides by 100).
 */
import express from 'express';

export const app = express();
app.use(express.json());

// Bug 1: Unguarded division by zero → TypeError in caller
export function divide(numerator: number, denominator: number): number {
  // Missing: if (denominator === 0) throw new Error('Division by zero');
  return numerator / denominator;
}

// Bug 2: ReferenceError — `users` is not defined in this scope
export function getUser(id: string): { id: string; name: string } | undefined {
  // @ts-expect-error intentional bug: `users` is not defined
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return (users as Array<{ id: string; name: string }>).find((u) => u.id === id);
}

// Bug 3: Logic error — discount should be price * (discountPercent / 100)
export function calculateDiscount(price: number, discountPercent: number): number {
  // Wrong: multiplies by percentage instead of converting to fraction
  return price * discountPercent;
}

app.get('/divide', (req, res) => {
  const a = Number(req.query['a']);
  const b = Number(req.query['b']);
  try {
    const result = divide(a, b);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/user/:id', (req, res) => {
  try {
    const user = getUser(req.params['id'] ?? '');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/discount', (req, res) => {
  const price = Number(req.query['price']);
  const discount = Number(req.query['discount']);
  res.json({ discountedPrice: calculateDiscount(price, discount) });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env['PORT'] ?? 4000);
  app.listen(port, () => {
    console.log(`[demo-app] Listening on http://localhost:${port}`);
    console.log('[demo-app] Try these buggy endpoints:');
    console.log(`  GET http://localhost:${port}/divide?a=10&b=0  (division by zero)`);
    console.log(`  GET http://localhost:${port}/user/1           (ReferenceError)`);
    console.log(`  GET http://localhost:${port}/discount?price=100&discount=20  (wrong calculation)`);
  });
}
