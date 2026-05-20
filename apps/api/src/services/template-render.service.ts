export function renderTemplate(
  body: string,
  variables: Record<string, string | number | undefined>
): string {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
