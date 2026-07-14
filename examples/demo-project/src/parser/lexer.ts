export function lex(input: string): string[] {
  return input.split(/\s+/).filter((t) => t.length > 0);
}
