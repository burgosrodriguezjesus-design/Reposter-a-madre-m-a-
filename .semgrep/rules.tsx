// Casos de prueba JSX de .semgrep/rules.yml: `semgrep --test .semgrep/`
export function Unsafe({ html }: { html: string }) {
  // ruleid: reposteria.dangerously-set-inner-html
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Safe({ text }: { text: string }) {
  // ok: reposteria.dangerously-set-inner-html
  return <p className="x">{text}</p>;
}
