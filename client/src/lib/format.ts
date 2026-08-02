export function formatCents(amountInCents: number): string {
  return (amountInCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
