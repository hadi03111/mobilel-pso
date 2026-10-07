// One failed module must not block every other shop record.
export function normalizeDataQueries(names, results) {
  const warnings = []
  results.forEach((result, index) => {
    if (result.error) warnings.push(`${names[index]}: ${result.error.message}`)
    result.data = Array.isArray(result.data) ? result.data : []
  })
  return warnings
}
